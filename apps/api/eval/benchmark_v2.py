"""Benchmark V2 contracts and product-quality scoring for Gold Cases.

The legacy scorer in :mod:`eval.scorers` intentionally remains available for
historical comparisons.  This module adds expectation-driven checks which
cannot be satisfied by schema validity or longer narration alone.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal

import sympy as sp
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.domain.contracts.playbook_contract import SUPPORTED_SNAPSHOT_KIND_SET
from app.domain.models.playbook import PlaybookScript
from app.domain.services.geometry_validators import _parse as _parse_guarded_expression
from eval.scorers import ScoreCard, score_playbook_legacy

BENCHMARK_V2_PATH = Path(__file__).parents[3] / "eval" / "benchmark_v2" / "gold_cases.json"

HardFailCondition = Literal[
    "schema_invalid",
    "unexpected_domain",
    "missing_required_snapshot_kind",
    "forbidden_snapshot_kind",
    "missing_required_scene_type",
    "missing_required_semantic_role",
    "missing_required_asset",
    "missing_required_text_fact",
    "forbidden_text_fact",
    "missing_required_state_field",
    "expected_conclusion_not_met",
    "warning_count_exceeded",
    "invalid_timeline",
    "empty_narration",
    "final_step_does_not_answer",
    "required_state_value_mismatch",
    "invalid_state_reference",
    "invalid_state_transition",
    "incorrect_state_order",
    "missing_visual_transition",
    "invalid_semantic_evidence",
]

_MANDATORY_HARD_FAILS: set[str] = {
    "schema_invalid",
    "unexpected_domain",
    "missing_required_snapshot_kind",
    "forbidden_snapshot_kind",
    "missing_required_scene_type",
    "missing_required_semantic_role",
    "missing_required_asset",
    "missing_required_text_fact",
    "forbidden_text_fact",
    "missing_required_state_field",
    "expected_conclusion_not_met",
    "warning_count_exceeded",
    "required_state_value_mismatch",
    "invalid_state_reference",
    "invalid_state_transition",
    "incorrect_state_order",
    "missing_visual_transition",
    "invalid_semantic_evidence",
}


class TextFactExpectation(BaseModel):
    """One knowledge fact, with language-neutral aliases accepted in output."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    any_of: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_aliases(self) -> "TextFactExpectation":
        if any(not alias.strip() for alias in self.any_of):
            raise ValueError("text fact aliases must not be blank")
        return self


class ConclusionExpectation(BaseModel):
    """A conclusion is valid when every alias group matches and no rejection does."""

    model_config = ConfigDict(extra="forbid")

    statement: str = Field(min_length=1)
    all_of: list[list[str]] = Field(min_length=1)
    none_of: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_patterns(self) -> "ConclusionExpectation":
        if any(not group or any(not item.strip() for item in group) for group in self.all_of):
            raise ValueError("conclusion all_of groups must contain non-blank aliases")
        if any(not item.strip() for item in self.none_of):
            raise ValueError("conclusion none_of aliases must not be blank")
        return self


class GoldCaseExpectation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    expected_domains: list[str] = Field(min_length=1)
    required_snapshot_kinds: list[str] = Field(min_length=1)
    forbidden_snapshot_kinds: list[str] = Field(default_factory=list)
    required_scene_types: list[str] = Field(min_length=1)
    required_semantic_roles: list[str] = Field(min_length=1)
    required_asset_ids: list[str] = Field(default_factory=list)
    required_text_facts: list[TextFactExpectation] = Field(min_length=1)
    forbidden_text_facts: list[TextFactExpectation] = Field(default_factory=list)
    required_state_fields: list[str] = Field(min_length=1)
    required_state_values: dict[str, Any] = Field(default_factory=dict)
    expected_conclusion: ConclusionExpectation
    maximum_warning_count: int = Field(ge=0)
    hard_fail_conditions: list[HardFailCondition] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_contract(self) -> "GoldCaseExpectation":
        required = set(self.required_snapshot_kinds)
        forbidden = set(self.forbidden_snapshot_kinds)
        unsupported = (required | forbidden) - SUPPORTED_SNAPSHOT_KIND_SET
        if unsupported:
            raise ValueError(f"unsupported snapshot kinds: {sorted(unsupported)}")
        if required & forbidden:
            raise ValueError("snapshot kinds cannot be both required and forbidden")
        fact_ids = [fact.id for fact in [*self.required_text_facts, *self.forbidden_text_facts]]
        if len(fact_ids) != len(set(fact_ids)):
            raise ValueError("text fact ids must be unique within a case")
        missing_conditions = _MANDATORY_HARD_FAILS - set(self.hard_fail_conditions)
        if missing_conditions:
            raise ValueError(
                f"hard_fail_conditions must declare mandatory gates: {sorted(missing_conditions)}"
            )
        return self


class BenchmarkV2Suite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["2.0.0"]
    cases: list[GoldCaseExpectation] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_case_ids(self) -> "BenchmarkV2Suite":
        ids = [case.id for case in self.cases]
        if len(ids) != len(set(ids)):
            raise ValueError("benchmark case ids must be unique")
        return self

    def by_id(self, case_id: str) -> GoldCaseExpectation:
        for case in self.cases:
            if case.id == case_id:
                return case
        raise KeyError(f"Unknown Benchmark V2 case: {case_id}")


def load_benchmark_v2_suite(path: Path = BENCHMARK_V2_PATH) -> BenchmarkV2Suite:
    return BenchmarkV2Suite.model_validate_json(path.read_text(encoding="utf-8"))


@dataclass(frozen=True)
class V2Issue:
    code: str
    path: str
    message: str
    severity: Literal["warning", "error"]
    hard_fail: bool


@dataclass(frozen=True)
class V2DimensionResult:
    name: str
    score: float
    max_score: float
    issues: list[str] = field(default_factory=list)


