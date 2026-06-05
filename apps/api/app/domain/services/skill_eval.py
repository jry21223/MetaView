from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence

from app.domain.models.cir import CirDocument
from app.domain.models.review import CirReviewIssue, ReviewSeverity
from app.domain.services.cir_quality import validate_cir_quality


@dataclass(frozen=True)
class SkillOutputMetrics:
    parse_ok: bool
    domain: str | None
    step_count: int
    visual_kind_counts: dict[str, int]
    has_scene: bool
    has_formula: bool
    has_array: bool
    narration_total_chars: int
    validation_error_count: int
    validation_warning_count: int


def metrics_from_parse_result(parsed: Any, prompt: str) -> SkillOutputMetrics:
    """Build shape metrics from run_pipeline.ParseResult without importing application code."""
    parse_ok = bool(getattr(parsed, "ok", False))
    cir = getattr(parsed, "cir", None)
    execution_map = getattr(parsed, "execution_map", None)
    issues = list(getattr(parsed, "issues", None) or [])
    if parse_ok and cir is not None:
        issues.extend(validate_cir_quality(cir, execution_map, prompt))
    return metrics_from_cir(cir, parse_ok=parse_ok, issues=issues)


def metrics_from_cir(
    cir: CirDocument | None,
    *,
    parse_ok: bool = True,
    issues: Sequence[CirReviewIssue] | None = None,
) -> SkillOutputMetrics:
    issues = issues or ()
    if cir is None:
        return SkillOutputMetrics(
            parse_ok=parse_ok,
            domain=None,
            step_count=0,
            visual_kind_counts={},
            has_scene=False,
            has_formula=False,
            has_array=False,
            narration_total_chars=0,
            validation_error_count=_count_issues(issues, ReviewSeverity.ERROR),
            validation_warning_count=_count_issues(issues, ReviewSeverity.WARNING),
        )

    visual_kind_counts: dict[str, int] = {}
    narration_total_chars = 0
    for step in cir.steps:
        visual_kind = step.visual_kind.value
        visual_kind_counts[visual_kind] = visual_kind_counts.get(visual_kind, 0) + 1
        narration_total_chars += _narration_chars(step.narration)

    return SkillOutputMetrics(
        parse_ok=parse_ok,
        domain=cir.domain.value,
        step_count=len(cir.steps),
        visual_kind_counts=visual_kind_counts,
        has_scene=visual_kind_counts.get("scene", 0) > 0,
        has_formula=visual_kind_counts.get("formula", 0) > 0,
        has_array=visual_kind_counts.get("array", 0) > 0,
        narration_total_chars=narration_total_chars,
        validation_error_count=_count_issues(issues, ReviewSeverity.ERROR),
        validation_warning_count=_count_issues(issues, ReviewSeverity.WARNING),
    )


def _count_issues(issues: Sequence[CirReviewIssue], severity: ReviewSeverity) -> int:
    return sum(1 for issue in issues if issue.severity == severity)


def _narration_chars(value: Any) -> int:
    if isinstance(value, str):
        return len(value)
    if isinstance(value, list):
        return sum(_narration_chars(item) for item in value)
    return 0
