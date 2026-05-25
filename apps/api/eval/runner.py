"""Eval runner — drives all prompts in eval/prompts/starter.yaml through the
agent pipeline and scores each output.

Modes:
  --recorded   Load pre-generated JSON from eval/fixtures/<id>.json (default,
               no API key required).  Great for CI and iterative scorer dev.
  --live       Call the real agent pipeline for each prompt (requires
               METAVIEW_OPENAI_API_KEY + running sidecar).

Usage:
  # Recorded mode (no API key):
  uv run python -m eval.runner --recorded --prompts ../../eval/prompts/starter.yaml

  # Live mode (real generation):
  uv run python -m eval.runner --live --prompts ../../eval/prompts/starter.yaml \\
      --api http://localhost:8000

Output: pretty table + JSON report at eval/reports/YYYYMMDD_HHMMSS.json
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import textwrap
import time
from datetime import datetime
from typing import Any

import yaml  # type: ignore[import]

from eval.scorers import ScoreCard, score_playbook

REPO_ROOT = pathlib.Path(__file__).parents[3]  # worktree root
PROMPTS_DEFAULT = REPO_ROOT / "eval" / "prompts" / "starter.yaml"
FIXTURES_DIR = REPO_ROOT / "eval" / "fixtures"
REPORTS_DIR = REPO_ROOT / "eval" / "reports"


# ---------------------------------------------------------------------------
# Playbook source adapters
# ---------------------------------------------------------------------------


def _load_recorded(prompt_id: str) -> str | None:
    """Return raw JSON from eval/fixtures/<id>.json or None if not found."""
    path = FIXTURES_DIR / f"{prompt_id}.json"
    if path.exists():
        return path.read_text()
    return None


def _generate_live(prompt: str, api_base: str, timeout: int = 120) -> str:
    """POST prompt to /api/pipeline/run and return the playbook JSON string."""
    try:
        import httpx  # optional dep — present in dev requirements
    except ImportError:
        raise RuntimeError("httpx not installed; run: uv add httpx")

    payload = {"prompt": prompt, "generation_mode": "agent"}
    resp = httpx.post(f"{api_base}/api/pipeline/run", json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()

    playbook = data.get("playbook")
    if playbook is None:
        raise ValueError(f"No 'playbook' in response: {data}")
    return json.dumps(playbook) if isinstance(playbook, dict) else playbook


# ---------------------------------------------------------------------------
# Report formatting
# ---------------------------------------------------------------------------

_DIM_LABELS = {
    "schema_valid": "Schema",
    "step_count": "Steps",
    "narration": "Narration",
    "title_caption": "No-dup title",
    "snapshot_richness": "Snap rich",
    "temporal_coherence": "Timing",
    "diversity": "Diversity",
}

_COL_WIDTH = 14


def _fmt_bar(score: float, max_s: float, width: int = 8) -> str:
    pct = score / max_s if max_s else 0
    filled = round(pct * width)
    return "█" * filled + "░" * (width - filled)


def _print_card(card: ScoreCard) -> None:
    status = "PASS ✓" if card.passed else "FAIL ✗"
    print(f"\n  {card.prompt_id:40s}  {card.total:5.1f}/100  {status}")
    if card.parse_error:
        print(f"    ↳ parse error: {card.parse_error[:80]}")
        return
    for dim in card.dimensions:
        label = _DIM_LABELS.get(dim.name, dim.name)
        bar = _fmt_bar(dim.score, dim.max_score)
        line = f"    {label:<14s} {bar}  {dim.score:4.1f}/{dim.max_score:.0f}"
        if dim.issues:
            issue_preview = dim.issues[0][:60]
            line += f"  ← {issue_preview}"
        print(line)


def _print_summary(cards: list[ScoreCard]) -> None:
    passed = sum(1 for c in cards if c.passed)
    avg = sum(c.total for c in cards) / len(cards) if cards else 0
    print("\n" + "=" * 72)
    print(f"  RESULTS: {passed}/{len(cards)} passed  |  avg score: {avg:.1f}/100")
    if avg >= 90:
        print("  ✓ Goal reached: average ≥ 90")
    else:
        gap = 90 - avg
        print(f"  ✗ {gap:.1f} pts below the 90-pt goal")
    print("=" * 72)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MetaView eval runner")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--recorded", action="store_true", default=True,
                      help="Load pre-generated fixtures (default)")
    mode.add_argument("--live", action="store_true",
                      help="Generate via real agent pipeline")
    parser.add_argument("--prompts", default=str(PROMPTS_DEFAULT),
                        help="Path to prompts YAML (default: eval/prompts/starter.yaml)")
    parser.add_argument("--api", default="http://localhost:8000",
                        help="API base URL for --live mode")
    parser.add_argument("--output", default=None,
                        help="Path for JSON report (default: eval/reports/<timestamp>.json)")
    parser.add_argument("--ids", nargs="*", help="Subset of prompt IDs to run")
    args = parser.parse_args(argv)

    prompts_path = pathlib.Path(args.prompts)
    if not prompts_path.exists():
        print(f"Error: prompts file not found: {prompts_path}", file=sys.stderr)
        return 1

    data = yaml.safe_load(prompts_path.read_text())
    prompts: list[dict] = data.get("prompts", [])
    if args.ids:
        prompts = [p for p in prompts if p["id"] in args.ids]

    cards: list[ScoreCard] = []
    print(f"\nRunning {len(prompts)} prompts  [mode: {'live' if args.live else 'recorded'}]")
    print("-" * 72)

    for item in prompts:
        pid = item["id"]
        prompt_text = item["prompt"]

        if args.live:
            try:
                raw = _generate_live(prompt_text, args.api)
            except Exception as exc:
                raw = json.dumps({"error": str(exc)})
                print(f"  {pid}: generation failed — {exc}")
        else:
            raw = _load_recorded(pid)
            if raw is None:
                print(f"  {pid}: no fixture at eval/fixtures/{pid}.json — skipping")
                continue

        card = score_playbook(pid, raw)
        cards.append(card)
        _print_card(card)

    if not cards:
        print("No cards scored.")
        return 1

    _print_summary(cards)

    # Save report
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = pathlib.Path(args.output) if args.output else REPORTS_DIR / f"{ts}.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "timestamp": ts,
        "mode": "live" if args.live else "recorded",
        "total_prompts": len(cards),
        "passed": sum(1 for c in cards if c.passed),
        "avg_score": sum(c.total for c in cards) / len(cards),
        "cards": [
            {
                "id": c.prompt_id,
                "total": c.total,
                "passed": c.passed,
                "parse_error": c.parse_error,
                "dimensions": [
                    {"name": d.name, "score": d.score, "max": d.max_score, "issues": d.issues}
                    for d in c.dimensions
                ],
            }
            for c in cards
        ],
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\n  Report saved: {report_path}")

    return 0 if sum(c.total for c in cards) / len(cards) >= 90 else 1


if __name__ == "__main__":
    sys.exit(main())
