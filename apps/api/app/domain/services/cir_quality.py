from __future__ import annotations

import json
from typing import Any

from app.domain.models.cir import (
    CirDocument,
    CirStep,
    ExecutionCheckpoint,
    ExecutionMap,
    LayerSpec,
    SceneSpec,
)
from app.domain.models.review import CirReviewIssue, ReviewSeverity
from app.domain.models.topic import TopicDomain, VisualKind

_GEOMETRY_HINT_KEYWORDS = (
    "向量场",
    "区域",
    "边界",
    "环路",
    "闭合",
    "参数方程",
    "旋度",
    "散度",
    "通量",
    "线积分",
    "面积分",
    "二重积分",
    "格林",
    "斯托克斯",
    "高斯",
    "圆周",
    "椭圆",
    "多边形",
    "曲面",
)

_TIME_EPS = 1e-6


def validate_cir_quality(
    cir: CirDocument,
    execution_map: ExecutionMap | None,
    prompt: str,  # noqa: ARG001 - reserved for prompt-level pedagogy validators.
) -> list[CirReviewIssue]:
    """Run deterministic, pure validation over parsed CIR output."""

    issues: list[CirReviewIssue] = []
    issues.extend(validate_math_visual_kind(cir))
    issues.extend(validate_required_visual_payloads(cir))
    issues.extend(validate_duplicate_layers(cir))
    issues.extend(validate_execution_map_alignment(cir, execution_map))
    return issues


def validate_math_visual_kind(cir: CirDocument) -> list[CirReviewIssue]:
    issues: list[CirReviewIssue] = []
    if cir.domain != TopicDomain.MATH:
        return issues

    for index, step in enumerate(cir.steps):
        if step.visual_kind == VisualKind.ARRAY:
            issues.append(
                _issue(
                    "math_array_visual_kind",
                    ReviewSeverity.ERROR,
                    f"cir.steps[{index}].visual_kind",
                    "Math domain steps must not use visual_kind=array.",
                    'Use "function", "scene", or "formula" for math content.',
                )
            )
        if _looks_like_2d_geometry(step) and step.visual_kind != VisualKind.SCENE:
            issues.append(
                _issue(
                    "math_geometry_requires_scene",
                    ReviewSeverity.ERROR,
                    f"cir.steps[{index}].visual_kind",
                    "This step mentions 2D geometry content but does not use scene.",
                    'Use visual_kind="scene" and populate cir.steps[index].scene.',
                )
            )
    return issues


def validate_required_visual_payloads(cir: CirDocument) -> list[CirReviewIssue]:
    issues: list[CirReviewIssue] = []
    for index, step in enumerate(cir.steps):
        if step.visual_kind == VisualKind.SCENE:
            if step.scene is None:
                issues.append(
                    _issue(
                        "scene_missing_payload",
                        ReviewSeverity.ERROR,
                        f"cir.steps[{index}].scene",
                        "visual_kind=scene requires a scene payload.",
                        "Populate scene with regions, curves, segments, points, or vector_field.",
                    )
                )
            elif not _scene_has_geometry(step.scene):
                issues.append(
                    _issue(
                        "scene_empty_geometry",
                        ReviewSeverity.ERROR,
                        f"cir.steps[{index}].scene",
                        "Scene payload has no visible geometry.",
                        "Add at least one curve, region, segment, point, or vector_field.",
                    )
                )

        if step.visual_kind == VisualKind.FUNCTION:
            if step.plot is None or not step.plot.curves:
                issues.append(
                    _issue(
                        "function_missing_curves",
                        ReviewSeverity.ERROR,
                        f"cir.steps[{index}].plot.curves",
                        "visual_kind=function requires plot.curves.",
                        "Add at least one function curve expression.",
                    )
                )

        if step.visual_kind == VisualKind.FORMULA:
            if step.plot is None or not step.plot.formula_latex:
                issues.append(
                    _issue(
                        "formula_missing_latex",
                        ReviewSeverity.ERROR,
                        f"cir.steps[{index}].plot.formula_latex",
                        "visual_kind=formula requires plot.formula_latex.",
                        "Add a concise KaTeX formula for the step.",
                    )
                )
    return issues


