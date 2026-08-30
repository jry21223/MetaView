"""Render public template cases to narrated MP4s, without running the API.

The export use case already does everything — resolve the frozen playbook,
synthesize per-step narration through the configured TTS provider, re-stretch
each step to its measured audio length, then drive Remotion. It just normally
sits behind an HTTP job queue. This drives it directly so producing the whole
narrated catalogue is one command:

    .venv/bin/python apps/api/scripts/render_narrated_templates.py
    .venv/bin/python apps/api/scripts/render_narrated_templates.py \
        projectile integral-area --out data/narrated --quality 1080p

Reads the same METAVIEW_TTS_* settings as the server, so verify credentials
with scripts/check_tts.py first — a bad key fails here on the first step of
the first case, after the render machinery has already warmed up.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Runnable from the repo root, not just from apps/api.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.application.use_cases.export_video import ExportVideoUseCase  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.domain.models.export_job import (  # noqa: E402
    ExportJob,
    ExportJobStatus,
    ExportOptions,
    TtsConfig,
)
from app.infrastructure.persistence.in_memory_export_repository import (  # noqa: E402
    InMemoryExportJobRepository,
)

REPO_ROOT = Path(__file__).resolve().parents[3]


def _resolve(path_like: str) -> Path:
    path = Path(path_like)
    return path if path.is_absolute() else REPO_ROOT / path


def _case_ids(templates_dir: Path, requested: list[str]) -> list[str]:
    available = sorted(
        p.name[: -len(".playbook.json")] for p in templates_dir.glob("*.playbook.json")
    )
    if not requested:
        return available
    unknown = [case for case in requested if case not in available]
    if unknown:
        raise SystemExit(
            f"unknown case(s): {', '.join(unknown)}\navailable: {', '.join(available)}"
        )
    return requested


async def _render_one(
    use_case: ExportVideoUseCase,
    exports: InMemoryExportJobRepository,
    case_id: str,
    *,
    with_audio: bool,
    options: ExportOptions,
    tts: TtsConfig,
    out_dir: Path,
) -> tuple[bool, str]:
    job_id = f"tpl-{case_id}-{uuid.uuid4().hex[:8]}"
    await exports.create(
        ExportJob(
            job_id=job_id,
            run_id=case_id,
            with_audio=with_audio,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    )
    await use_case.execute(
        job_id=job_id,
        run_id=case_id,
        with_audio=with_audio,
        tts=tts if with_audio else None,
        options=options,
        template_case_id=case_id,
    )
    job = await exports.get(job_id)
    if job is None or job.status != ExportJobStatus.COMPLETED or not job.output_path:
        return False, (job.error if job and job.error else "export did not complete")
    destination = out_dir / f"{case_id}.{options.format}"
    shutil.copy2(job.output_path, destination)
    size_mb = destination.stat().st_size / 1_000_000
    return True, f"{destination}  ({size_mb:.1f} MB)"


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cases", nargs="*", help="case ids; default = every frozen template")
    parser.add_argument("--out", default="data/narrated", help="output directory")
    parser.add_argument("--quality", default="1080p", choices=["720p", "1080p", "2k"])
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--format", default="mp4", choices=["mp4", "webm", "gif"])
    parser.add_argument("--theme", default="light", choices=["light", "dark"])
    parser.add_argument("--voice", default=None, help="override METAVIEW_TTS_DEFAULT_VOICE")
    parser.add_argument(
        "--no-audio",
        action="store_true",
        help="render silent (useful to check the visuals without spending TTS quota)",
    )
    args = parser.parse_args()

    settings = get_settings()
    templates_dir = _resolve(settings.export_template_playbooks_dir)
    if not templates_dir.is_dir():
        raise SystemExit(
            f"no frozen templates at {templates_dir}\n"
            "run: npm --workspace apps/web run template-previews:export"
        )
    cases = _case_ids(templates_dir, args.cases)

    with_audio = not args.no_audio
    if with_audio and not (settings.tts_api_key or settings.openai_api_key):
        raise SystemExit(
            "TTS not configured: set METAVIEW_TTS_API_KEY (or pass --no-audio).\n"
            "Verify first with: .venv/bin/python apps/api/scripts/check_tts.py"
        )

    out_dir = _resolve(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    exports = InMemoryExportJobRepository()
    use_case = ExportVideoUseCase(
        export_repo=exports,
        run_repo=None,  # template cases never touch runs or directors
        director_repo=None,
        web_app_dir=_resolve(settings.export_web_app_dir),
        artifacts_dir=_resolve(settings.export_artifacts_dir),
        template_playbooks_dir=templates_dir,
    )
    options = ExportOptions(
        quality=args.quality, fps=args.fps, format=args.format, theme=args.theme
    )
    tts = TtsConfig(voice=args.voice)

    print(f"{len(cases)} case(s) → {out_dir}  ({args.quality} {args.fps}fps"
          f"{'' if with_audio else ', silent'})\n")
    failures: list[tuple[str, str]] = []
    for index, case_id in enumerate(cases, start=1):
        started = time.monotonic()
        print(f"[{index}/{len(cases)}] {case_id} … ", end="", flush=True)
        try:
            ok, detail = await _render_one(
                use_case, exports, case_id,
                with_audio=with_audio, options=options, tts=tts, out_dir=out_dir,
            )
        except Exception as exc:  # noqa: BLE001 — one bad case must not sink the batch
            ok, detail = False, f"{type(exc).__name__}: {exc}"
        elapsed = time.monotonic() - started
        print(f"{'✓' if ok else '✗'} {detail}  [{elapsed:.0f}s]")
        if not ok:
            failures.append((case_id, detail))

    print()
    print(f"{len(cases) - len(failures)}/{len(cases)} rendered into {out_dir}")
    if failures:
        print("\nfailed:")
        for case_id, detail in failures:
            print(f"  {case_id}: {detail}")
        # A manifest of what did land, so a partial batch is still usable.
        (out_dir / "failures.json").write_text(
            json.dumps(dict(failures), ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