@dataclass
class V2ScoreCard:
    prompt_id: str
    dimensions: list[V2DimensionResult]
    issues: list[V2Issue]
    legacy_structural_score: float
    parse_error: str | None = None
    external_warning_count: int | None = None

    @property
    def total(self) -> float:
        return sum(item.score for item in self.dimensions)

    @property
    def max_total(self) -> float:
        return sum(item.max_score for item in self.dimensions)

    @property
    def hard_failures(self) -> list[V2Issue]:
        return [issue for issue in self.issues if issue.hard_fail]

    @property
    def warning_count(self) -> int:
        own = sum(issue.severity == "warning" for issue in self.issues)
        return own + (self.external_warning_count or 0)

    @property
    def passed(self) -> bool:
        return not self.hard_failures and self.total >= 90.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.prompt_id,
            "quality_score": self.total,
            "passed": self.passed,
            "parse_error": self.parse_error,
            "legacy_structural_score": self.legacy_structural_score,
            "warning_count": self.warning_count,
            "external_warning_count": self.external_warning_count,
            "hard_failures": [asdict(issue) for issue in self.hard_failures],
            "issues": [asdict(issue) for issue in self.issues],
            "dimensions": [asdict(dimension) for dimension in self.dimensions],
        }


class _IssueCollector:
    def __init__(self, expectation: GoldCaseExpectation) -> None:
        self.expectation = expectation
        self.issues: list[V2Issue] = []

    def add(self, code: str, path: str, message: str, *, warning: bool = False) -> None:
        hard_fail = code in self.expectation.hard_fail_conditions
        self.issues.append(
            V2Issue(
                code=code,
                path=path,
                message=message,
                severity="warning" if warning and not hard_fail else "error",
                hard_fail=hard_fail,
            )
        )


