from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

import yaml

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from eval.scorers import score_playbook  # noqa: E402

GenerationPath = Literal["deterministic", "agent", "single", "unknown"]

PROMPTS_DEFAULT = REPO_ROOT / "eval" / "prompts" / "agent_skill_demo.yaml"
REPORTS_DIR = REPO_ROOT / "eval" / "reports"
VIDEOS_DIR = REPO_ROOT / "eval" / "videos" / "agent_skill_demo"


def classify_generation_path(actions: list[str]) -> GenerationPath:
    if "router:skill_pack" in actions or any(action.startswith("skill:") for action in actions):
        return "deterministic"
    if "generator:agent" in actions:
        return "agent"
    if "generator:generic_cir" in actions:
        return "single"
    return "unknown"


def load_cases(path: Path, ids: list[str] | None = None) -> list[dict[str, Any]]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    cases = list(data.get("prompts", []))
    if ids:
        wanted = set(ids)
        cases = [case for case in cases if case.get("id") in wanted]
    return cases


def run_case(
    client: Any,
    *,
    api_base: str,
    api_prefix: str,
    case: dict[str, Any],
    timeout_s: float,
    poll_interval_s: float,
) -> dict[str, Any]:
    base = api_base.rstrip("/")
    prefix = "/" + api_prefix.strip("/")
    submit = client.post(
        f"{base}{prefix}/pipeline",
        json={
            "prompt": case["prompt"],
            "domain": case["domain"],
        },
        timeout=60,
    )
    submit.raise_for_status()
    run_id = submit.json()["run_id"]
    deadline = time.monotonic() + timeout_s
    last: dict[str, Any] = {"status": "submitted"}

    while time.monotonic() < deadline:
        resp = client.get(f"{base}{prefix}/runs/{run_id}", timeout=60)
        resp.raise_for_status()
        last = resp.json()
        if last.get("status") in {"succeeded", "failed"}:
            break
        time.sleep(poll_interval_s)

    if last.get("status") not in {"succeeded", "failed"}:
        raise TimeoutError(f"Timed out waiting for {run_id}; last={last.get('status')}")

    playbook = last.get("playbook")
    raw_playbook = json.dumps(playbook, ensure_ascii=False) if isinstance(playbook, dict) else "{}"
    score = score_playbook(str(case["id"]), raw_playbook)
    review_actions = _review_actions(last.get("review"))
    actual_path = classify_generation_path(review_actions)
    expected_path = case.get("expected_path")
    return {
        "id": case["id"],
        "domain": case["domain"],
        "run_id": run_id,
        "status": last.get("status"),
        "expected_path": expected_path,
        "actual_path": actual_path,
        "path_ok": expected_path in {None, actual_path},
        "contract_score": score.total,
        "passed_contract_score": score.passed,
        "score_kind": "structural_contract",
        "review_actions": review_actions,
        "error": last.get("error"),
        "playbook": playbook,
    }


def export_case_video(
    client: Any,
    *,
    api_base: str,
    api_prefix: str,
    run_id: str,
    case_id: str,
    timeout_s: float,
    poll_interval_s: float,
    output_dir: Path,
    fmt: str,
    quality: str,
) -> str:
    base = api_base.rstrip("/")
    prefix = "/" + api_prefix.strip("/")
    submit = client.post(
        f"{base}{prefix}/exports",
        json={
            "run_id": run_id,
            "with_audio": False,
            "options": {"format": fmt, "quality": quality, "fps": 30},
        },
        timeout=60,
    )
    submit.raise_for_status()
    job_id = submit.json()["job_id"]
    deadline = time.monotonic() + timeout_s
    last: dict[str, Any] = {"status": "queued"}

    while time.monotonic() < deadline:
        resp = client.get(f"{base}{prefix}/exports/{job_id}", timeout=60)
        resp.raise_for_status()
        last = resp.json()
        if last.get("status") in {"completed", "failed"}:
            break
        time.sleep(poll_interval_s)

    if last.get("status") != "completed" or not last.get("output_url"):
        raise RuntimeError(f"Export {job_id} did not complete: {last}")

    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / f"{case_id}.{fmt}"
    download_url = str(last["output_url"])
    if download_url.startswith("/"):
        download_url = f"{base}{download_url}"
    download = client.get(download_url, timeout=120)
    download.raise_for_status()
    out_path.write_bytes(download.content)
    return str(out_path)


def _review_actions(review: Any) -> list[str]:
    if not isinstance(review, dict):
        return []
    actions = review.get("actions")
    if not isinstance(actions, list):
        return []
    return [str(action) for action in actions]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run MetaView Codex agent skill demo cases.")
    parser.add_argument("--prompts", default=str(PROMPTS_DEFAULT))
    parser.add_argument("--ids", nargs="*")
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--api-prefix", default="/api/v1")
    parser.add_argument("--timeout", type=float, default=900.0)
    parser.add_argument("--poll-interval", type=float, default=2.0)
    parser.add_argument("--output")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--export-videos", action="store_true")
    parser.add_argument("--export-format", default="mp4", choices=["mp4", "webm", "gif"])
    parser.add_argument("--export-quality", default="720p", choices=["720p", "1080p", "2k"])
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cases = load_cases(Path(args.prompts), ids=args.ids)
    if args.dry_run:
        print(json.dumps({"count": len(cases), "cases": cases}, ensure_ascii=False, indent=2))
        return 0

    try:
        import httpx
    except ImportError:
        raise SystemExit("httpx is required for live demo runs") from None

    results: list[dict[str, Any]] = []
    with httpx.Client() as client:
        for case in cases:
            result = run_case(
                client,
                api_base=args.api,
                api_prefix=args.api_prefix,
                case=case,
                timeout_s=args.timeout,
                poll_interval_s=args.poll_interval,
            )
            if args.export_videos and result["status"] == "succeeded":
                try:
                    result["video_path"] = export_case_video(
                        client,
                        api_base=args.api,
                        api_prefix=args.api_prefix,
                        run_id=result["run_id"],
                        case_id=result["id"],
                        timeout_s=args.timeout,
                        poll_interval_s=args.poll_interval,
                        output_dir=VIDEOS_DIR,
                        fmt=args.export_format,
                        quality=args.export_quality,
                    )
                except Exception as exc:  # noqa: BLE001 - report per-case export failure.
                    result["video_error"] = str(exc)
            results.append(result)
            print(
                f"{result['id']}: {result['status']} path={result['actual_path']} "
                f"contract_score={result['contract_score']:.1f}"
            )

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output = (
        Path(args.output)
        if args.output
        else REPORTS_DIR / f"agent_skill_demo_{timestamp}.json"
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "timestamp": timestamp,
        "total": len(results),
        "passed": sum(
            1
            for result in results
            if result["status"] == "succeeded"
            and result["path_ok"]
            and result["passed_contract_score"]
        ),
        "results": [
            {key: value for key, value in result.items() if key != "playbook"}
            for result in results
        ],
    }
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Report saved: {output}")
    return 0 if report["passed"] == report["total"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
