#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_PROMPT = (
    "Explain f(x)=x^2 tangent at x=1 and shaded area under the curve from 0 to 2. "
    "Generate a step-by-step teaching animation with a function plot, tangent line, "
    "point marker, Riemann/area shading, and concise narration."
)


def request_json(method: str, url: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed: HTTP {exc.code}: {body}") from exc


def download(url: str, path: Path) -> None:
    with urllib.request.urlopen(url, timeout=120) as resp:
        path.write_bytes(resp.read())


def run_cmd(args: list[str], *, allow_failure: bool = False) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(args, text=True, capture_output=True, check=False)
    if proc.returncode != 0 and not allow_failure:
        raise RuntimeError(
            f"command failed ({proc.returncode}): {' '.join(args)}\n"
            f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"
        )
    return proc


def wait_for_run(api_base: str, run_id: str, timeout_s: int, interval_s: float) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        run = request_json("GET", f"{api_base}/api/v1/runs/{run_id}")
        status = run.get("status")
        print(f"run {run_id}: {status}", flush=True)
        if status == "completed":
            return run
        if status == "failed":
            raise RuntimeError(f"pipeline failed: {run.get('error')}")
        time.sleep(interval_s)
    raise TimeoutError(f"pipeline timed out after {timeout_s}s: {run_id}")


def wait_for_export(api_base: str, job_id: str, timeout_s: int, interval_s: float) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        job = request_json("GET", f"{api_base}/api/v1/exports/{job_id}")
        status = job.get("status")
        progress = job.get("progress")
        print(f"export {job_id}: {status} ({progress})", flush=True)
        if status == "completed":
            return job
        if status == "failed":
            raise RuntimeError(f"export failed: {job.get('error')}")
        time.sleep(interval_s)
    raise TimeoutError(f"export timed out after {timeout_s}s: {job_id}")


def extract_frames(video_path: Path, frame_dir: Path, frames: str) -> list[Path]:
    frame_dir.mkdir(parents=True, exist_ok=True)
    for old in frame_dir.glob("frame_*.png"):
        old.unlink()
    select_expr = "+".join(f"eq(n\\,{n.strip()})" for n in frames.split(",") if n.strip())
    if not select_expr:
        select_expr = "eq(n\\,60)+eq(n\\,360)+eq(n\\,660)+eq(n\\,900)+eq(n\\,1200)"
    run_cmd(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(video_path),
            "-vf",
            f"select='{select_expr}',setpts=N/FRAME_RATE/TB",
            "-vsync",
            "0",
            str(frame_dir / "frame_%03d.png"),
        ]
    )
    return sorted(frame_dir.glob("frame_*.png"))


def probe_video(video_path: Path) -> dict[str, str]:
    proc = run_cmd(
        [
            "ffprobe",
            "-hide_banner",
            "-loglevel",
            "error",
            "-show_streams",
            "-show_format",
            str(video_path),
        ]
    )
    interesting: dict[str, str] = {}
    for line in proc.stdout.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key in {"codec_name", "codec_type", "width", "height", "duration", "nb_frames", "size"}:
            if key in interesting:
                key = f"{key}_{len(interesting)}"
            interesting[key] = value
    return interesting


def blackdetect(video_path: Path) -> list[str]:
    proc = run_cmd(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(video_path),
            "-vf",
            "blackdetect=d=0.6:pix_th=0.08",
            "-an",
            "-f",
            "null",
            "-",
        ],
        allow_failure=True,
    )
    return [line for line in proc.stderr.splitlines() if "black_start:" in line]