def score_benchmark_v2(
    expectation: GoldCaseExpectation,
    raw_json: str,
    *,
    external_warning_count: int | None = None,
) -> V2ScoreCard:
    """Score one Playbook against one Gold Case expectation.

    Required visual state and the expected conclusion are hard gates.  Score
    points are still reported after a hard failure so reports explain both the
    magnitude and the exact cause of a regression.
    """

    legacy = score_playbook_legacy(expectation.id, raw_json)
    collector = _IssueCollector(expectation)
    try:
        script = PlaybookScript.model_validate_json(raw_json)
    except (ValidationError, json.JSONDecodeError, ValueError) as exc:
        message = str(exc)[:300]
        collector.add("schema_invalid", "$", message)
        return V2ScoreCard(
            prompt_id=expectation.id,
            dimensions=_zero_dimensions("schema_invalid"),
            issues=collector.issues,
            legacy_structural_score=legacy.total,
            parse_error=message,
            external_warning_count=external_warning_count,
        )

    payload = script.model_dump(mode="json", by_alias=True)
    snapshots = _snapshots(payload)
    primary_snapshots = _primary_snapshots(payload)
    snapshot_kinds = {str(snapshot.get("kind")) for snapshot in snapshots}
    scene_types = _scene_types(payload)
    semantic_roles = _semantic_roles(snapshots, payload)
    asset_ids = _asset_ids(snapshots)
    content_text = _content_text(payload)
    conclusion_text = _conclusion_text(payload)
    final_step_text = _final_step_text(payload)

    domain_ok = str(script.domain.value) in expectation.expected_domains
    if not domain_ok:
        collector.add(
            "unexpected_domain",
            "$.domain",
            f"expected one of {expectation.expected_domains}, got {script.domain.value!r}",
        )

    missing_kinds = sorted(set(expectation.required_snapshot_kinds) - snapshot_kinds)
    for kind in missing_kinds:
        collector.add(
            "missing_required_snapshot_kind",
            "$.steps[*].snapshot.kind",
            f"required snapshot kind {kind!r} is absent",
        )
    present_forbidden_kinds = sorted(set(expectation.forbidden_snapshot_kinds) & snapshot_kinds)
    for kind in present_forbidden_kinds:
        collector.add(
            "forbidden_snapshot_kind",
            "$.steps[*].snapshot.kind",
            f"forbidden fallback snapshot kind {kind!r} is present",
        )

    missing_scene_types = sorted(set(expectation.required_scene_types) - scene_types)
    for scene_type in missing_scene_types:
        collector.add(
            "missing_required_scene_type",
            "$.algorithm_id",
            f"required scene type {scene_type!r} is absent",
        )

    missing_roles = sorted(set(expectation.required_semantic_roles) - semantic_roles)
    for role in missing_roles:
        collector.add(
            "missing_required_semantic_role",
            "$.steps[*].snapshot",
            f"required semantic visual role {role!r} is absent",
        )

    missing_assets = sorted(set(expectation.required_asset_ids) - asset_ids)
    for asset_id in missing_assets:
        collector.add(
            "missing_required_asset",
            "$.steps[*].snapshot",
            f"required semantic asset {asset_id!r} is absent",
        )

    missing_fields = [
        field_name
        for field_name in expectation.required_state_fields
        if not any(_has_state_field(snapshot, field_name) for snapshot in snapshots)
    ]
    for field_name in missing_fields:
        collector.add(
            "missing_required_state_field",
            "$.steps[*].snapshot",
            f"required non-empty state field {field_name!r} is absent",
        )

    mismatched_values = [
        (field_name, expected_value)
        for field_name, expected_value in expectation.required_state_values.items()
        if not any(
            _state_field_equals(snapshot, field_name, expected_value) for snapshot in snapshots
        )
    ]
    for field_name, expected_value in mismatched_values:
        collector.add(
            "required_state_value_mismatch",
            "$.steps[*].snapshot",
            f"state field {field_name!r} never equals {expected_value!r}",
        )

    semantic_state_issues = _validate_case_semantics(expectation, primary_snapshots)
    for code, path, message in semantic_state_issues:
        collector.add(code, path, message)

    missing_facts = [
        fact for fact in expectation.required_text_facts if not _fact_matches(fact, content_text)
    ]
    for fact in missing_facts:
        collector.add(
            "missing_required_text_fact",
            "$.steps",
            f"required text fact {fact.id!r} is absent",
        )
    forbidden_facts = [
        fact for fact in expectation.forbidden_text_facts if _fact_matches(fact, content_text)
    ]
    for fact in forbidden_facts:
        collector.add(
            "forbidden_text_fact",
            "$.steps",
            f"forbidden or incorrect text fact {fact.id!r} is present",
        )

    conclusion_ok = _conclusion_matches(expectation.expected_conclusion, conclusion_text)
    if not conclusion_ok:
        collector.add(
            "expected_conclusion_not_met",
            "$.summary|$.steps[-1]",
            f"expected conclusion not established: {expectation.expected_conclusion.statement}",
        )

    steps = payload.get("steps") if isinstance(payload.get("steps"), list) else []
    step_count_ok = len(steps) >= 3
    if not step_count_ok:
        collector.add(
            "pedagogy.too_few_steps",
            "$.steps",
            f"only {len(steps)} teaching step(s); expected at least 3",
            warning=True,
        )
    titles = [str(step.get("title") or "").strip() for step in steps if isinstance(step, dict)]
    titles_ok = bool(titles) and all(titles) and len(set(titles)) == len(titles)
    if not titles_ok:
        collector.add(
            "pedagogy.weak_step_titles",
            "$.steps[*].title",
            "step titles must be non-empty and distinct",
            warning=True,
        )
    narration_ok = bool(steps) and all(
        isinstance(step, dict) and str(step.get("voiceover_text") or "").strip() for step in steps
    )
    if not narration_ok:
        collector.add(
            "empty_narration",
            "$.steps[*].voiceover_text",
            "every teaching step requires non-empty narration",
            warning=True,
        )
    final_answers = _conclusion_matches(expectation.expected_conclusion, final_step_text)
    if not final_answers:
        collector.add(
            "final_step_does_not_answer",
            "$.steps[-1]",
            "final step does not state the expected conclusion",
            warning=True,
        )

    timeline_monotonic, timeline_within_total = _timeline_checks(payload)
    if not timeline_monotonic or not timeline_within_total:
        collector.add(
            "invalid_timeline",
            "$.steps[*].end_frame",
            "step end frames must increase strictly and stay within total_frames",
            warning=True,
        )
    export_ready = bool(steps and script.fps > 0 and script.total_frames > 0 and snapshots)

    required_fact_ratio = _coverage_ratio(
        len(expectation.required_text_facts) - len(missing_facts),
        len(expectation.required_text_facts),
    )
    role_ratio = _coverage_ratio(
        len(expectation.required_semantic_roles) - len(missing_roles),
        len(expectation.required_semantic_roles),
    )

    dimensions = [
        V2DimensionResult(
            "contract_schema",
            10.0 + (5.0 if domain_ok else 0.0),
            15.0,
            _dimension_issues(collector.issues, {"unexpected_domain"}),
        ),
        V2DimensionResult(
            "knowledge_correctness",
            (10.0 * required_fact_ratio + (15.0 if conclusion_ok else 0.0))
            if not forbidden_facts
            else 0.0,
            25.0,
            _dimension_issues(
                collector.issues,
                {
                    "missing_required_text_fact",
                    "forbidden_text_fact",
                    "expected_conclusion_not_met",
                },
            ),
        ),
        V2DimensionResult(
            "pedagogical_structure",
            sum(
                [
                    5.0 if step_count_ok else 0.0,
                    5.0 if titles_ok else 0.0,
                    5.0 if narration_ok else 0.0,
                    5.0 if final_answers else 0.0,
                ]
            ),
            20.0,
            _dimension_issues(
                collector.issues,
                {
                    "pedagogy.too_few_steps",
                    "pedagogy.weak_step_titles",
                    "empty_narration",
                    "final_step_does_not_answer",
                },
            ),
        ),
        V2DimensionResult(
            "visual_requirement_coverage",
            _visual_score(
                expectation,
                missing_kinds=missing_kinds,
                present_forbidden_kinds=present_forbidden_kinds,
                missing_scene_types=missing_scene_types,
                missing_roles=missing_roles,
                missing_assets=missing_assets,
                missing_fields=missing_fields,
                mismatched_values=mismatched_values,
                semantic_state_issue_count=len(semantic_state_issues),
            ),
            20.0,
            _dimension_issues(
                collector.issues,
                {
                    "missing_required_snapshot_kind",
                    "forbidden_snapshot_kind",
                    "missing_required_scene_type",
                    "missing_required_semantic_role",
                    "missing_required_asset",
                    "missing_required_state_field",
                    "required_state_value_mismatch",
                    "invalid_state_reference",
                    "invalid_state_transition",
                    "incorrect_state_order",
                    "missing_visual_transition",
                    "invalid_semantic_evidence",
                },
            ),
        ),
        V2DimensionResult(
            "narration_visual_consistency",
            10.0 * min(required_fact_ratio, role_ratio),
            10.0,
            []
            if required_fact_ratio == 1.0 and role_ratio == 1.0
            else ["required narration facts and visual roles do not fully align"],
        ),
        V2DimensionResult(
            "timing_export_readiness",
            sum(
                [
                    4.0 if timeline_monotonic else 0.0,
                    3.0 if timeline_within_total else 0.0,
                    3.0 if export_ready else 0.0,
                ]
            ),
            10.0,
            _dimension_issues(collector.issues, {"invalid_timeline"}),
        ),
    ]

    own_warning_count = sum(issue.severity == "warning" for issue in collector.issues)
    combined_warning_count = own_warning_count + (external_warning_count or 0)
    if combined_warning_count > expectation.maximum_warning_count:
        collector.add(
            "warning_count_exceeded",
            "$",
            f"warning count {combined_warning_count} exceeds maximum "
            f"{expectation.maximum_warning_count}",
        )

    return V2ScoreCard(
        prompt_id=expectation.id,
        dimensions=dimensions,
        issues=collector.issues,
        legacy_structural_score=legacy.total,
        external_warning_count=external_warning_count,
    )


def _zero_dimensions(issue: str) -> list[V2DimensionResult]:
    return [
        V2DimensionResult("contract_schema", 0.0, 15.0, [issue]),
        V2DimensionResult("knowledge_correctness", 0.0, 25.0, [issue]),
        V2DimensionResult("pedagogical_structure", 0.0, 20.0, [issue]),
        V2DimensionResult("visual_requirement_coverage", 0.0, 20.0, [issue]),
        V2DimensionResult("narration_visual_consistency", 0.0, 10.0, [issue]),
        V2DimensionResult("timing_export_readiness", 0.0, 10.0, [issue]),
    ]


def _dimension_issues(issues: list[V2Issue], codes: set[str]) -> list[str]:
    return [issue.message for issue in issues if issue.code in codes]


def _coverage_ratio(present: int, expected: int) -> float:
    return present / expected if expected else 1.0


