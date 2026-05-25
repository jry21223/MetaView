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
    VisualToken,
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


def _function_step(step_id: str, title: str = "画函数") -> CirStep:
    return CirStep(
        id=step_id,
        title=title,
        narration="先画出 f(x)=x。",
        visual_kind=VisualKind.FUNCTION,
        plot=PlotSpec(curves=[PlotCurveSpec(expression="x")]),
    )


def _array_step(step_id: str, title: str = "看数组") -> CirStep:
    return CirStep(
        id=step_id,
        title=title,
        narration="观察数组元素。",
        visual_kind=VisualKind.ARRAY,
        tokens=[
            VisualToken(id="t0", label="3"),
            VisualToken(id="t1", label="1"),
        ],
    )


def _doc(steps: list[CirStep], domain: TopicDomain = TopicDomain.ALGORITHM) -> CirDocument:
    return CirDocument(
        title="Demo",
        domain=domain,
        summary="summary",
        steps=steps,
    )


def _checkpoint(
    index: int,
    step_id: str,
    *,
    visual_kind: VisualKind = VisualKind.FUNCTION,
    start_s: float = 0,
    end_s: float = 2,
    focus_tokens: list[str] | None = None,
    array_focus_indices: list[int] | None = None,
    array_reference_indices: list[int] | None = None,
    swap_indices: list[int] | None = None,
    code_lines: list[int] | None = None,
) -> ExecutionCheckpoint:
    return ExecutionCheckpoint(
        id=f"cp{index + 1}",
        step_index=index,
        step_id=step_id,
        visual_kind=visual_kind,
        title=f"checkpoint {index + 1}",
        summary=f"checkpoint {index + 1}",
        start_s=start_s,
        end_s=end_s,
        focus_tokens=focus_tokens or [],
        array_focus_indices=array_focus_indices or [],
        array_reference_indices=array_reference_indices or [],
        swap_indices=swap_indices or [],
        code_lines=code_lines or [],
    )


def _execution_map(
    checkpoints: list[ExecutionCheckpoint],
    *,
    duration_s: float | None = None,
    algorithm_code: list[str] | None = None,
) -> ExecutionMap:
    return ExecutionMap(
        duration_s=duration_s if duration_s is not None else checkpoints[-1].end_s,
        checkpoints=checkpoints,
        algorithm_code=algorithm_code,
    )


def _issue_by_code(
    cir: CirDocument,
    execution_map: ExecutionMap,
    code: str,
) -> list:
    return [
        issue
        for issue in validate_cir_quality(cir, execution_map, "prompt")
        if issue.code == code
    ]


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


def test_execution_map_orphan_checkpoint_errors() -> None:
    step = _function_step("s1")
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

    assert any(
        issue.code == "execution_map_orphan_checkpoint"
        and issue.severity == ReviewSeverity.ERROR
        for issue in issues
    )


def test_execution_map_checkpoint_count_mismatch_errors() -> None:
    cir = _doc([_function_step("s1"), _function_step("s2")])
    execution_map = _execution_map([_checkpoint(0, "s1")])

    issues = _issue_by_code(cir, execution_map, "execution_map_checkpoint_count_mismatch")

    assert len(issues) == 1
    assert issues[0].severity == ReviewSeverity.ERROR


def test_execution_map_step_index_step_id_and_visual_kind_mismatches_error() -> None:
    cir = _doc([_function_step("s1"), _array_step("s2")])
    execution_map = _execution_map(
        [
            _checkpoint(1, "s2", visual_kind=VisualKind.ARRAY, start_s=0, end_s=2),
            _checkpoint(0, "s1", visual_kind=VisualKind.FUNCTION, start_s=2, end_s=4),
        ],
        duration_s=4,
    )
    issues = validate_cir_quality(cir, execution_map, "prompt")
    codes = {issue.code for issue in issues}

    assert "execution_map_step_index_mismatch" in codes
    assert "execution_map_step_id_mismatch" in codes
    assert "execution_map_visual_kind_mismatch" in codes
    assert all(
        issue.severity == ReviewSeverity.ERROR
        for issue in issues
        if issue.code
        in {
            "execution_map_step_index_mismatch",
            "execution_map_step_id_mismatch",
            "execution_map_visual_kind_mismatch",
        }
    )


