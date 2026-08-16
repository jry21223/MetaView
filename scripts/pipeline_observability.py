#!/usr/bin/env python3
"""pipeline_observability.py — minimal run-level observability for the agent pipeline.

Issue #241. Reads only persisted fields in the ``pipeline_runs`` SQLite database
(status / review_json / quality_report_json). No instrumentation, no production
code changes: metrics come from signals the pipeline already records.

Metric definitions follow decision #236 (warning auto-repair) and its
implementation #242:

- run totals and status distribution (PipelineRunStatus values)
- repair statistics: canonical repairable repair attempts
  (``quality:repair_attempt:N`` max sequence), warning auto-repair
  (``quality:warning_repair_attempt:1``), reviewer repair attempts
  (``reviewer:repair_attempt:N``), plus legacy CIR parse repairs
  (``repair_attempt_N``) and agent self-repairs (``agent:self_repair_attempt:N``)
- warning code frequencies aggregated from ``quality_report_json.issues``
- provider path distribution (``generator_path``: agent / skill_pack /
  generic_cir) and agent-mode ``router:skill_id`` hits
- warning auto-repair success rate: of runs that recorded
  ``quality:warning_repair_attempt:1``, how many no longer contain the same
  allowlisted warning code in the final quality report (#242 semantics: a
  warning that survives repair still does not fail the run)

Usage:
    pipeline_observability.py                      # human-readable tables
    pipeline_observability.py --json               # JSON only, on stdout
    pipeline_observability.py --db path/to.db      # custom database
    pipeline_observability.py --out data/obs.json  # also write JSON summary

Database resolution: ``--db``, else ``$METAVIEW_HISTORY_DB_PATH``, else
``data/pipeline_runs.db`` (the Settings default, resolved from the repository
root). Exit code 0 on success (including an empty database with a valid
schema); 2 for a missing file, missing schema, or bad invocation.

Python 3.8+, standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

# Allowlisted warning codes that trigger the one-shot auto-repair (#236/#242).
# Keep in sync with RunPipelineUseCase._WARNING_REPAIR_ALLOWLIST in
# apps/api/app/application/use_cases/run_pipeline.py when the allowlist grows;
# the success-rate metric below is the data that should drive that growth.
WARNING_REPAIR_ALLOWLIST: tuple[str, ...] = ("timeline.voiceover_too_short",)

EXIT_OK = 0
EXIT_USAGE = 2


def default_db_path() -> str:
    return os.environ.get("METAVIEW_HISTORY_DB_PATH", "data/pipeline_runs.db")


def _as_dict(blob: str | dict[str, Any] | None) -> dict[str, Any]:
    if isinstance(blob, dict):
        return blob
    if not blob:
        return {}
    try:
        parsed = json.loads(blob)
    except (json.JSONDecodeError, TypeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _run_actions(run: dict[str, Any]) -> list[str]:
    """Deduplicated, order-preserving action list for one run.

    ``quality_report_json.actions`` is usually a superset of
    ``review_json.actions`` (report-level actions such as
    ``quality:repair_exhausted`` are appended only to the report), so both are
    merged with deduplication before counting.
    """
    actions: list[str] = []
    seen: set[str] = set()
    for key in ("quality_report", "review"):
        for action in _as_dict(run.get(key)).get("actions") or []:
            if isinstance(action, str) and action not in seen:
                seen.add(action)
                actions.append(action)
    return actions


def _run_issues(run: dict[str, Any]) -> list[dict[str, Any]]:
    """Issues from the canonical quality report, falling back to the review."""
    for key in ("quality_report", "review"):
        issues = _as_dict(run.get(key)).get("issues")
        if isinstance(issues, list):
            return [i for i in issues if isinstance(i, dict)]
    return []


def _max_sequence(actions: Iterable[str], prefix: str) -> int:
    best = 0
    for action in actions:
        if action.startswith(prefix) and action[len(prefix) :].isdigit():
            best = max(best, int(action[len(prefix) :]))
    return best


def _generator_path(run: dict[str, Any]) -> str:
    report = _as_dict(run.get("quality_report"))
    path = report.get("generator_path")
    if isinstance(path, str) and path:
        return path
    for action in _run_actions(run):
        if action.startswith("generator:"):
            return action.partition(":")[2]
    return "unknown"


def collect(runs: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate observability metrics from persisted run rows."""
    stats: dict[str, Any] = {
        "run_counts": {"total": 0, "by_status": {}, "with_quality_report": 0},
        "provider_paths": {"generator_path": {}, "agent_router_skill_ids": {}},
        "repair_stats": {
            "quality_repair_attempts": {},
            "warning_repair_attempts": 0,
            "reviewer_repair_attempts": {},
            "self_repair_attempts": {},
            "cir_repair_attempts": {},
            "repair_exhausted": 0,
            "repair_unavailable": 0,
        },
        "warning_codes": {},
        "warning_repair_success": {},
        "actions": {},
    }
    by_status: Counter[str] = Counter()
    generator_paths: Counter[str] = Counter()
    agent_skill_ids: Counter[str] = Counter()
    quality_repairs: Counter[int] = Counter()
    reviewer_repairs: Counter[int] = Counter()
    self_repairs: Counter[int] = Counter()
    cir_repairs: Counter[int] = Counter()
    warning_codes: Counter[str] = Counter()
    warning_codes_runs: Counter[str] = Counter()
    actions: Counter[str] = Counter()
    attempted_runs: dict[str, list[dict[str, Any]]] = {
        code: [] for code in WARNING_REPAIR_ALLOWLIST
    }
    with_quality_report = 0

    for run in runs:
        by_status[str(run.get("status") or "unknown")] += 1
        report = _as_dict(run.get("quality_report"))
        if report:
            with_quality_report += 1
        generator = _generator_path(run)
        generator_paths[generator] += 1
        run_actions = _run_actions(run)
        actions.update(run_actions)
        quality_repairs[_max_sequence(run_actions, "quality:repair_attempt:")] += 1
        reviewer_repairs[_max_sequence(run_actions, "reviewer:repair_attempt:")] += 1
        self_repairs[_max_sequence(run_actions, "agent:self_repair_attempt:")] += 1
        cir_repairs[_max_sequence(run_actions, "repair_attempt_")] += 1
        if "quality:warning_repair_attempt:1" in run_actions:
            stats["repair_stats"]["warning_repair_attempts"] += 1
        if "quality:repair_exhausted" in run_actions:
            stats["repair_stats"]["repair_exhausted"] += 1
        if "quality:repair_unavailable" in run_actions:
            stats["repair_stats"]["repair_unavailable"] += 1
        if generator == "agent":
            for action in run_actions:
                if action.startswith("router:skill_id:"):
                    skill_id = action.partition(":")[2]
                    if skill_id.startswith("skill_id:"):
                        skill_id = skill_id[len("skill_id:") :]
                    agent_skill_ids[skill_id] += 1
        seen_codes: set[str] = set()
        for issue in _run_issues(run):
            if issue.get("severity") == "warning" and issue.get("code"):
                warning_codes[str(issue["code"])] += 1
                seen_codes.add(str(issue["code"]))
        for code in seen_codes:
            warning_codes_runs[code] += 1
        for code in WARNING_REPAIR_ALLOWLIST:
            if "quality:warning_repair_attempt:1" in run_actions:
                attempted_runs[code].append(run)

    stats["run_counts"]["total"] = sum(by_status.values())
    stats["run_counts"]["by_status"] = dict(sorted(by_status.items()))
    stats["run_counts"]["with_quality_report"] = with_quality_report
    stats["provider_paths"]["generator_path"] = dict(
        sorted(generator_paths.items(), key=lambda item: -item[1])
    )
    stats["provider_paths"]["agent_router_skill_ids"] = dict(
        sorted(agent_skill_ids.items(), key=lambda item: -item[1])
    )
    stats["repair_stats"]["quality_repair_attempts"] = _distribution(quality_repairs)
    stats["repair_stats"]["reviewer_repair_attempts"] = _distribution(reviewer_repairs)
    stats["repair_stats"]["self_repair_attempts"] = _distribution(self_repairs)
    stats["repair_stats"]["cir_repair_attempts"] = _distribution(cir_repairs)
    stats["warning_codes"] = {
        code: {"issues": warning_codes[code], "runs": warning_codes_runs[code]}
        for code in sorted(warning_codes, key=lambda c: (-warning_codes[c], c))
    }
    stats["warning_repair_success"] = {
        code: _warning_repair_success(runs=attempted_runs[code], code=code)
        for code in WARNING_REPAIR_ALLOWLIST
    }
    stats["actions"] = dict(sorted(actions.items(), key=lambda item: -item[1]))
    return stats