def _visual_score(
    expectation: GoldCaseExpectation,
    *,
    missing_kinds: list[str],
    present_forbidden_kinds: list[str],
    missing_scene_types: list[str],
    missing_roles: list[str],
    missing_assets: list[str],
    missing_fields: list[str],
    mismatched_values: list[tuple[str, Any]],
    semantic_state_issue_count: int,
) -> float:
    raw = sum(
        [
            3.0
            * _coverage_ratio(
                len(expectation.required_snapshot_kinds) - len(missing_kinds),
                len(expectation.required_snapshot_kinds),
            ),
            3.0 if not present_forbidden_kinds else 0.0,
            3.0
            * _coverage_ratio(
                len(expectation.required_scene_types) - len(missing_scene_types),
                len(expectation.required_scene_types),
            ),
            5.0
            * _coverage_ratio(
                len(expectation.required_semantic_roles) - len(missing_roles),
                len(expectation.required_semantic_roles),
            ),
            2.0
            * _coverage_ratio(
                len(expectation.required_asset_ids) - len(missing_assets),
                len(expectation.required_asset_ids),
            ),
            4.0
            * _coverage_ratio(
                len(expectation.required_state_fields)
                + len(expectation.required_state_values)
                - len(missing_fields)
                - len(mismatched_values),
                len(expectation.required_state_fields) + len(expectation.required_state_values),
            ),
        ]
    )
    return max(0.0, raw - min(5.0, semantic_state_issue_count * 2.0))


def _snapshots(payload: dict[str, Any]) -> list[dict[str, Any]]:
    snapshots: list[dict[str, Any]] = []
    for step in payload.get("steps") or []:
        if not isinstance(step, dict):
            continue
        snapshot = step.get("snapshot")
        if isinstance(snapshot, dict):
            snapshots.append(snapshot)
        for layer in step.get("layers") or []:
            if isinstance(layer, dict) and isinstance(layer.get("body"), dict):
                snapshots.append(layer["body"])
    return snapshots


def _primary_snapshots(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        snapshot
        for step in payload.get("steps") or []
        if isinstance(step, dict) and isinstance((snapshot := step.get("snapshot")), dict)
    ]


def _scene_types(payload: dict[str, Any]) -> set[str]:
    result: set[str] = set()
    initial_data = payload.get("initial_data")
    if isinstance(initial_data, dict):
        for item in initial_data.get("scene_blueprint") or []:
            if isinstance(item, str) and item:
                result.add(item)
    # ``algorithm_id`` is a legacy cross-domain field.  Keep it only as a
    # compatibility fallback when no explicit SceneBlueprint metadata exists.
    algorithm_id = payload.get("algorithm_id")
    if not result and isinstance(algorithm_id, str) and algorithm_id:
        result.add(algorithm_id)
    return result


def _asset_ids(snapshots: list[dict[str, Any]]) -> set[str]:
    result: set[str] = set()

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                if key.endswith("asset_id") and isinstance(item, str) and item:
                    result.add(item)
                visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)

    for snapshot in snapshots:
        visit(snapshot)
    return result


def _semantic_roles(
    snapshots: list[dict[str, Any]],
    payload: dict[str, Any],
) -> set[str]:
    roles: set[str] = set()

    def explicit(value: Any) -> None:
        if isinstance(value, dict):
            role = value.get("semantic_role")
            if isinstance(role, str) and role:
                roles.add(role)
            for item in value.values():
                explicit(item)
        elif isinstance(value, list):
            for item in value:
                explicit(item)

    for snapshot in snapshots:
        explicit(snapshot)
        kind = snapshot.get("kind")
        if kind in {"math_plot", "math_scene"}:
            if snapshot.get("curves"):
                roles.add("curve")
            if snapshot.get("marker_x") is not None or snapshot.get("points"):
                roles.add("target_point")
            curve_text = _flatten_strings(snapshot.get("curves") or []).casefold()
            segment_text = _flatten_strings(snapshot.get("segments") or []).casefold()
            if "tangent" in curve_text or "切线" in curve_text or "tangent" in segment_text:
                roles.add("tangent")
            visual_text = _flatten_strings(snapshot).casefold()
            if "slope" in curve_text or "斜率" in curve_text or "f'(" in visual_text:
                roles.add("slope")
        if kind in {"graph_scene", "algorithm_tree"}:
            if snapshot.get("nodes"):
                roles.add("node")
            if snapshot.get("edges"):
                roles.add("edge")
            if snapshot.get("current_node_id") or snapshot.get("active_node_ids"):
                roles.add("current_node")
            if snapshot.get("visited_node_ids"):
                roles.add("visited")
            if snapshot.get("queue_node_ids") or snapshot.get("frontier_node_ids"):
                roles.add("queue")
        if kind == "call_stack_scene":
            frames = [frame for frame in snapshot.get("frames") or [] if isinstance(frame, dict)]
            if frames:
                roles.add("stack_frame")
            if snapshot.get("current_frame_id") or any(
                isinstance(frame, dict) and frame.get("state") == "active" for frame in frames
            ):
                roles.add("active_frame")
            code_trace = snapshot.get("code_trace")
            if isinstance(code_trace, dict) and code_trace.get("lines"):
                roles.add("code_line")
            if any(
                str(frame.get("state") or "").casefold() == "returned"
                or any(
                    token in str(key).casefold()
                    for key in (frame.get("variables") or {})
                    for token in ("return", "result")
                )
                for frame in frames
            ):
                roles.add("return_value")
        if kind == "code_trace_scene" and snapshot.get("lines"):
            roles.add("code_line")
        if kind == "physics_force_scene":
            if snapshot.get("objects"):
                roles.add("object")
            if snapshot.get("trajectory"):
                roles.add("trajectory")
            _physics_vector_roles(snapshot, roles)
        if kind == "motion_scene":
            _motion_scene_roles(snapshot, roles)

    return roles