def test_execution_map_time_gaps_overlaps_and_bad_duration_error() -> None:
    cir = _doc([_function_step("s1"), _function_step("s2"), _function_step("s3")])
    gap_map = _execution_map(
        [
            _checkpoint(0, "s1", start_s=0, end_s=1),
            _checkpoint(1, "s2", start_s=1.5, end_s=2),
            _checkpoint(2, "s3", start_s=2, end_s=3),
        ],
        duration_s=3,
    )
    overlap_map = _execution_map(
        [
            _checkpoint(0, "s1", start_s=0, end_s=1),
            _checkpoint(1, "s2", start_s=0.5, end_s=2),
            _checkpoint(2, "s3", start_s=2, end_s=3),
        ],
        duration_s=3,
    )
    zero_duration_map = _execution_map(
        [_checkpoint(0, "s1", start_s=0, end_s=0)],
        duration_s=1,
    )
    duration_mismatch_map = _execution_map(
        [
            _checkpoint(0, "s1", start_s=0, end_s=1),
            _checkpoint(1, "s2", start_s=1, end_s=2),
            _checkpoint(2, "s3", start_s=2, end_s=3),
        ],
        duration_s=4,
    )

    assert _issue_by_code(cir, gap_map, "execution_map_time_gap")[0].severity == ReviewSeverity.ERROR
    assert _issue_by_code(cir, overlap_map, "execution_map_time_overlap")[0].severity == ReviewSeverity.ERROR
    assert _issue_by_code(cir, zero_duration_map, "execution_map_invalid_checkpoint_duration")[0].severity == ReviewSeverity.ERROR
    assert _issue_by_code(cir, duration_mismatch_map, "execution_map_duration_mismatch")[0].severity == ReviewSeverity.ERROR


def test_execution_map_reference_integrity_warnings() -> None:
    cir = _doc([_array_step("s1")])
    execution_map = _execution_map(
        [
            _checkpoint(
                0,
                "s1",
                visual_kind=VisualKind.ARRAY,
                focus_tokens=["missing"],
                array_focus_indices=[2],
                array_reference_indices=[3],
                swap_indices=[0, 99],
                code_lines=[2],
            )
        ],
        algorithm_code=["line 0"],
    )
    issues = validate_cir_quality(cir, execution_map, "prompt")
    codes = {issue.code for issue in issues}

    assert "execution_map_unknown_focus_token" in codes
    assert "execution_map_array_index_out_of_range" in codes
    assert "execution_map_code_line_out_of_range" in codes
    assert all(
        issue.severity == ReviewSeverity.WARNING
        for issue in issues
        if issue.code
        in {
            "execution_map_unknown_focus_token",
            "execution_map_array_index_out_of_range",
            "execution_map_code_line_out_of_range",
        }
    )


def test_clean_multistep_execution_map_has_no_issues() -> None:
    cir = _doc([_function_step("s1"), _function_step("s2")])
    execution_map = _execution_map(
        [
            _checkpoint(0, "s1", start_s=0, end_s=2, code_lines=[0]),
            _checkpoint(1, "s2", start_s=2, end_s=4, code_lines=[1]),
        ],
        duration_s=4,
        algorithm_code=["line 0", "line 1"],
    )

    assert validate_cir_quality(cir, execution_map, "prompt") == []


def test_clean_run_has_no_issues() -> None:
    step = CirStep(
        id="s1",
        title="画函数",
        narration="先画 f(x)=x。",
        visual_kind=VisualKind.FUNCTION,
        plot=PlotSpec(curves=[PlotCurveSpec(expression="x")]),
    )

    assert validate_cir_quality(_cir(step), None, "prompt") == []
