"""Export use case: orchestrates Remotion render via subprocess.

Pipeline:
1. Read playbook from RunRepository.
2. (with_audio) Pre-generate per-step mp3 via the configured TTS provider
   (see ``app.infrastructure.tts`` for the vendor dialects),
   then re-stretch each step's end_frame to match audio duration.
3. Write inputProps.json next to a per-job tmp dir.
4. Spawn the local Remotion CLI and stream stdout/stderr for progress.
5. On success, store output mp4 path in the export repo.
"""

from __future__ import annotations

import asyncio
import contextlib
import functools
import json
import logging
import math
import os
import shutil
import subprocess
import threading
import wave
from collections import deque
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import quote

import httpx

from app.application.ports.director_repository import IRunDirectorRepository
from app.application.ports.export_repository import IExportJobRepository
from app.application.ports.run_repository import IRunRepository
from app.domain.models.director import DirectorScript
from app.domain.models.export_job import (
    ExportAssetReport,
    ExportJobStatus,
    ExportOptions,
    TtsConfig,
)
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import PlaybookScript
from app.domain.models.quality_report import QualityReport
from app.domain.models.review import PlaybookIssueSeverity, PlaybookReviewIssue
from app.domain.services.director_builder import (
    build_default_director,
    remap_director_beats_to_playbook,
)
from app.domain.services.playbook_quality import (
    playbook_review_verdict_from_issues,
    quality_gate_playbook,
)
from app.infrastructure.tts import (
    WEBSOCKET_DIALECT,
    build_tts_request,
    looks_like_audio,
    post_with_retry,
    resolve_base_url,
    response_audio,
    synthesize_over_websocket,
    to_spoken,
)

_RENDER_TAIL_LINES = 40


class _ExportAudioRequestHandler(SimpleHTTPRequestHandler):
    """Serve TTS audio over loopback HTTP for the Remotion renderer.

    Remotion downloads every media asset over HTTP during render (its
    ``readFile`` only accepts http:// / https://), so file paths or file://
    URLs in ``audioFiles`` cannot work (#244). The use case therefore runs a
    short-lived server on 127.0.0.1 for the duration of the render.
    """

    def log_message(self, fmt: str, *args: Any) -> None:
        # Keep render logs readable: route per-request access lines to debug.
        logger.debug("audio-serve: " + fmt, *args)


@contextlib.contextmanager
def _serve_audio_files(audio_files: list[str]) -> Iterator[list[str]]:
    """Yield ``audioFiles`` entries as http://127.0.0.1:<port>/<name> URLs.

    The server lives exactly as long as the ``with`` block (i.e. the Remotion
    subprocess render), is bound to a random loopback port, and is shut down
    on every exit path. Entries without audio ("") pass through unchanged.
    """

    non_empty = [p for p in audio_files if p]
    if not non_empty:
        yield audio_files
        return
    audio_dir = Path(non_empty[0]).parent
    handler = functools.partial(_ExportAudioRequestHandler, directory=str(audio_dir))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    httpd.daemon_threads = True
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    host, port = httpd.server_address
    base_url = f"http://{host}:{port}"
    logger.info("serving export audio to remotion at %s", base_url)
    try:
        yield [f"{base_url}/{quote(Path(p).name)}" if p else "" for p in audio_files]
    finally:
        httpd.shutdown()
        httpd.server_close()
        logger.info("export audio server stopped")

_QUALITY_TO_DIMENSIONS: dict[str, tuple[int, int]] = {
    "720p": (1280, 720),
    "1080p": (1920, 1080),
    "2k": (2560, 1440),
}
_FORMAT_TO_EXTENSION: dict[str, str] = {"mp4": "mp4", "webm": "webm", "gif": "gif"}

logger = logging.getLogger(__name__)