def _physics_vector_roles(snapshot: dict[str, Any], roles: set[str]) -> None:
    for vector in snapshot.get("vectors") or []:
        if not isinstance(vector, dict):
            continue
        label = str(vector.get("label") or vector.get("id") or "").casefold()
        role = str(vector.get("semantic_role") or "").casefold()
        dx = vector.get("dx")
        dy = vector.get("dy")
        if label in {"vx", "v_x", "horizontal velocity", "水平速度"} or (
            role == "velocity" and isinstance(dx, int | float) and dx != 0 and dy == 0
        ):
            roles.add("horizontal_velocity")
        if label in {"vy", "v_y", "vertical velocity", "竖直速度"} or (
            role == "velocity" and isinstance(dy, int | float) and dy != 0 and dx == 0
        ):
            roles.add("vertical_velocity")
        if label in {"g", "gravity", "重力"} or role in {"gravity", "acceleration"}:
            roles.add("gravity")


def _motion_scene_roles(snapshot: dict[str, Any], roles: set[str]) -> None:
    objects = [item for item in snapshot.get("objects") or [] if isinstance(item, dict)]
    if any(item.get("type") in {"point", "polygon"} for item in objects):
        roles.add("object")
    moving_properties: dict[str, set[str]] = {}
    for track in snapshot.get("tracks") or []:
        if not isinstance(track, dict):
            continue
        target = str(track.get("target") or "")
        moving_properties.setdefault(target, set()).add(str(track.get("property") or ""))
    if any({"x", "y"}.issubset(properties) for properties in moving_properties.values()):
        roles.add("trajectory")
    for item in objects:
        label = str(item.get("label") or item.get("id") or "").casefold()
        if label in {"vx", "v_x", "horizontal velocity", "水平速度"}:
            roles.add("horizontal_velocity")
        if label in {"vy", "v_y", "vertical velocity", "竖直速度"}:
            roles.add("vertical_velocity")
        if label in {"g", "gravity", "重力"}:
            roles.add("gravity")


def _validate_case_semantics(
    expectation: GoldCaseExpectation,
    snapshots: list[dict[str, Any]],
) -> list[tuple[str, str, str]]:
    issues: list[tuple[str, str, str]] = []
    if "derivative_tangent" in expectation.required_scene_types:
        issues.extend(_validate_derivative_tangent(snapshots))
    if "bfs_graph" in expectation.required_scene_types:
        issues.extend(_validate_bfs_progression(snapshots))
    if "recursion_stack" in expectation.required_scene_types:
        issues.extend(_validate_recursion_progression(snapshots))
    if "projectile_motion" in expectation.required_scene_types:
        issues.extend(_validate_projectile_motion(snapshots))
    return issues


def _validate_derivative_tangent(
    snapshots: list[dict[str, Any]],
) -> list[tuple[str, str, str]]:
    plots = [snapshot for snapshot in snapshots if snapshot.get("kind") == "math_plot"]
    if not plots:
        return []
    x = sp.Symbol("x", real=True)
    for plot in plots:
        marker_x = _finite_float(plot.get("marker_x"))
        if marker_x is None or not math.isclose(marker_x, 1.0, abs_tol=1e-9):
            continue
        curves = [curve for curve in plot.get("curves") or [] if isinstance(curve, dict)]
        tangent_curves = [
            curve
            for curve in curves
            if str(curve.get("semantic_role") or "").casefold() == "tangent"
            or "tangent" in str(curve.get("label") or "").casefold()
            or "切线" in str(curve.get("label") or "")
        ]
        base_curves = [curve for curve in curves if curve not in tangent_curves]
        for base_curve in base_curves:
            base = _parse_guarded_expression(str(base_curve.get("expression") or ""), x)
            if base is None or sp.simplify(base - x**2) != 0:
                continue
            for tangent_curve in tangent_curves:
                tangent = _parse_guarded_expression(
                    str(tangent_curve.get("expression") or ""),
                    x,
                )
                if tangent is None or sp.simplify(sp.diff(tangent, x, 2)) != 0:
                    continue
                try:
                    base_y = float(base.subs(x, marker_x))
                    tangent_y = float(tangent.subs(x, marker_x))
                    base_slope = float(sp.diff(base, x).subs(x, marker_x))
                    tangent_slope = float(sp.diff(tangent, x).subs(x, marker_x))
                except (TypeError, ValueError):
                    continue
                if all(
                    math.isclose(value, expected, rel_tol=1e-9, abs_tol=1e-9)
                    for value, expected in (
                        (base_y, 1.0),
                        (tangent_y, 1.0),
                        (base_slope, 2.0),
                        (tangent_slope, 2.0),
                    )
                ):
                    return []
    return [
        (
            "invalid_semantic_evidence",
            "$.steps[*].snapshot.curves",
            (
                "Derivative Gold Case requires y=x^2 and a linear tangent through "
                "(1, 1) with slope 2."
            ),
        )
    ]


def _validate_projectile_motion(
    snapshots: list[dict[str, Any]],
) -> list[tuple[str, str, str]]:
    scenes = [snapshot for snapshot in snapshots if snapshot.get("kind") == "physics_force_scene"]
    if not scenes:
        return []
    if any(_projectile_scene_is_valid(scene) for scene in scenes):
        return []
    return [
        (
            "invalid_semantic_evidence",
            "$.steps[*].snapshot",
            (
                "Projectile Gold Case requires a curved parabolic trajectory, axis-aligned "
                "velocity components, and a bounded vertical gravity vector whose direction "
                "matches the trajectory curvature."
            ),
        )
    ]