def validate_duplicate_layers(cir: CirDocument) -> list[CirReviewIssue]:
    issues: list[CirReviewIssue] = []
    for step_index, step in enumerate(cir.steps):
        previous_signature: str | None = None
        for layer_index, layer in enumerate(step.layers):
            signature = _stable_layer_body(layer)
            if signature == previous_signature:
                issues.append(
                    _issue(
                        "duplicate_identical_layer",
                        ReviewSeverity.WARNING,
                        f"cir.steps[{step_index}].layers[{layer_index}]",
                        "Consecutive duplicate layers in a single step are redundant.",
                        "Remove the duplicate layer or merge its timing with the previous layer.",
                    )
                )
            previous_signature = signature
    return issues


def validate_execution_map_alignment(
    cir: CirDocument,
    execution_map: ExecutionMap | None,
) -> list[CirReviewIssue]:
    if execution_map is None:
        return []

    step_by_id = {step.id: step for step in cir.steps}
    issues: list[CirReviewIssue] = []
    checkpoints = execution_map.checkpoints

    if len(checkpoints) != len(cir.steps):
        issues.append(
            _issue(
                "execution_map_checkpoint_count_mismatch",
                ReviewSeverity.ERROR,
                "execution_map.checkpoints",
                (
                    "ExecutionMap checkpoint count must match CIR step count "
                    f"({len(checkpoints)} != {len(cir.steps)})."
                ),
                "Emit exactly one checkpoint for each cir.steps item.",
            )
        )

    cursor = 0.0
    for index, checkpoint in enumerate(checkpoints):
        expected_step = cir.steps[index] if index < len(cir.steps) else None
        actual_step = step_by_id.get(checkpoint.step_id)

        if checkpoint.step_id not in step_by_id:
            issues.append(
                _issue(
                    "execution_map_orphan_checkpoint",
                    ReviewSeverity.ERROR,
                    f"execution_map.checkpoints[{index}].step_id",
                    f'Checkpoint references unknown CIR step_id "{checkpoint.step_id}".',
                    "Use a step_id that exists in cir.steps.",
                )
            )

        if checkpoint.step_index != index:
            issues.append(
                _issue(
                    "execution_map_step_index_mismatch",
                    ReviewSeverity.ERROR,
                    f"execution_map.checkpoints[{index}].step_index",
                    (
                        "Checkpoint step_index must match its position in "
                        f"execution_map.checkpoints ({checkpoint.step_index} != {index})."
                    ),
                    "Keep checkpoints in the same order as cir.steps.",
                )
            )

        if expected_step is not None and checkpoint.step_id != expected_step.id:
            issues.append(
                _issue(
                    "execution_map_step_id_mismatch",
                    ReviewSeverity.ERROR,
                    f"execution_map.checkpoints[{index}].step_id",
                    (
                        "Checkpoint step_id must match the CIR step at the same index "
                        f'("{checkpoint.step_id}" != "{expected_step.id}").'
                    ),
                    "Use cir.steps[index].id for the checkpoint step_id.",
                )
            )

        if expected_step is not None and checkpoint.visual_kind != expected_step.visual_kind:
            issues.append(
                _issue(
                    "execution_map_visual_kind_mismatch",
                    ReviewSeverity.ERROR,
                    f"execution_map.checkpoints[{index}].visual_kind",
                    (
                        "Checkpoint visual_kind must mirror the CIR step at the same index "
                        f'("{checkpoint.visual_kind}" != "{expected_step.visual_kind}").'
                    ),
                    "Copy cir.steps[index].visual_kind into the checkpoint.",
                )
            )

        if checkpoint.end_s <= checkpoint.start_s + _TIME_EPS:
            issues.append(
                _issue(
                    "execution_map_invalid_checkpoint_duration",
                    ReviewSeverity.ERROR,
                    f"execution_map.checkpoints[{index}].end_s",
                    "Checkpoint end_s must be greater than start_s.",
                    "Set a positive duration for this checkpoint.",
                )
            )

        if checkpoint.start_s > cursor + _TIME_EPS:
            issues.append(
                _issue(
                    "execution_map_time_gap",
                    ReviewSeverity.ERROR,
                    f"execution_map.checkpoints[{index}].start_s",
                    (
                        "ExecutionMap checkpoint timeline has a gap before this checkpoint "
                        f"({checkpoint.start_s} > {cursor})."
                    ),
                    "Make each checkpoint start at the previous checkpoint's end_s.",
                )
            )
        elif checkpoint.start_s < cursor - _TIME_EPS:
            issues.append(
                _issue(
                    "execution_map_time_overlap",
                    ReviewSeverity.ERROR,
                    f"execution_map.checkpoints[{index}].start_s",
                    (
                        "ExecutionMap checkpoint timeline overlaps the previous checkpoint "
                        f"({checkpoint.start_s} < {cursor})."
                    ),
                    "Make each checkpoint start at the previous checkpoint's end_s.",
                )
            )
        cursor = checkpoint.end_s

        if actual_step is not None:
            issues.extend(
                _validate_execution_map_references(
                    checkpoint_index=index,
                    checkpoint=checkpoint,
                    step=actual_step,
                    execution_map=execution_map,
                )
            )

    if abs(cursor - execution_map.duration_s) > _TIME_EPS:
        issues.append(
            _issue(
                "execution_map_duration_mismatch",
                ReviewSeverity.ERROR,
                "execution_map.duration_s",
                (
                    "ExecutionMap duration_s must match the end_s of the final checkpoint "
                    f"({execution_map.duration_s} != {cursor})."
                ),
                "Set duration_s to the final checkpoint end_s.",
            )
        )
    return issues