def _distribution(counter: Counter[int]) -> dict[str, int]:
    return {str(level): counter[level] for level in sorted(counter)}


def _warning_repair_success(runs: list[dict[str, Any]], code: str) -> dict[str, int]:
    """#242 semantics: after the one-shot warning repair, a surviving same-code
    warning is accepted (the run still succeeds). Success = the code cleared."""
    cleared = still_warning = missing_report = 0
    for run in runs:
        if not (run.get("quality_report") or run.get("review")):
            missing_report += 1
            continue
        issues = _run_issues(run)
        if any(
            issue.get("severity") == "warning" and issue.get("code") == code
            for issue in issues
        ):
            still_warning += 1
        else:
            cleared += 1
    return {
        "attempted_runs": len(runs),
        "cleared_runs": cleared,
        "still_warning_runs": still_warning,
        "missing_final_report": missing_report,
    }


def load_runs(db_path: str) -> list[dict[str, Any]]:
    """Load persisted run rows. Raises ValueError on missing file/schema."""
    path = Path(db_path)
    if not path.exists():
        raise ValueError(f"database not found: {path}")
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except sqlite3.Error as exc:
        raise ValueError(f"cannot open database {path}: {exc}") from exc
    try:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='pipeline_runs'"
        ).fetchone()
        if row is None:
            raise ValueError(f"{path} has no pipeline_runs table")
        rows = conn.execute(
            "SELECT run_id, status, created_at, review_json, quality_report_json"
            " FROM pipeline_runs"
        ).fetchall()
    except sqlite3.Error as exc:
        raise ValueError(f"cannot read pipeline_runs from {path}: {exc}") from exc
    finally:
        conn.close()
    runs: list[dict[str, Any]] = []
    for run_id, status, created_at, review_json, quality_report_json in rows:
        runs.append(
            {
                "run_id": run_id,
                "status": status,
                "created_at": created_at,
                "review": _as_dict(review_json),
                "quality_report": _as_dict(quality_report_json),
            }
        )
    return runs