def write_report(path: Path, report: dict[str, Any]) -> None:
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md_path = path.with_suffix(".md")
    frame_lines = "\n".join(f"- `{p}`" for p in report["frames"])
    black_lines = "\n".join(f"- `{line}`" for line in report["blackdetect"]) or "- none"
    md_path.write_text(
        "\n".join(
            [
                "# MetaView Generation Review",
                "",
                f"- API: `{report['api_base']}`",
                f"- Run: `{report['run_id']}`",
                f"- Export: `{report['job_id']}`",
                f"- Video: `{report['video_path']}`",
                f"- Title: {report['title']}",
                f"- Steps: {report['step_count']}",
                f"- Snapshots: `{', '.join(report['snapshot_kinds'])}`",
                "",
                "## Video Probe",
                "",
                f"```json\n{json.dumps(report['probe'], ensure_ascii=False, indent=2)}\n```",
                "",
                "## Blackdetect",
                "",
                black_lines,
                "",
                "## Review Frames",
                "",
                frame_lines,
                "",
                "## Manual Review Checklist",
                "",
                "- [ ] No blank or near-blank teaching segments",
                "- [ ] Math labels and formulas are readable",
                "- [ ] Highlighted area/tangent/markers match narration",
                "- [ ] Step transitions do not hide core content",
                "- [ ] Output is better than the previous baseline",
                "",
            ]
        ),
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a real MetaView generation/export review.")
    parser.add_argument("--api-base", default=os.getenv("METAVIEW_REVIEW_API_BASE", "http://127.0.0.1:8000"))
    parser.add_argument("--prompt", default=os.getenv("METAVIEW_REVIEW_PROMPT", DEFAULT_PROMPT))
    parser.add_argument("--provider-api-key", default=os.getenv("METAVIEW_REVIEW_API_KEY"))
    parser.add_argument("--provider-base-url", default=os.getenv("METAVIEW_REVIEW_BASE_URL", "https://api.openai.com/v1"))
    parser.add_argument("--provider-model", default=os.getenv("METAVIEW_REVIEW_MODEL", "gpt-4o-mini"))
    parser.add_argument("--out-dir", default=os.getenv("METAVIEW_REVIEW_OUT_DIR", "/tmp/metaview-review"))
    parser.add_argument("--frames", default="60,360,600,660,720,900,1200")
    parser.add_argument("--pipeline-timeout", type=int, default=600)
    parser.add_argument("--export-timeout", type=int, default=600)
    parser.add_argument("--no-provider-override", action="store_true")
    args = parser.parse_args()

    api_base = args.api_base.rstrip("/")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    payload: dict[str, Any] = {"prompt": args.prompt, "language": "python"}
    if not args.no_provider_override and args.provider_api_key:
        payload.update(
            {
                "provider_api_key": args.provider_api_key,
                "provider_base_url": args.provider_base_url,
                "provider_model": args.provider_model,
            }
        )

    created = request_json("POST", f"{api_base}/api/v1/pipeline", payload)
    run_id = created["run_id"]
    run = wait_for_run(api_base, run_id, args.pipeline_timeout, 2.0)

    job = request_json(
        "POST",
        f"{api_base}/api/v1/exports",
        {
            "run_id": run_id,
            "with_audio": False,
            "options": {"quality": "1080p", "format": "mp4"},
        },
    )
    job_id = job["job_id"]
    job = wait_for_export(api_base, job_id, args.export_timeout, 2.0)

    video_path = out_dir / f"{run_id}-{job_id}.mp4"
    output_url = job["output_url"]
    if not output_url:
        raise RuntimeError("completed export did not include output_url")
    download_url = output_url if output_url.startswith("http") else f"{api_base}{output_url}"
    download(download_url, video_path)

    frame_dir = out_dir / f"{run_id}-{job_id}-frames"
    frames = extract_frames(video_path, frame_dir, args.frames)
    playbook = run.get("playbook") or {}
    steps = playbook.get("steps") or []
    report = {
        "api_base": api_base,
        "run_id": run_id,
        "job_id": job_id,
        "video_path": str(video_path),
        "frames": [str(p) for p in frames],
        "title": playbook.get("title"),
        "step_count": len(steps),
        "snapshot_kinds": [((s.get("snapshot") or {}).get("kind") or "unknown") for s in steps],
        "probe": probe_video(video_path),
        "blackdetect": blackdetect(video_path),
    }
    report_path = out_dir / f"{run_id}-{job_id}-review.json"
    write_report(report_path, report)
    print(f"review report: {report_path}")
    print(f"review markdown: {report_path.with_suffix('.md')}")
    print(f"video: {video_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
