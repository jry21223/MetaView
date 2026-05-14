from __future__ import annotations

from app.domain.models.cir import (
    CirDocument,
    CirStep,
    ExecutionCheckpoint,
    ExecutionMap,
    LayerKind,
    LayerSpec,
    PlotCurveSpec,
    PlotSpec,
    SceneSpec,
)
from app.domain.models.review import ReviewSeverity
from app.domain.models.topic import TopicDomain, VisualKind
from app.domain.services.cir_quality import validate_cir_quality


def _cir(step: CirStep) -> CirDocument:
    return CirDocument(
        title="Math",
        domain=TopicDomain.MATH,
        summary="summary",
        steps=[step],
    )


def _codes(cir: CirDocument, execution_map: ExecutionMap | None = None) -> set[str]:
    return {issue.code for issue in validate_cir_quality(cir, execution_map, "prompt")}


def test_math_domain_array_reports_math_array_visual_kind() -> None:
    step = CirStep(
        id="s1",
        title="数组不适合数学",
        narration="数学内容",
        visual_kind=VisualKind.ARRAY,
    )

    assert "math_array_visual_kind" in _codes(_cir(step))


def test_math_geometry_formula_reports_scene_required() -> None:
    step = CirStep(
        id="s1",
        title="向量场是什么",
        narration="向量场 F=(-y,x) 每个点都有方向。",
        visual_kind=VisualKind.FORMULA,
        plot=PlotSpec(formula_latex="F=(-y,x)"),
    )

    assert "math_geometry_requires_scene" in _codes(_cir(step))


def test_scene_with_empty_geometry_reports_empty_geometry() -> None:
    step = CirStep(
        id="s1",
        title="空场景",
        narration="先看坐标系。",
        visual_kind=VisualKind.SCENE,
        scene=SceneSpec(),
    )

    assert "scene_empty_geometry" in _codes(_cir(step))


def test_function_without_curves_reports_missing_curves() -> None:
    step = CirStep(
        id="s1",
        title="函数图像",
        narration="画 f(x)。",
        visual_kind=VisualKind.FUNCTION,
        plot=PlotSpec(curves=[]),
    )

    assert "function_missing_curves" in _codes(_cir(step))


def test_formula_without_latex_reports_missing_latex() -> None:
    step = CirStep(
        id="s1",
        title="公式",
        narration="写公式。",
        visual_kind=VisualKind.FORMULA,
        plot=PlotSpec(),
    )

    assert "formula_missing_latex" in _codes(_cir(step))


def test_duplicate_consecutive_identical_math_formula_layers_warns() -> None:
    step = CirStep(
        id="s1",
        title="公式",
        narration="写公式。",
        visual_kind=VisualKind.FORMULA,
        plot=PlotSpec(formula_latex="a=b"),
        layers=[
            LayerSpec(kind=LayerKind.MATH_FORMULA, plot=PlotSpec(formula_latex="a=b")),
            LayerSpec(kind=LayerKind.MATH_FORMULA, plot=PlotSpec(formula_latex="a=b")),
        ],
    )

    issues = validate_cir_quality(_cir(step), None, "prompt")

    assert any(
        issue.code == "duplicate_identical_layer"
        and issue.severity == ReviewSeverity.WARNING
        for issue in issues
    )


def test_execution_map_orphan_checkpoint_warns() -> None:
    step = CirStep(
        id="s1",
        title="函数图像",
        narration="画 f(x)。",
        visual_kind=VisualKind.FUNCTION,
        plot=PlotSpec(curves=[PlotCurveSpec(expression="x")]),
    )
    execution_map = ExecutionMap(
        duration_s=2,
        checkpoints=[
            ExecutionCheckpoint(
                id="cp1",
                step_index=0,
                step_id="missing",
                visual_kind=VisualKind.FUNCTION,
                title="bad",
                summary="bad",
                start_s=0,
                end_s=2,
            )
        ],
    )

    issues = validate_cir_quality(_cir(step), execution_map, "prompt")

    assert any(issue.code == "execution_map_orphan_checkpoint" for issue in issues)


def test_clean_run_has_no_issues() -> None:
    step = CirStep(
        id="s1",
        title="画函数",
        narration="先画 f(x)=x。",
        visual_kind=VisualKind.FUNCTION,
        plot=PlotSpec(curves=[PlotCurveSpec(expression="x")]),
    )

    assert validate_cir_quality(_cir(step), None, "prompt") == []