def _projectile_scene_is_valid(scene: dict[str, Any]) -> bool:
    points: list[tuple[float, float]] = []
    for point in scene.get("trajectory") or []:
        if not isinstance(point, list | tuple) or len(point) != 2:
            return False
        x_value = _finite_float(point[0])
        y_value = _finite_float(point[1])
        if x_value is None or y_value is None:
            return False
        points.append((x_value, y_value))
    if len(points) < 3:
        return False
    x_deltas = [right[0] - left[0] for left, right in zip(points, points[1:], strict=False)]
    if not (all(delta > 1e-9 for delta in x_deltas) or all(delta < -1e-9 for delta in x_deltas)):
        return False
    slopes = [
        (right[1] - left[1]) / (right[0] - left[0])
        for left, right in zip(points, points[1:], strict=False)
    ]
    slope_changes = [right - left for left, right in zip(slopes, slopes[1:], strict=False)]
    if not slope_changes or not (
        all(change >= -1e-9 for change in slope_changes)
        or all(change <= 1e-9 for change in slope_changes)
    ):
        return False
    curvature = slopes[-1] - slopes[0]
    if math.isclose(curvature, 0.0, abs_tol=1e-6):
        return False

    object_ids = {
        str(item.get("id"))
        for item in scene.get("objects") or []
        if isinstance(item, dict) and item.get("id") is not None
    }
    if not object_ids:
        return False
    vectors = [vector for vector in scene.get("vectors") or [] if isinstance(vector, dict)]

    def matching_vector(kind: str) -> dict[str, Any] | None:
        for vector in vectors:
            label = str(vector.get("label") or vector.get("id") or "").casefold()
            role = str(vector.get("semantic_role") or "").casefold()
            if kind == "horizontal" and label in {
                "vx",
                "v_x",
                "horizontal velocity",
                "水平速度",
            }:
                return vector
            if kind == "vertical" and label in {
                "vy",
                "v_y",
                "vertical velocity",
                "竖直速度",
            }:
                return vector
            if kind == "gravity" and (
                label in {"g", "gravity", "重力"} or role in {"gravity", "acceleration"}
            ):
                return vector
        return None

    horizontal = matching_vector("horizontal")
    vertical = matching_vector("vertical")
    gravity = matching_vector("gravity")
    if horizontal is None or vertical is None or gravity is None:
        return False
    if any(
        str(vector.get("target") or "") not in object_ids
        for vector in (horizontal, vertical, gravity)
    ):
        return False

    horizontal_dx = _finite_float(horizontal.get("dx"))
    horizontal_dy = _finite_float(horizontal.get("dy"))
    vertical_dx = _finite_float(vertical.get("dx"))
    vertical_dy = _finite_float(vertical.get("dy"))
    gravity_dx = _finite_float(gravity.get("dx"))
    gravity_dy = _finite_float(gravity.get("dy"))
    if None in {
        horizontal_dx,
        horizontal_dy,
        vertical_dx,
        vertical_dy,
        gravity_dx,
        gravity_dy,
    }:
        return False
    assert horizontal_dx is not None
    assert horizontal_dy is not None
    assert vertical_dx is not None
    assert vertical_dy is not None
    assert gravity_dx is not None
    assert gravity_dy is not None
    if math.isclose(horizontal_dx, 0.0, abs_tol=1e-9) or not math.isclose(
        horizontal_dy, 0.0, abs_tol=1e-9
    ):
        return False
    if not math.isclose(vertical_dx, 0.0, abs_tol=1e-9) or math.isclose(
        vertical_dy, 0.0, abs_tol=1e-9
    ):
        return False
    if not math.isclose(gravity_dx, 0.0, abs_tol=1e-9) or math.isclose(
        gravity_dy, 0.0, abs_tol=1e-9
    ):
        return False
    if abs(gravity_dy) > 100.0 or math.copysign(1.0, gravity_dy) != math.copysign(1.0, curvature):
        return False
    return True


def _finite_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _validate_bfs_progression(
    snapshots: list[dict[str, Any]],
) -> list[tuple[str, str, str]]:
    graphs = [snapshot for snapshot in snapshots if snapshot.get("kind") == "graph_scene"]
    if not graphs:
        return []
    issues: list[tuple[str, str, str]] = []
    invalid_reference = False
    for index, graph in enumerate(graphs):
        node_ids = {
            str(node.get("id"))
            for node in graph.get("nodes") or []
            if isinstance(node, dict) and node.get("id") is not None
        }
        references = [
            graph.get("current_node_id"),
            *(graph.get("active_node_ids") or []),
            *(graph.get("visited_node_ids") or []),
            *(graph.get("queue_node_ids") or []),
            *(graph.get("frontier_node_ids") or []),
        ]
        if any(
            reference is not None and str(reference) not in node_ids for reference in references
        ):
            invalid_reference = True
            issues.append(
                (
                    "invalid_state_reference",
                    f"$.steps[{index}].snapshot",
                    "BFS state references a node id that is absent from graph_scene.nodes.",
                )
            )
            break

    signatures = {
        json.dumps(
            {
                "current": graph.get("current_node_id"),
                "visited": graph.get("visited_node_ids") or [],
                "queue": graph.get("queue_node_ids") or graph.get("frontier_node_ids") or [],
            },
            sort_keys=True,
        )
        for graph in graphs
    }
    if len(signatures) < 2:
        issues.append(
            (
                "missing_visual_transition",
                "$.steps[*].snapshot",
                "BFS current/visited/queue state never changes across teaching steps.",
            )
        )

    visited_states = [
        [str(node_id) for node_id in graph.get("visited_node_ids") or []] for graph in graphs
    ]
    if any(
        not set(previous).issubset(current)
        for previous, current in zip(visited_states, visited_states[1:], strict=False)
    ):
        issues.append(
            (
                "invalid_state_transition",
                "$.steps[*].snapshot.visited_node_ids",
                "BFS visited state must grow monotonically across steps.",
            )
        )

    longest_order = max(visited_states, key=len, default=[])
    first_graph = graphs[0]
    node_ids = {
        str(node.get("id"))
        for node in first_graph.get("nodes") or []
        if isinstance(node, dict) and node.get("id") is not None
    }
    if node_ids and set(longest_order) != node_ids:
        issues.append(
            (
                "invalid_state_transition",
                "$.steps[*].snapshot.visited_node_ids",
                "The final BFS visited state must cover every node in the demonstrated graph.",
            )
        )

    if longest_order and not invalid_reference:
        distances = _graph_distances(first_graph, longest_order[0])
        order_distances = [distances.get(node_id) for node_id in longest_order]
        if any(distance is None for distance in order_distances) or any(
            left > right
            for left, right in zip(order_distances, order_distances[1:], strict=False)
            if left is not None and right is not None
        ):
            issues.append(
                (
                    "incorrect_state_order",
                    "$.steps[*].snapshot.visited_node_ids",
                    "BFS visit order must be nondecreasing by graph distance from the start node.",
                )
            )
        current_order = _dedupe_consecutive(
            [str(graph.get("current_node_id")) for graph in graphs if graph.get("current_node_id")]
        )
        if current_order and current_order != longest_order[: len(current_order)]:
            issues.append(
                (
                    "incorrect_state_order",
                    "$.steps[*].snapshot.current_node_id",
                    "BFS current-node progression must follow the displayed visited order.",
                )
            )
        actual_states: list[tuple[str, tuple[str, ...], tuple[str, ...]]] = []
        for graph in graphs:
            current = graph.get("current_node_id")
            if current is None:
                continue
            visited = tuple(str(node_id) for node_id in graph.get("visited_node_ids") or [])
            queue_value = graph.get("queue_node_ids")
            if not isinstance(queue_value, list):
                queue_value = graph.get("frontier_node_ids") or []
            queue = tuple(str(node_id) for node_id in queue_value)
            state = (str(current), visited, queue)
            if not actual_states or actual_states[-1] != state:
                actual_states.append(state)
        expected_states = _expected_bfs_states(first_graph, longest_order[0])
        if actual_states != expected_states:
            issues.append(
                (
                    "invalid_state_transition",
                    "$.steps[*].snapshot.queue_node_ids",
                    (
                        "BFS queue must follow FIFO dequeue/enqueue transitions derived "
                        "from the displayed graph edges."
                    ),
                )
            )
    return _dedupe_semantic_issues(issues)


