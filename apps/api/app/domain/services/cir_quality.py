from __future__ import annotations

import json
from typing import Any

from app.domain.models.cir import CirDocument, CirStep, ExecutionMap, LayerSpec, SceneSpec
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

    step_ids = {step.id for step in cir.steps}
    issues: list[CirReviewIssue] = []
    for index, checkpoint in enumerate(execution_map.checkpoints):
        if checkpoint.step_id not in step_ids:
            issues.append(
                _issue(
                    "execution_map_orphan_checkpoint",
                    ReviewSeverity.WARNING,
                    f"execution_map.checkpoints[{index}].step_id",
                    f'Checkpoint references unknown CIR step_id "{checkpoint.step_id}".',
                    "Use a step_id that exists in cir.steps.",
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