def format_report(stats: dict[str, Any], db_path: str) -> str:
    counts = stats["run_counts"]
    repair = stats["repair_stats"]
    lines: list[str] = []
    lines.append("=== Agent pipeline run observability (#241) ===")
    lines.append(f"Database: {db_path}  ({counts['total']} runs)")
    lines.append("")

    lines.append("Runs by status (PipelineRunStatus)")
    for status, count in counts["by_status"].items():
        lines.append(f"  {status:<12} {count}")
    lines.append("")

    lines.append("Provider paths (generator_path)")
    for path, count in stats["provider_paths"]["generator_path"].items():
        lines.append(f"  {path:<12} {count}")
    skill_ids = stats["provider_paths"]["agent_router_skill_ids"]
    if skill_ids:
        lines.append("  agent-mode router:skill_id hits")
        for skill_id, count in skill_ids.items():
            lines.append(f"    {skill_id:<24} {count}")
    lines.append("")

    lines.append("Repair statistics (max attempt sequence per run)")
    lines.append(
        "  canonical repairable repair (quality:repair_attempt:N): "
        + _distribution_line(repair["quality_repair_attempts"])
    )
    lines.append(
        "  warning auto-repair (quality:warning_repair_attempt:1): "
        f"{repair['warning_repair_attempts']} runs"
    )
    lines.append(
        "  reviewer repair (reviewer:repair_attempt:N): "
        + _distribution_line(repair["reviewer_repair_attempts"])
    )
    lines.append(
        "  agent self-repair (agent:self_repair_attempt:N): "
        + _distribution_line(repair["self_repair_attempts"])
    )
    lines.append(
        "  legacy CIR parse repair (repair_attempt_N): "
        + _distribution_line(repair["cir_repair_attempts"])
    )
    lines.append(f"  quality:repair_exhausted runs: {repair['repair_exhausted']}")
    lines.append(f"  quality:repair_unavailable runs: {repair['repair_unavailable']}")
    lines.append("")

    lines.append("Warning auto-repair success (#236/#242 allowlist)")
    lines.append("  code                          attempted  cleared  still  success")
    for code, entry in stats["warning_repair_success"].items():
        attempted = entry["attempted_runs"]
        rate = (
            f"{100.0 * entry['cleared_runs'] / attempted:.1f}%"
            if attempted
            else "-"
        )
        lines.append(
            f"  {code:<30} {attempted:>6}  {entry['cleared_runs']:>6}  "
            f"{entry['still_warning_runs']:>5}  {rate:>7}"
        )
    lines.append("")

    lines.append("Warning codes (quality_report issues, severity=warning)")
    if stats["warning_codes"]:
        lines.append("  code                                      issues  runs")
        for code, entry in stats["warning_codes"].items():
            lines.append(f"  {code:<40} {entry['issues']:>6}  {entry['runs']:>4}")
    else:
        lines.append("  (none)")
    lines.append("")

    lines.append("Action overview (deduplicated per run, top 25)")
    for action, count in list(stats["actions"].items())[:25]:
        lines.append(f"  {count:>4}  {action}")
    if len(stats["actions"]) > 25:
        lines.append(f"  ... {len(stats['actions']) - 25} more action values")
    lines.append("")

    lines.append(f"Runs with persisted quality report: {counts['with_quality_report']}")
    return "\n".join(lines)


def _distribution_line(distribution: dict[str, int]) -> str:
    if not distribution:
        return "no runs"
    parts = [f"{level} attempts: {count}" for level, count in distribution.items()]
    return "; ".join(parts)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Agent pipeline run observability (#241); reads pipeline_runs.db.",
    )
    parser.add_argument(
        "--db",
        default=default_db_path(),
        help="path to the pipeline_runs SQLite database "
        f"(default: {default_db_path()!r} or $METAVIEW_HISTORY_DB_PATH)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="print only the JSON summary to stdout",
    )
    parser.add_argument(
        "--out",
        metavar="PATH",
        help="also write the JSON summary to PATH (e.g. data/pipeline_observability.json)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(list(argv) if argv is not None else sys.argv[1:])
    try:
        runs = load_runs(args.db)
    except ValueError as exc:
        print(f"pipeline_observability: error: {exc}", file=sys.stderr)
        return EXIT_USAGE
    stats = collect(runs)
    payload = {
        "db_path": args.db,
        "run_count": stats["run_counts"]["total"],
        "stats": stats,
    }
    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {out_path}")
    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        print(format_report(stats, args.db))
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