def _expected_bfs_states(
    graph: dict[str, Any],
    start: str,
) -> list[tuple[str, tuple[str, ...], tuple[str, ...]]]:
    adjacency: dict[str, list[str]] = {}
    directed = bool(graph.get("directed"))
    for edge in graph.get("edges") or []:
        if not isinstance(edge, dict):
            continue
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        if not source or not target:
            continue
        adjacency.setdefault(source, []).append(target)
        if not directed:
            adjacency.setdefault(target, []).append(source)

    queue = [start]
    discovered = {start}
    visited: list[str] = []
    states: list[tuple[str, tuple[str, ...], tuple[str, ...]]] = []
    while queue:
        current = queue.pop(0)
        visited.append(current)
        for neighbor in adjacency.get(current, []):
            if neighbor in discovered:
                continue
            discovered.add(neighbor)
            queue.append(neighbor)
        states.append((current, tuple(visited), tuple(queue)))
    return states


def _graph_distances(graph: dict[str, Any], start: str) -> dict[str, int]:
    adjacency: dict[str, set[str]] = {}
    directed = bool(graph.get("directed"))
    for edge in graph.get("edges") or []:
        if not isinstance(edge, dict):
            continue
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        if not source or not target:
            continue
        adjacency.setdefault(source, set()).add(target)
        if not directed:
            adjacency.setdefault(target, set()).add(source)
    distances = {start: 0}
    queue = [start]
    while queue:
        node = queue.pop(0)
        for neighbor in adjacency.get(node, set()):
            if neighbor in distances:
                continue
            distances[neighbor] = distances[node] + 1
            queue.append(neighbor)
    return distances


def _validate_recursion_progression(
    snapshots: list[dict[str, Any]],
) -> list[tuple[str, str, str]]:
    stacks = [snapshot for snapshot in snapshots if snapshot.get("kind") == "call_stack_scene"]
    if not stacks:
        return []
    issues: list[tuple[str, str, str]] = []
    signatures: set[str] = set()
    frame_counts: list[int] = []
    current_ids: list[str] = []
    has_structured_return = False
    has_valid_factorial_trace = False
    return_order: list[int] = []
    return_values: dict[int, int] = {}
    invalid_return_value = False
    has_final_return = False

    for index, stack in enumerate(stacks):
        frames = [frame for frame in stack.get("frames") or [] if isinstance(frame, dict)]
        frame_ids = [str(frame.get("id")) for frame in frames if frame.get("id") is not None]
        current = stack.get("current_frame_id")
        if current is not None and str(current) not in set(frame_ids):
            issues.append(
                (
                    "invalid_state_reference",
                    f"$.steps[{index}].snapshot.current_frame_id",
                    "current_frame_id must reference a frame present in call_stack_scene.frames.",
                )
            )
        if len(frame_ids) != len(set(frame_ids)):
            issues.append(
                (
                    "invalid_state_reference",
                    f"$.steps[{index}].snapshot.frames",
                    "Call-stack frame ids must be unique within each step.",
                )
            )
        trace = stack.get("code_trace") if isinstance(stack.get("code_trace"), dict) else {}
        lines = [str(line) for line in trace.get("lines") or []]
        active_lines = [trace.get("active_line"), *(trace.get("active_lines") or [])]
        if lines and any(
            not isinstance(line, int) or line < 0 or line >= len(lines) for line in active_lines
        ):
            issues.append(
                (
                    "invalid_state_reference",
                    f"$.steps[{index}].snapshot.code_trace",
                    "Call-stack code trace references a line outside its source lines.",
                )
            )
        lowered_lines = "\n".join(lines).casefold()
        has_valid_factorial_trace = has_valid_factorial_trace or bool(
            "factorial" in lowered_lines
            and "return" in lowered_lines
            and ("n == 1" in lowered_lines or "n <= 1" in lowered_lines)
        )
        for frame in frames:
            variables = frame.get("variables") if isinstance(frame.get("variables"), dict) else {}
            return_keys = {
                str(key).casefold()
                for key in variables
                if any(token in str(key).casefold() for token in ("return", "result"))
            }
            has_structured_return = has_structured_return or bool(
                str(frame.get("state") or "").casefold() == "returned" or return_keys
            )
            n_value = _integer_value(variables.get("n"))
            for key, raw_value in variables.items():
                if not any(token in str(key).casefold() for token in ("return", "result")):
                    continue
                returned_value = _integer_value(raw_value)
                if n_value is None or returned_value is None or not 0 <= n_value <= 20:
                    invalid_return_value = True
                    continue
                if returned_value != math.factorial(n_value):
                    invalid_return_value = True
                if n_value not in return_order:
                    return_order.append(n_value)
                return_values[n_value] = returned_value
                if (
                    n_value == 4
                    and returned_value == 24
                    and str(frame.get("state") or "").casefold() == "returned"
                ):
                    has_final_return = True
        frame_counts.append(len(frames))
        if current is not None:
            current_ids.append(str(current))
        signatures.add(
            json.dumps(
                {"frames": frames, "current": current, "trace": trace},
                ensure_ascii=False,
                sort_keys=True,
            )
        )

    if len(signatures) < 2 or len(set(current_ids)) < 2:
        issues.append(
            (
                "missing_visual_transition",
                "$.steps[*].snapshot",
                "Recursion stack never changes active frame or structured state across steps.",
            )
        )
    grows = any(left < right for left, right in zip(frame_counts, frame_counts[1:], strict=False))
    shrinks = any(left > right for left, right in zip(frame_counts, frame_counts[1:], strict=False))
    if not grows or not shrinks:
        issues.append(
            (
                "invalid_state_transition",
                "$.steps[*].snapshot.frames",
                "Recursive stack must visibly push frames and later unwind them.",
            )
        )
    expected_returns = {1: 1, 2: 2, 3: 6, 4: 24}
    has_valid_return_values = (
        not invalid_return_value
        and all(
            return_values.get(n_value) == result for n_value, result in expected_returns.items()
        )
        and return_order[:4] == [1, 2, 3, 4]
        and has_final_return
    )
    if not has_structured_return or not has_valid_factorial_trace or not has_valid_return_values:
        issues.append(
            (
                "invalid_semantic_evidence",
                "$.steps[*].snapshot",
                (
                    "Factorial recursion requires executable code trace and "
                    "structured return propagation 1, 2, 6, 24 through n=1..4."
                ),
            )
        )
    return _dedupe_semantic_issues(issues)


