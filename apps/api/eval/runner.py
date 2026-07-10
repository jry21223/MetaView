"""MetaView evaluation runner for legacy structural and Benchmark V2 scoring.

Modes:
  --recorded       Load committed fixtures (default; no API key required).
  --live           Call the real pipeline API.
  --benchmark-v2   Apply Gold Case expectations and run repeated stability evals.

Benchmark V2 defaults to three attempts per case in both recorded and live
mode.  Recorded repetition proves report aggregation deterministically; only
``--live`` measures generation stability.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import statistics
import sys
from dataclasses import asdict, dataclass
from datetime import datetime
from difflib import SequenceMatcher
from itertools import combinations
from typing import Any, Sequence

import yaml  # type: ignore[import]

from eval.benchmark_v2 import (
    BenchmarkV2Suite,
    V2ScoreCard,
    load_benchmark_v2_suite,
    score_benchmark_v2,
)
from eval.live_client import (
    LiveGenerationResult,
    generate_live_playbook,
    generate_live_playbook_with_metadata,
)
from eval.scorers import ScoreCard, score_playbook_legacy

REPO_ROOT = pathlib.Path(__file__).parents[3]
PROMPTS_DEFAULT = REPO_ROOT / "eval" / "prompts" / "starter.yaml"
FIXTURES_DIR = REPO_ROOT / "eval" / "fixtures"
REPORTS_DIR = REPO_ROOT / "eval" / "reports"
EXPECTATIONS_DEFAULT = REPO_ROOT / "eval" / "benchmark_v2" / "gold_cases.json"


@dataclass(frozen=True)
class GenerationMetrics:
    latency_ms: float | None = None
    repair_count: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    estimated_cost: float | None = None
    warning_count: int | None = None
    run_id: str | None = None


@dataclass(frozen=True)
class V2Attempt:
    repeat_index: int
    card: V2ScoreCard
    metrics: GenerationMetrics
    structure_signature: str | None


def _load_recorded(prompt_id: str, fixtures_dir: pathlib.Path = FIXTURES_DIR) -> str | None:
    path = fixtures_dir / f"{prompt_id}.json"
    return path.read_text(encoding="utf-8") if path.exists() else None


def _generate_live(
    prompt: str,
    api_base: str,
    api_prefix: str = "/api/v1",
    timeout: int = 900,
) -> str:
    return generate_live_playbook(
        prompt,
        api_base,
        api_prefix=api_prefix,
        timeout=timeout,
    )


def _generate_live_v2(
    prompt: str,
    api_base: str,
    api_prefix: str,
    timeout: int,
) -> tuple[str, GenerationMetrics]:
    result: LiveGenerationResult = generate_live_playbook_with_metadata(
        prompt,
        api_base,
        api_prefix=api_prefix,
        timeout=timeout,
    )
    return result.playbook_json, GenerationMetrics(
        latency_ms=result.latency_ms,
        repair_count=result.repair_count,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        estimated_cost=result.estimated_cost,
        warning_count=result.warning_count,
        run_id=result.run_id,
    )


_DIM_LABELS = {
    "schema_valid": "Schema",
    "step_count": "Steps",
    "narration": "Narration",
    "title_caption": "No-dup title",
    "snapshot_richness": "Snap rich",
    "temporal_coherence": "Timing",
    "diversity": "Diversity",
    "contract_schema": "Contract",
    "knowledge_correctness": "Knowledge",
    "pedagogical_structure": "Pedagogy",
    "visual_requirement_coverage": "Visual",
    "narration_visual_consistency": "Narr/visual",
    "timing_export_readiness": "Export",
}


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
    for dimension in card.dimensions:
        label = _DIM_LABELS.get(dimension.name, dimension.name)
        line = (
            f"    {label:<14s} {_fmt_bar(dimension.score, dimension.max_score)}  "
            f"{dimension.score:4.1f}/{dimension.max_score:.0f}"
        )
        if dimension.issues:
            line += f"  ← {dimension.issues[0][:60]}"
        print(line)


def _print_v2_card(card: V2ScoreCard, repeat_index: int) -> None:
    status = "PASS ✓" if card.passed else "FAIL ✗"
    print(
        f"\n  {card.prompt_id:40s} run {repeat_index}  "
        f"V2 {card.total:5.1f}/100  {status}  "
        f"legacy_structural_score={card.legacy_structural_score:.1f}"
    )
    for dimension in card.dimensions:
        label = _DIM_LABELS.get(dimension.name, dimension.name)
        line = (
            f"    {label:<14s} {_fmt_bar(dimension.score, dimension.max_score)}  "
            f"{dimension.score:4.1f}/{dimension.max_score:.0f}"
        )
        if dimension.issues:
            line += f"  ← {dimension.issues[0][:60]}"
        print(line)
    for issue in card.hard_failures[:5]:
        print(f"    HARD FAIL [{issue.code}] {issue.message}")


def _print_legacy_summary(cards: list[ScoreCard]) -> None:
    passed = sum(card.passed for card in cards)
    average = sum(card.total for card in cards) / len(cards) if cards else 0
    print("\n" + "=" * 72)
    print(f"  RESULTS: {passed}/{len(cards)} passed  |  avg score: {average:.1f}/100")
    print("  ✓ Goal reached: average ≥ 90" if average >= 90 else "  ✗ Average below 90")
    print("=" * 72)


def _print_v2_summary(attempts_by_case: dict[str, list[V2Attempt]]) -> None:
    all_attempts = [attempt for attempts in attempts_by_case.values() for attempt in attempts]
    passed = sum(attempt.card.passed for attempt in all_attempts)
    print("\n" + "=" * 88)
    print(f"  BENCHMARK V2: {passed}/{len(all_attempts)} attempts passed")
    for case_id, attempts in attempts_by_case.items():
        summary = _summarize_attempts(attempts)
        print(
            f"  {case_id:36s} success={summary['success_rate']:.0%}  "
            f"structure={_format_optional(summary['structure_similarity'])}  "
            f"variance={summary['quality_score_variance']:.3f}"
        )
    if passed == len(all_attempts):
        print("  ✓ Gate passed: every repeated Gold Case attempt passed")
    else:
        print("  ✗ Gate blocked: Benchmark V2 requires every repeated attempt to pass")
    print("=" * 88)


def _format_optional(value: float | None) -> str:
    return "null" if value is None else f"{value:.3f}"


def _load_prompts(path: pathlib.Path, ids: Sequence[str] | None) -> list[dict[str, Any]]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    prompts = data.get("prompts", []) if isinstance(data, dict) else []
    if ids:
        wanted = set(ids)
        prompts = [prompt for prompt in prompts if prompt.get("id") in wanted]
    return prompts


def _run_legacy(args: argparse.Namespace, prompts: list[dict[str, Any]]) -> int:
    cards: list[ScoreCard] = []
    fixtures_dir = pathlib.Path(args.fixtures_dir)
    print(f"\nRunning {len(prompts)} prompts  [mode: {'live' if args.live else 'recorded'}]")
    print("-" * 72)
    for item in prompts:
        prompt_id = item["id"]
        if args.live:
            try:
                raw = _generate_live(
                    item["prompt"],
                    args.api,
                    api_prefix=args.api_prefix,
                    timeout=args.live_timeout,
                )
            except Exception as exc:
                raw = json.dumps({"error": str(exc)})
                print(f"  {prompt_id}: generation failed — {exc}")
        else:
            raw = _load_recorded(prompt_id, fixtures_dir)
            if raw is None:
                fixture_path = fixtures_dir / f"{prompt_id}.json"
                print(f"  {prompt_id}: no fixture at {fixture_path} — skipping")
                continue
        card = score_playbook_legacy(prompt_id, raw)
        cards.append(card)
        _print_card(card)

    if not cards:
        print("No cards scored.")
        return 1
    _print_legacy_summary(cards)
    report = _legacy_report(cards, "live" if args.live else "recorded")
    report_path = _write_report(report, args.output)
    print(f"\n  Report saved: {report_path}")
    return 0 if report["avg_score"] >= 90 else 1


def _run_v2(
    args: argparse.Namespace,
    prompts: list[dict[str, Any]],
    suite: BenchmarkV2Suite,
) -> int:
    prompt_map = {str(item["id"]): item for item in prompts}
    requested_ids = list(args.ids) if args.ids else [case.id for case in suite.cases]
    unknown = sorted(set(requested_ids) - {case.id for case in suite.cases})
    if unknown:
        print(f"Error: IDs are not Benchmark V2 cases: {unknown}", file=sys.stderr)
        return 1
    missing_prompts = sorted(set(requested_ids) - set(prompt_map))
    if missing_prompts:
        print(f"Error: prompt definitions missing for: {missing_prompts}", file=sys.stderr)
        return 1

    repeats = args.repeat if args.repeat is not None else 3
    if repeats < 1:
        print("Error: --repeat must be at least 1", file=sys.stderr)
        return 1
    fixtures_dir = pathlib.Path(args.fixtures_dir)
    attempts_by_case: dict[str, list[V2Attempt]] = {}
    print(
        f"\nRunning {len(requested_ids)} Benchmark V2 Gold Cases × {repeats} "
        f"[mode: {'live' if args.live else 'recorded'}]"
    )
    print("-" * 88)

    for case_id in requested_ids:
        expectation = suite.by_id(case_id)
        item = prompt_map[case_id]
        attempts: list[V2Attempt] = []
        recorded_raw = None if args.live else _load_recorded(case_id, fixtures_dir)
        if not args.live and recorded_raw is None:
            print(f"Error: missing Gold Case fixture {fixtures_dir / f'{case_id}.json'}")
            return 1
        for repeat_index in range(1, repeats + 1):
            if args.live:
                try:
                    raw, metrics = _generate_live_v2(
                        item["prompt"],
                        args.api,
                        args.api_prefix,
                        args.live_timeout,
                    )
                except Exception as exc:
                    raw = json.dumps({"error": str(exc)})
                    metrics = GenerationMetrics()
                    print(f"  {case_id} run {repeat_index}: generation failed — {exc}")
            else:
                raw = recorded_raw or ""
                metrics = GenerationMetrics()
            card = score_benchmark_v2(
                expectation,
                raw,
                external_warning_count=metrics.warning_count,
            )
            attempt = V2Attempt(
                repeat_index=repeat_index,
                card=card,
                metrics=metrics,
                structure_signature=_structure_signature(raw),
            )
            attempts.append(attempt)
            _print_v2_card(card, repeat_index)
        attempts_by_case[case_id] = attempts

    _print_v2_summary(attempts_by_case)
    report = _v2_report(attempts_by_case, "live" if args.live else "recorded", repeats)
    report_path = _write_report(report, args.output)
    print(f"\n  Report saved: {report_path}")
    return 0 if all(
        attempt.card.passed
        for attempts in attempts_by_case.values()
        for attempt in attempts
    ) else 1


def _structure_signature(raw_json: str) -> str | None:
    try:
        payload = json.loads(raw_json)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(payload, dict) or not isinstance(payload.get("steps"), list):
        return None
    steps: list[dict[str, Any]] = []
    for step in payload["steps"]:
        if not isinstance(step, dict):
            continue
        snapshot = step.get("snapshot") if isinstance(step.get("snapshot"), dict) else {}
        layers = step.get("layers") if isinstance(step.get("layers"), list) else []
        layer_kinds = [
            layer.get("body", {}).get("kind")
            for layer in layers
            if isinstance(layer, dict) and isinstance(layer.get("body"), dict)
        ]
        state_fields = sorted(
            key
            for key, value in snapshot.items()
            if key != "kind" and value not in (None, "", [], {})
        )
        steps.append(
            {
                "kind": snapshot.get("kind"),
                "layer_kinds": layer_kinds,
                "state_fields": state_fields,
                "has_code_highlight": bool(step.get("code_highlight")),
            }
        )
    signature = {
        "domain": payload.get("domain"),
        "scene_type": payload.get("algorithm_id"),
        "steps": steps,
    }
    return json.dumps(signature, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _structure_similarity(signatures: list[str | None]) -> float | None:
    valid = [signature for signature in signatures if signature is not None]
    if len(valid) < 2:
        return None
    ratios = [SequenceMatcher(None, left, right).ratio() for left, right in combinations(valid, 2)]
    return sum(ratios) / len(ratios)


def _optional_stats(values: list[int | float | None]) -> dict[str, Any]:
    available = [float(value) for value in values if value is not None]
    return {
        "values": values,
        "mean": sum(available) / len(available) if available else None,
        "sum": sum(available) if available else None,
    }


def _summarize_attempts(attempts: list[V2Attempt]) -> dict[str, Any]:
    scores = [attempt.card.total for attempt in attempts]
    return {
        "attempt_count": len(attempts),
        "passed_attempts": sum(attempt.card.passed for attempt in attempts),
        "success_rate": (
            sum(attempt.card.passed for attempt in attempts) / len(attempts)
            if attempts
            else 0.0
        ),
        "structure_similarity": _structure_similarity(
            [attempt.structure_signature for attempt in attempts]
        ),
        "quality_score_variance": statistics.pvariance(scores) if scores else 0.0,
        "latency_ms": _optional_stats([attempt.metrics.latency_ms for attempt in attempts]),
        "repair_count": _optional_stats([attempt.metrics.repair_count for attempt in attempts]),
        "input_tokens": _optional_stats([attempt.metrics.input_tokens for attempt in attempts]),
        "output_tokens": _optional_stats([attempt.metrics.output_tokens for attempt in attempts]),
        "estimated_cost": _optional_stats([attempt.metrics.estimated_cost for attempt in attempts]),
    }


def _legacy_report(cards: list[ScoreCard], mode: str) -> dict[str, Any]:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return {
        "timestamp": timestamp,
        "mode": mode,
        "scorer": "legacy_structural_score",
        "total_prompts": len(cards),
        "passed": sum(card.passed for card in cards),
        "avg_score": sum(card.total for card in cards) / len(cards),
        "cards": [
            {
                "id": card.prompt_id,
                "legacy_structural_score": card.total,
                "total": card.total,
                "passed": card.passed,
                "parse_error": card.parse_error,
                "dimensions": [
                    {
                        "name": dimension.name,
                        "score": dimension.score,
                        "max": dimension.max_score,
                        "issues": dimension.issues,
                    }
                    for dimension in card.dimensions
                ],
            }
            for card in cards
        ],
    }


def _v2_report(
    attempts_by_case: dict[str, list[V2Attempt]],
    mode: str,
    repeats: int,
) -> dict[str, Any]:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    attempts = [attempt for group in attempts_by_case.values() for attempt in group]
    return {
        "timestamp": timestamp,
        "mode": mode,
        "scorer": "benchmark_v2",
        "schema_version": "2.0.0",
        "repeat_count": repeats,
        "attempt_count": len(attempts),
        "passed_attempts": sum(attempt.card.passed for attempt in attempts),
        "success_rate": (
            sum(attempt.card.passed for attempt in attempts) / len(attempts)
            if attempts
            else 0.0
        ),
        "cases": [
            {
                "id": case_id,
                "summary": _summarize_attempts(case_attempts),
                "attempts": [
                    {
                        "repeat_index": attempt.repeat_index,
                        "score": attempt.card.to_dict(),
                        "metrics": asdict(attempt.metrics),
                        "structure_signature": attempt.structure_signature,
                    }
                    for attempt in case_attempts
                ],
            }
            for case_id, case_attempts in attempts_by_case.items()
        ],
    }


def _write_report(report: dict[str, Any], output: str | None) -> pathlib.Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = str(report["timestamp"])
    report_path = pathlib.Path(output) if output else REPORTS_DIR / f"{timestamp}.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MetaView eval runner")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--recorded", action="store_true", help="Load pre-generated fixtures")
    mode.add_argument("--live", action="store_true", help="Generate via real pipeline API")
    parser.add_argument("--benchmark-v2", action="store_true", help="Run expectation-driven V2")
    parser.add_argument("--prompts", default=str(PROMPTS_DEFAULT), help="Path to prompts YAML")
    parser.add_argument(
        "--expectations",
        default=str(EXPECTATIONS_DEFAULT),
        help="Path to Benchmark V2 expectations JSON",
    )
    parser.add_argument("--fixtures-dir", default=str(FIXTURES_DIR), help="Recorded fixtures dir")
    parser.add_argument(
        "--repeat",
        type=int,
        default=None,
        help="Attempts per prompt (V2 default: 3)",
    )
    parser.add_argument("--api", default="http://localhost:8000", help="API base for --live")
    parser.add_argument("--api-prefix", default="/api/v1", help="API prefix for --live")
    parser.add_argument("--live-timeout", type=int, default=900, help="Seconds per live run")
    parser.add_argument("--output", default=None, help="JSON report path")
    parser.add_argument("--ids", nargs="*", help="Subset of prompt IDs")
    args = parser.parse_args(argv)

    prompts_path = pathlib.Path(args.prompts)
    if not prompts_path.exists():
        print(f"Error: prompts file not found: {prompts_path}", file=sys.stderr)
        return 1
    prompts = _load_prompts(prompts_path, None if args.benchmark_v2 else args.ids)
    if args.benchmark_v2:
        expectations_path = pathlib.Path(args.expectations)
        if not expectations_path.exists():
            print(f"Error: expectations file not found: {expectations_path}", file=sys.stderr)
            return 1
        suite = load_benchmark_v2_suite(expectations_path)
        return _run_v2(args, prompts, suite)
    return _run_legacy(args, prompts)


if __name__ == "__main__":
    sys.exit(main())