def _validate_execution_map_references(
    *,
    checkpoint_index: int,
    checkpoint: ExecutionCheckpoint,
    step: CirStep,
    execution_map: ExecutionMap,
) -> list[CirReviewIssue]:
    issues: list[CirReviewIssue] = []

    token_ids = {token.id for token in step.tokens}
    unknown_tokens = [token_id for token_id in checkpoint.focus_tokens if token_id not in token_ids]
    if unknown_tokens:
        issues.append(
            _issue(
                "execution_map_unknown_focus_token",
                ReviewSeverity.WARNING,
                f"execution_map.checkpoints[{checkpoint_index}].focus_tokens",
                f"Checkpoint focus_tokens reference unknown token ids: {unknown_tokens}.",
                "Only reference token ids from the same CIR step.",
            )
        )

    max_token_index = len(step.tokens) - 1
    for field in ("array_focus_indices", "array_reference_indices", "swap_indices"):
        values = list(getattr(checkpoint, field))
        invalid = [value for value in values if value < 0 or value > max_token_index]
        if invalid:
            issues.append(
                _issue(
                    "execution_map_array_index_out_of_range",
                    ReviewSeverity.WARNING,
                    f"execution_map.checkpoints[{checkpoint_index}].{field}",
                    (
                        f"Checkpoint {field} contains indices outside this step's "
                        f"token range: {invalid}."
                    ),
                    "Only reference array indices that exist in cir.steps[index].tokens.",
                )
            )

    if execution_map.algorithm_code:
        max_line = len(execution_map.algorithm_code) - 1
        invalid_lines = [
            line for line in checkpoint.code_lines if line < 0 or line > max_line
        ]
        if invalid_lines:
            issues.append(
                _issue(
                    "execution_map_code_line_out_of_range",
                    ReviewSeverity.WARNING,
                    f"execution_map.checkpoints[{checkpoint_index}].code_lines",
                    f"Checkpoint code_lines contains out-of-range lines: {invalid_lines}.",
                    "Only reference 0-indexed lines from execution_map.algorithm_code.",
                )
            )

    return issues


def _looks_like_2d_geometry(cir_step: CirStep) -> bool:
    haystack = (cir_step.title or "") + " "
    narration = cir_step.narration
    if isinstance(narration, str):
        haystack += narration
    elif isinstance(narration, list):
        haystack += " ".join(seg for seg in narration if isinstance(seg, str))
    return any(keyword in haystack for keyword in _GEOMETRY_HINT_KEYWORDS)


def _scene_has_geometry(scene: SceneSpec) -> bool:
    return bool(
        scene.curves
        or scene.regions
        or scene.segments
        or scene.points
        or scene.vector_field
    )


def _stable_layer_body(layer: LayerSpec) -> str:
    body: dict[str, Any] = {
        "kind": layer.kind.value,
        "scene": layer.scene.model_dump(mode="json") if layer.scene else None,
        "plot": layer.plot.model_dump(mode="json") if layer.plot else None,
        "katex_overlay": (
            layer.katex_overlay.model_dump(mode="json") if layer.katex_overlay else None
        ),
        "narration_card": (
            layer.narration_card.model_dump(mode="json") if layer.narration_card else None
        ),
    }
    return json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _issue(
    code: str,
    severity: ReviewSeverity,
    path: str,
    message: str,
    suggestion: str | None = None,
) -> CirReviewIssue:
    return CirReviewIssue(
        code=code,
        severity=severity,
        path=path,
        message=message,
        suggestion=suggestion,
    )