class ExportVideoUseCase:
    def __init__(
        self,
        export_repo: IExportJobRepository,
        run_repo: IRunRepository,
        director_repo: IRunDirectorRepository,
        web_app_dir: Path,
        artifacts_dir: Path,
        template_playbooks_dir: Path | None = None,
    ) -> None:
        self._exports = export_repo
        self._runs = run_repo
        self._directors = director_repo
        self._web_dir = web_app_dir
        self._artifacts = artifacts_dir
        self._templates = template_playbooks_dir
        self._artifacts.mkdir(parents=True, exist_ok=True)

    def _load_template_playbook(self, case_id: str) -> PlaybookScript:
        """Resolve a frozen public template case to its playbook.

        The id is matched against the curated directory's file names, so a
        caller can only render lessons this deployment actually ships — path
        traversal and arbitrary client payloads are both impossible.
        """

        if self._templates is None:
            raise ValueError("template exports are not configured for this deployment")
        if not case_id or not all(ch.isalnum() or ch in "-_" for ch in case_id):
            raise ValueError(f"Template case id {case_id!r} is not a valid case id")
        path = self._templates / f"{case_id}.playbook.json"
        if not path.is_file():
            raise ValueError(f"Template case {case_id!r} has no frozen playbook to export")
        return PlaybookScript.model_validate_json(path.read_text(encoding="utf-8"))

    def _build_export_quality_report(
        self,
        playbook: PlaybookScript,
        run: Any,
    ) -> QualityReport:
        previous_quality = run.quality_report
        current_quality = quality_gate_playbook(
            playbook,
            run.prompt,
            generator_path=(
                previous_quality.generator_path if previous_quality else "export_recheck"
            ),
            coverage_decision=getattr(run, "coverage_decision", None),
            lesson_plan=getattr(run, "lesson_plan", None),
            coverage_mode=(
                run.coverage_decision.mode
                if getattr(run, "coverage_decision", None) is not None
                else (previous_quality.coverage_mode if previous_quality else "unknown")
            ),
        )
        return _merge_export_quality(previous_quality, current_quality)

    async def execute(
        self,
        job_id: str,
        run_id: str,
        with_audio: bool,
        tts: TtsConfig | None,
        options: ExportOptions | None = None,
        version_id: str | None = None,
        template_case_id: str | None = None,
    ) -> None:
        try:
            run = None
            director = None
            update_quality_report = None
            if template_case_id is not None:
                # Frozen public template: a curated, already-reviewed script
                # with no run, no versions and no DirectorScript. The quality
                # gate is a run-level concept, so it does not apply here.
                playbook_model = self._load_template_playbook(template_case_id)
            else:
                run = await self._runs.get(run_id)
                if run is None or run.playbook is None:
                    raise ValueError(f"Run {run_id!r} has no playbook to export")
                if run.status != PipelineRunStatus.SUCCEEDED:
                    raise ValueError(f"Run {run_id!r} is not in succeeded state")
            if template_case_id is None and version_id is not None:
                playbook_json = await self._runs.get_version_playbook(run_id, version_id)
                if playbook_json is None:
                    raise ValueError(
                        f"Version {version_id!r} not found for run {run_id!r}"
                    )
                playbook_model = PlaybookScript.model_validate_json(playbook_json)
            elif template_case_id is None:
                playbook_model = run.playbook
            if run is not None:
                update_quality_report = getattr(self._runs, "update_quality_report", None)
            job = await self._exports.get(job_id)

            playbook = playbook_model.model_dump()
            try:
                director = (
                    None
                    if template_case_id is not None
                    else await self._get_export_director(
                        run_id,
                        version_id=version_id,
                        playbook=playbook_model,
                        rebuild_if_missing=_quality_has_director_persistence_failure(run),
                    )
                )
            except Exception as exc:  # noqa: BLE001 - export must fail closed on Director I/O.
                director_quality = self._build_export_quality_report(
                    playbook_model, run
                ).with_issue(
                    PlaybookReviewIssue(
                        code="director.persistence_failed",
                        severity=PlaybookIssueSeverity.ERROR,
                        path="director",
                        message=f"DirectorScript could not be loaded for export: {exc}",
                        suggestion="Restore Director persistence before retrying export.",
                        requires_repair=False,
                    ),
                    action="export:director_load_failed",
                )
                if callable(update_quality_report):
                    await update_quality_report(run_id, director_quality.model_dump_json())
                raise ValueError(
                    f"Run {run_id!r} cannot export without its persisted DirectorScript"
                ) from exc
            opts = options or ExportOptions()
            if opts.tempo != 1.0:
                if with_audio:
                    raise ValueError(
                        "tempo requires with_audio=False: generated narration "
                        "defines its own pacing"
                    )
                playbook = _apply_tempo(playbook, opts.tempo)
                if director is not None:
                    # Scaling moves step boundaries exactly like the audio
                    # stretch does; re-align beat frames the same way.
                    director = remap_director_beats_to_playbook(
                        director, playbook_model, playbook
                    )

            job_dir = self._artifacts / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            audio_files: list[str] = []

            if with_audio:
                if tts is None:
                    raise ValueError("with_audio=True requires a tts config")
                await self._exports.update(
                    job_id,
                    status=ExportJobStatus.GENERATING_AUDIO,
                    progress=0.05,
                    message="生成配音中…",
                )
                audio_dir = job_dir / "audio"
                audio_dir.mkdir(exist_ok=True)
                audio_files = await self._generate_step_audio(playbook, tts, audio_dir)
                # Re-stretch end_frames so each step lasts ≥ its audio
                playbook = _stretch_end_frames(playbook, audio_files)
                if director is not None:
                    # Stretching moves step boundaries; re-align beat frames to
                    # the stretched timeline so camera beats stay in sync (#237).
                    director = remap_director_beats_to_playbook(
                        director, playbook_model, playbook
                    )

            # Recheck export readiness against the final timeline: after audio
            # stretch, step durations are driven by measured audio lengths, not
            # char-rate estimates, so frame-dependent conclusions (e.g.
            # timeline.voiceover_too_short) must reflect what will actually
            # render (#240).
            export_quality = (
                None
                if run is None
                else self._build_export_quality_report(
                    PlaybookScript.model_validate(playbook), run
                )
            )
            if export_quality is not None:
                if export_quality.status == "repairable":
                    export_quality = export_quality.with_issue(
                        PlaybookReviewIssue(
                            code="export.not_ready",
                            severity=PlaybookIssueSeverity.ERROR,
                            path="playbook",
                            message="Export readiness recheck found unresolved quality errors.",
                            suggestion="Repair the PlaybookScript before starting export.",
                            requires_repair=False,
                        ),
                        action="export:blocked",
                    )
                if callable(update_quality_report):
                    await update_quality_report(run_id, export_quality.model_dump_json())
                if export_quality.status in {"repairable", "blocked"}:
                    codes = ", ".join(issue.code for issue in export_quality.issues[:5])
                    raise ValueError(f"Run {run_id!r} is not export-ready: {codes}")

            # Remotion downloads media assets over HTTP, so audio must be
            # reachable as http:// URLs for the whole render (#244).
            with _serve_audio_files(audio_files) as served_audio:
                input_props = {
                    "script": playbook,
                    "theme": opts.theme,
                    "showSubtitles": True,
                    "audioFiles": served_audio,
                }
                if director is not None:
                    input_props["director"] = director.model_dump()
                props_path = job_dir / "inputProps.json"
                props_path.write_text(json.dumps(input_props), encoding="utf-8")

                # Resolve render options (issue #14). Defaults preserve historical
                # 1080p/30fps/mp4 behavior so existing callers keep working.
                extension = _FORMAT_TO_EXTENSION.get(opts.format, "mp4")
                output_path = job_dir / f"video.{extension}"

                await self._exports.update(
                    job_id,
                    status=ExportJobStatus.RENDERING,
                    progress=0.15,
                    message=f"渲染中…（{opts.quality} {opts.fps}fps {opts.format.upper()}）",
                )

                await self._run_remotion_render(job_id, props_path, output_path, opts)

            asset_report_path = None
            if job is not None and job.asset_report is not None:
                asset_report_path = _write_asset_report_sidecar(
                    job_dir,
                    job_id=job_id,
                    run_id=run_id,
                    asset_report=job.asset_report,
                )

            await self._exports.update(
                job_id,
                status=ExportJobStatus.COMPLETED,
                progress=1.0,
                message="完成",
                output_path=str(output_path),
                asset_report_path=str(asset_report_path) if asset_report_path else None,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("export job %s failed", job_id)
            await self._exports.update(
                job_id,
                status=ExportJobStatus.FAILED,
                error=str(exc),
            )

    async def _get_export_director(
        self,
        run_id: str,
        *,
        version_id: str | None,
        playbook: PlaybookScript,
        rebuild_if_missing: bool = False,
    ) -> DirectorScript | None:
        if version_id is not None:
            director_json = await self._runs.get_version_director(run_id, version_id)
            if director_json is None:
                return build_default_director(playbook, run_id)
            return DirectorScript.model_validate_json(director_json)
        director = await self._directors.get(run_id)
        if director is None and rebuild_if_missing:
            # Only rebuild when the run reported a persistence failure (#235);
            # runs that never had a director keep the historical no-director
            # behaviour instead of silently changing camera motion.
            return build_default_director(playbook, run_id)
        return director

    async def _generate_step_audio(
        self,
        playbook: dict[str, Any],
        tts: TtsConfig,
        audio_dir: Path,
    ) -> list[str]:
        # Issue #40: fall back to server-side TTS settings when the caller
        # omits api_key / base_url / model so the client never has to ship a
        # secret. The playback path already routes through /api/v1/tts/speech
        # for the same reason.
        from app.config import get_settings

        settings = get_settings()
        api_key = (tts.api_key or settings.tts_api_key or settings.openai_api_key or "").strip()
        if not api_key:
            raise RuntimeError("TTS not configured: set METAVIEW_TTS_API_KEY (or pass tts.api_key)")
        provider = tts.provider or settings.tts_provider
        base_url = resolve_base_url(provider, tts.base_url or settings.tts_base_url)
        model = tts.model or settings.tts_model
        app_id = tts.app_id or settings.tts_app_id
        cluster = tts.cluster or settings.tts_cluster
        voice = tts.voice or settings.tts_default_voice

        steps = playbook.get("steps", [])
        files: list[str] = []
        async with httpx.AsyncClient(timeout=120.0) as client:
            for i, step in enumerate(steps):
                text = (step.get("voiceover_text") or "").strip()
                if not text:
                    files.append("")
                    continue
                audio_path = audio_dir / f"step_{i:03d}.mp3"
                # Narration is typeset for the screen (b²=a²−c², √, F₁, θ=30°)
                # and speech engines do not share that lexicon — they drop √
                # outright and read ² as a bare "二". Only the synthesizer gets
                # the spoken rewrite; the playbook keeps its typographic text
                # for subtitles and the canvas.
                if provider.strip().lower() == WEBSOCKET_DIALECT:
                    # 火山 v3 speaks WebSocket, not HTTP: one framed session
                    # per line, audio streamed back in chunks and joined.
                    audio = await synthesize_over_websocket(
                        text=to_spoken(text),
                        api_key=api_key,
                        speaker=voice,
                        resource_id=settings.tts_resource_id,
                        timeout_s=settings.tts_timeout_s,
                    )
                else:
                    call = build_tts_request(
                        provider=provider,
                        base_url=base_url,
                        api_key=api_key,
                        model=model,
                        voice=voice,
                        text=to_spoken(text),
                        app_id=app_id,
                        cluster=cluster,
                        resource_id=settings.tts_resource_id,
                    )
                    resp = await post_with_retry(client, call, label=f"step {i}")
                    if resp.status_code >= 400:
                        raise RuntimeError(
                            f"TTS HTTP {resp.status_code} for step {i}: {resp.text[:200]}"
                        )
                    audio, audio_url = response_audio(resp, f"step {i}")
                    if audio is None and audio_url is not None:
                        # Provider handed back a link instead of the bytes; it
                        # is the operator's own configured vendor, so fetch it.
                        fetched = await client.get(audio_url)
                        if fetched.status_code >= 400:
                            raise RuntimeError(
                                f"TTS audio download HTTP {fetched.status_code} for step {i}"
                            )
                        audio = fetched.content
                if not audio or not looks_like_audio(audio):
                    raise RuntimeError(
                        f"TTS payload for step {i} is not a recognizable audio container"
                    )
                audio_path.write_bytes(audio)
                files.append(str(audio_path))
        return files

    async def _run_remotion_render(
        self,
        job_id: str,
        props_path: Path,
        output_path: Path,
        options: ExportOptions,
    ) -> None:
        # Codec is picked from the desired container; Remotion ships h264/vp8/gif.
        codec = {"mp4": "h264", "webm": "vp8", "gif": "gif"}.get(options.format, "h264")
        width, height = _QUALITY_TO_DIMENSIONS.get(options.quality, (1920, 1080))
        remotion_bin = _resolve_remotion_bin(self._web_dir)
        cmd = [
            str(remotion_bin),
            "render",
            "src/remotion/index.ts",
            "playbook",
            str(output_path),
            "--props",
            str(props_path),
            "--log",
            "info",
            "--codec",
            codec,
            "--width",
            str(width),
            "--height",
            str(height),
            "--frames-per-second",
            str(options.fps),
        ]
        # REMOTION_BROWSER_EXECUTABLE is a Node-API option; the CLI only reads
        # the flag. Without it Remotion insists on downloading its own Chromium
        # from remotion.media, which fails wherever that host is slow, blocked
        # or firewalled — so an air-gapped or GFW-side deployment could never
        # export at all.
        browser = os.environ.get("REMOTION_BROWSER_EXECUTABLE", "").strip()
        if browser:
            cmd += ["--browser-executable", browser]
        env = os.environ.copy()
        env.setdefault("NODE_ENV", "production")

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=str(self._web_dir),
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(f"failed to spawn remotion CLI ({cmd[0]}): {exc}") from exc

        if proc.stdout is None:
            raise RuntimeError("remotion subprocess has no stdout stream")
        tail: deque[str] = deque(maxlen=_RENDER_TAIL_LINES)
        async for raw in proc.stdout:
            line = raw.decode("utf-8", errors="replace").rstrip()
            if not line:
                continue
            logger.info("[render %s] %s", job_id, line)
            tail.append(line)
            progress = _parse_render_progress(line)
            if progress is not None:
                # 0.15 → 0.95 maps onto Remotion's own 0..1 progress
                await self._exports.update(
                    job_id,
                    progress=0.15 + progress * 0.80,
                )

        rc = await proc.wait()
        if rc != 0:
            detail = "\n".join(tail) if tail else "(no output captured)"
            raise RuntimeError(
                f"remotion render exited with code {rc}\n--- last {len(tail)} lines ---\n{detail}"
            )
        if not output_path.exists():
            raise RuntimeError("render finished but output file missing")


def _parse_render_progress(line: str) -> float | None:
    # Remotion CLI emits lines like "Rendered frames 123/456" or "  43%"
    import re

    m = re.search(r"(\d+)\s*/\s*(\d+)\s+frames?", line, flags=re.IGNORECASE)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if b > 0:
            return min(1.0, a / b)
    m = re.search(r"(\d{1,3})%", line)
    if m:
        return min(1.0, int(m.group(1)) / 100.0)
    return None


def _resolve_remotion_bin(web_dir: Path) -> Path:
    binary = "remotion.cmd" if os.name == "nt" else "remotion"
    candidates = [
        web_dir / "node_modules" / ".bin" / binary,
        web_dir.parent.parent / "node_modules" / ".bin" / binary,
    ]
    found = shutil.which("remotion")
    if found:
        candidates.append(Path(found))
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise RuntimeError(
        "remotion CLI not found; run npm install for the web workspace or include "
        "node_modules/.bin/remotion in the deployment image"
    )


def _write_asset_report_sidecar(
    job_dir: Path,
    *,
    job_id: str,
    run_id: str,
    asset_report: ExportAssetReport,
) -> Path:
    report_path = job_dir / "asset-report.json"
    payload = {
        "job_id": job_id,
        "run_id": run_id,
        "asset_report": asset_report.model_dump(mode="json"),
    }
    report_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return report_path


def _apply_tempo(playbook: dict[str, Any], tempo: float) -> dict[str, Any]:
    """Scale the timeline for silent exports: tempo 2.0 = double speed.

    End frames divide by tempo with a strictly monotonic floor of one frame
    per step, so extreme tempos cannot collapse steps into zero length;
    total_frames follows the last step.
    """

    scaled = dict(playbook)
    steps = [dict(step) for step in playbook.get("steps", [])]
    previous_end = 0
    for step in steps:
        target = round(step["end_frame"] / tempo)
        step["end_frame"] = max(previous_end + 1, target)
        previous_end = step["end_frame"]
    scaled["steps"] = steps
    if steps:
        scaled["total_frames"] = steps[-1]["end_frame"]
    return scaled


def _stretch_end_frames(playbook: dict[str, Any], audio_files: list[str]) -> dict[str, Any]:
    fps = int(playbook.get("fps", 30))
    steps = playbook.get("steps", [])
    original_ends = [step["end_frame"] for step in steps]
    cumulative = 0
    for i, step in enumerate(steps):
        prev_end_original = original_ends[i - 1] if i > 0 else 0
        current_end_original = original_ends[i]
        animation_frames = max(1, current_end_original - prev_end_original)
        audio_frames = 0
        path = audio_files[i] if i < len(audio_files) else ""
        if path:
            duration_s = _probe_audio_duration_seconds(Path(path))
            if duration_s > 0:
                audio_frames = math.ceil(duration_s * fps)
        # Step length = max(animation, audio); leaves a small tail when audio
        # is shorter so animation has time to finish.
        new_duration = max(animation_frames, audio_frames)
        cumulative += new_duration
        step["end_frame"] = cumulative
    playbook["total_frames"] = max(1, cumulative)
    return playbook


# Warnings whose verdict depends on frame counts that audio stretching can
# change (currently only timeline.voiceover_too_short). The export recheck runs
# on the final stretched timeline, so its instances are authoritative for these
# codes; re-merging the pre-stretch ones would resurrect stale frame numbers in
# the export report (#245). Intentionally narrow: stretch-independent warnings
# (snapshot.narration_mismatch, step.too_shallow, ...) keep their
# preserve-on-merge semantics.
_FRAME_DEPENDENT_WARNING_CODES: frozenset[str] = frozenset(
    {"timeline.voiceover_too_short"}
)


def _quality_has_director_persistence_failure(run: Any) -> bool:
    """True when the run's persisted quality report recorded a director
    persistence failure (#235), so export knows it may rebuild the default
    director instead of treating a missing one as the historical no-director
    state.
    """
    quality = getattr(run, "quality_report", None)
    return bool(
        quality
        and any(issue.code == "director.persistence_failed" for issue in quality.issues)
    )


def _merge_export_quality(
    previous: QualityReport | None,
    current: QualityReport,
) -> QualityReport:
    if previous is None:
        current.actions = [*current.actions, f"export:readiness:{current.status}"]
        return current

    unique: dict[tuple[str, str, str], PlaybookReviewIssue] = {}
    previous_warnings = [
        issue
        for issue in previous.issues
        if issue.severity == PlaybookIssueSeverity.WARNING
        and issue.code not in _FRAME_DEPENDENT_WARNING_CODES
    ]
    for issue in [*previous_warnings, *current.issues]:
        unique[(issue.code, issue.path, issue.message)] = issue
    verdict = playbook_review_verdict_from_issues(
        list(unique.values()),
        clean_summary="Export readiness recheck passed.",
        warning_summary="Export readiness recheck passed with warnings.",
        blocked_summary="Export readiness recheck failed.",
        actions=[*previous.actions, *current.actions, f"export:readiness:{current.status}"],
    )
    return QualityReport.from_review_verdict(
        verdict,
        generator_path=previous.generator_path,
        coverage_mode=current.coverage_mode,
        attempts=previous.attempts,
    )


def _probe_audio_duration_seconds(path: Path) -> float:
    """Best-effort duration probe.

    Tries ``ffprobe`` first; falls back to wave (only for .wav files); returns
    0 if undetectable so caller falls back to animation duration.
    """

    if shutil.which("ffprobe"):
        try:
            out = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=nw=1:nk=1",
                    str(path),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=30,
            ).stdout.strip()
            return float(out)
        except (subprocess.SubprocessError, ValueError):
            pass
    if path.suffix.lower() == ".wav":
        try:
            with wave.open(str(path), "rb") as w:
                frames = w.getnframes()
                rate = w.getframerate()
                if rate > 0:
                    return frames / rate
        except wave.Error:
            pass
    return 0.0
