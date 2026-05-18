"""Export use case: orchestrates Remotion render via subprocess.

Pipeline:
1. Read playbook from RunRepository.
2. (with_audio) Pre-generate per-step mp3 via OpenAI-compatible TTS,
   then re-stretch each step's end_frame to match audio duration.
3. Write inputProps.json next to a per-job tmp dir.
4. Spawn ``npx remotion render`` and stream stdout/stderr for progress.
5. On success, store output mp4 path in the export repo.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import shutil
import subprocess
import wave
from collections import deque
from pathlib import Path
from typing import Any

import httpx

from app.application.ports.export_repository import IExportJobRepository
from app.application.ports.run_repository import IRunRepository
from app.domain.models.export_job import ExportJobStatus, ExportOptions, TtsConfig

_RENDER_TAIL_LINES = 40

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
        web_app_dir: Path,
        artifacts_dir: Path,
    ) -> None:
        self._exports = export_repo
        self._runs = run_repo
        self._web_dir = web_app_dir
        self._artifacts = artifacts_dir
        self._artifacts.mkdir(parents=True, exist_ok=True)

    async def execute(
        self,
        job_id: str,
        run_id: str,
        with_audio: bool,
        tts: TtsConfig | None,
        options: ExportOptions | None = None,
    ) -> None:
        try:
            run = await self._runs.get(run_id)
            if run is None or run.playbook is None:
                raise ValueError(f"Run {run_id!r} has no playbook to export")

            playbook = run.playbook.model_dump()

            job_dir = self._artifacts / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            audio_files: list[str] = []

            if with_audio:
                if tts is None:
                    raise ValueError("with_audio=True requires a tts config")
                self._exports.update(
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

            input_props = {
                "script": playbook,
                "theme": "dark",
                "showSubtitles": True,
                "audioFiles": audio_files,
            }
            props_path = job_dir / "inputProps.json"
            props_path.write_text(json.dumps(input_props), encoding="utf-8")

            # Resolve render options (issue #14). Defaults preserve historical
            # 1080p/30fps/mp4 behavior so existing callers keep working.
            opts = options or ExportOptions()
            extension = _FORMAT_TO_EXTENSION.get(opts.format, "mp4")
            output_path = job_dir / f"video.{extension}"

            self._exports.update(
                job_id,
                status=ExportJobStatus.RENDERING,
                progress=0.15,
                message=f"渲染中…（{opts.quality} {opts.fps}fps {opts.format.upper()}）",
            )

            await self._run_remotion_render(job_id, props_path, output_path, opts)

            self._exports.update(
                job_id,
                status=ExportJobStatus.COMPLETED,
                progress=1.0,
                message="完成",
                output_path=str(output_path),
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("export job %s failed", job_id)
            self._exports.update(
                job_id,
                status=ExportJobStatus.FAILED,
                error=str(exc),
            )

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
            raise RuntimeError(
                "TTS not configured: set METAVIEW_TTS_API_KEY (or pass tts.api_key)"
            )
        base_url = (tts.base_url or settings.tts_base_url).rstrip("/")
        model = tts.model or settings.tts_model

        steps = playbook.get("steps", [])
        files: list[str] = []
        async with httpx.AsyncClient(timeout=120.0) as client:
            for i, step in enumerate(steps):
                text = (step.get("voiceover_text") or "").strip()
                if not text:
                    files.append("")
                    continue
                audio_path = audio_dir / f"step_{i:03d}.mp3"
                resp = await client.post(
                    f"{base_url}/audio/speech",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "voice": tts.voice,
                        "input": text,
                        "format": "mp3",
                    },
                )
                if resp.status_code >= 400:
                    raise RuntimeError(
                        f"TTS HTTP {resp.status_code} for step {i}: {resp.text[:200]}"
                    )
                audio_path.write_bytes(resp.content)
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
        cmd = [
            "npx",
            "--yes",
            "remotion",
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
            raise RuntimeError(
                f"failed to spawn remotion CLI ({cmd[0]} not on PATH): {exc}"
            ) from exc

        assert proc.stdout is not None
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
                self._exports.update(
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


def _stretch_end_frames(playbook: dict[str, Any], audio_files: list[str]) -> dict[str, Any]:
    fps = int(playbook.get("fps", 30))
    steps = playbook.get("steps", [])
    cumulative = 0
    for i, step in enumerate(steps):
        prev_end = steps[i - 1]["end_frame"] if i > 0 else 0
        current_end = step["end_frame"]
        animation_frames = max(1, current_end - prev_end)
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