def _integer_value(value: Any) -> int | None:
    numeric = _finite_float(value)
    if numeric is None or not numeric.is_integer():
        return None
    return int(numeric)


def _dedupe_consecutive(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        if not result or result[-1] != value:
            result.append(value)
    return result


def _dedupe_semantic_issues(
    issues: list[tuple[str, str, str]],
) -> list[tuple[str, str, str]]:
    return list(dict.fromkeys(issues))


def _has_state_field(snapshot: dict[str, Any], field_name: str) -> bool:
    found, current = _resolve_state_field(snapshot, field_name)
    return found and _meaningful(current)


def _state_field_equals(snapshot: dict[str, Any], field_name: str, expected: Any) -> bool:
    found, current = _resolve_state_field(snapshot, field_name)
    return found and current == expected


def _resolve_state_field(
    snapshot: dict[str, Any],
    field_name: str,
) -> tuple[bool, Any]:
    path = field_name.removeprefix("snapshot.").split(".")
    current: Any = snapshot
    for part in path:
        if not isinstance(current, dict) or part not in current:
            return False, None
        current = current[part]
    return True, current


def _meaningful(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str | list | tuple | dict | set):
        return bool(value)
    return True


_CONTENT_KEYS = {
    "text",
    "caption",
    "label",
    "formula_latex",
    "annotations",
    "highlights",
    "lines",
    "variables",
    "operation_label",
}


def _content_text(payload: dict[str, Any]) -> str:
    parts = [str(payload.get(key) or "") for key in ("title", "summary")]
    for step in payload.get("steps") or []:
        if not isinstance(step, dict):
            continue
        parts.extend([str(step.get("title") or ""), str(step.get("voiceover_text") or "")])
        _collect_content_values(step.get("snapshot"), parts)
        _collect_content_values(step.get("code_highlight"), parts)
    return "\n".join(parts)


def _conclusion_text(payload: dict[str, Any]) -> str:
    return "\n".join([str(payload.get("summary") or ""), _final_step_text(payload)])


def _final_step_text(payload: dict[str, Any]) -> str:
    steps = payload.get("steps") or []
    if not steps or not isinstance(steps[-1], dict):
        return ""
    step = steps[-1]
    parts = [str(step.get("title") or ""), str(step.get("voiceover_text") or "")]
    _collect_content_values(step.get("snapshot"), parts)
    _collect_content_values(step.get("code_highlight"), parts)
    return "\n".join(parts)


def _collect_content_values(value: Any, parts: list[str], *, selected: bool = False) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            _collect_content_values(item, parts, selected=selected or key in _CONTENT_KEYS)
    elif isinstance(value, list):
        for item in value:
            _collect_content_values(item, parts, selected=selected)
    elif selected and isinstance(value, str | int | float):
        parts.append(str(value))


def _flatten_strings(value: Any) -> str:
    parts: list[str] = []
    if isinstance(value, dict):
        for item in value.values():
            text = _flatten_strings(item)
            if text:
                parts.append(text)
    elif isinstance(value, list):
        for item in value:
            text = _flatten_strings(item)
            if text:
                parts.append(text)
    elif isinstance(value, str):
        parts.append(value)
    return " ".join(parts)


def _fact_matches(fact: TextFactExpectation, text: str) -> bool:
    return any(_contains_alias(text, alias) for alias in fact.any_of)


def _conclusion_matches(expectation: ConclusionExpectation, text: str) -> bool:
    groups_match = all(
        any(_contains_alias(text, alias) for alias in group) for group in expectation.all_of
    )
    forbidden_absent = not any(_contains_alias(text, alias) for alias in expectation.none_of)
    return groups_match and forbidden_absent


def _contains_alias(text: str, alias: str) -> bool:
    normalized_text = text.casefold()
    normalized_alias = alias.casefold()
    if not any(character.isdigit() for character in normalized_alias):
        return normalized_alias in normalized_text
    pattern = re.escape(normalized_alias).replace(r"\ ", r"\s*")
    if normalized_alias and normalized_alias[0].isdigit():
        pattern = rf"(?<![\d.]){pattern}"
    if normalized_alias and normalized_alias[-1].isdigit():
        pattern = rf"{pattern}(?![\d.])"
    return re.search(pattern, normalized_text) is not None


def _timeline_checks(payload: dict[str, Any]) -> tuple[bool, bool]:
    steps = [step for step in payload.get("steps") or [] if isinstance(step, dict)]
    frames = [step.get("end_frame") for step in steps]
    if not frames or not all(isinstance(frame, int | float) for frame in frames):
        return False, False
    monotonic = all(left < right for left, right in zip(frames, frames[1:], strict=False))
    total = payload.get("total_frames")
    within_total = isinstance(total, int | float) and frames[-1] <= total
    return monotonic, within_total


def legacy_structural_score(prompt_id: str, raw_json: str) -> ScoreCard:
    """Explicitly named compatibility entry point for historical reports."""

    return score_playbook_legacy(prompt_id, raw_json)
