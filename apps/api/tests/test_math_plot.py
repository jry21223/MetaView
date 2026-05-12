"""Tests for the math function-plot path: CIR ``visual_kind=function`` → MathPlotSnapshot."""
import pytest

from app.domain.models.cir import CirDocument, CirStep, PlotCurveSpec, PlotSpec
from app.domain.models.playbook import (
    AlgorithmArraySnapshot,
    MathPlotSnapshot,
)
from app.domain.models.topic import TopicDomain, VisualKind
from app.domain.services.playbook_builder import build_playbook


def _math_cir(plot: PlotSpec | None, visual_kind: VisualKind = VisualKind.FUNCTION) -> CirDocument:
    return CirDocument(
        title="抛物线",
        domain=TopicDomain.MATH,
        summary="演示 f(x) = x^2",
        steps=[
            CirStep(
                id="step-1",
                title="画出曲线",
                narration="先画出 f(x) = x^2",
                visual_kind=visual_kind,
                tokens=[],
                plot=plot,
            )
        ],
    )


class TestMathPlotSnapshot:
    def test_function_step_builds_math_plot_snapshot(self):
        cir = _math_cir(
            PlotSpec(
                curves=[PlotCurveSpec(expression="x^2", label="f(x)")],
                x_min=-3.0,
                x_max=3.0,
                formula_latex="f(x) = x^2",
            )
        )
        pb = build_playbook(cir, execution_map=None)
        snap = pb.steps[0].snapshot
        assert isinstance(snap, MathPlotSnapshot)
        assert snap.kind == "math_plot"
        assert [c.expression for c in snap.curves] == ["x^2"]
        assert snap.curves[0].label == "f(x)"
        assert snap.x_min == -3.0 and snap.x_max == 3.0
        assert snap.formula_latex == "f(x) = x^2"

    def test_marker_x_clamped_to_domain(self):
        cir = _math_cir(
            PlotSpec(curves=[PlotCurveSpec(expression="x")], x_min=0.0, x_max=4.0, marker_x=99.0)
        )
        snap = build_playbook(cir, execution_map=None).steps[0].snapshot
        assert isinstance(snap, MathPlotSnapshot)
        assert snap.marker_x == 4.0

    def test_shade_bounds_clamped_and_ordered(self):
        cir = _math_cir(
            PlotSpec(
                curves=[PlotCurveSpec(expression="x^2")],
                x_min=0.0,
                x_max=5.0,
                shade_from=4.0,
                shade_to=-2.0,  # out of order + below x_min
            )
        )
        snap = build_playbook(cir, execution_map=None).steps[0].snapshot
        assert isinstance(snap, MathPlotSnapshot)
        assert snap.shade_from == 0.0
        assert snap.shade_to == 4.0

    def test_inverted_domain_falls_back_to_default(self):
        cir = _math_cir(
            PlotSpec(curves=[PlotCurveSpec(expression="x")], x_min=5.0, x_max=5.0)
        )
        snap = build_playbook(cir, execution_map=None).steps[0].snapshot
        assert isinstance(snap, MathPlotSnapshot)
        assert snap.x_min == -10.0 and snap.x_max == 10.0

    @pytest.mark.parametrize(
        "bad_expr",
        ["__import__('os')", "x; rm -rf", "lambda: 1", "a' OR '1'='1", ""],
    )
    def test_unsafe_expressions_are_dropped(self, bad_expr):
        cir = _math_cir(PlotSpec(curves=[PlotCurveSpec(expression=bad_expr)]))
        snap = build_playbook(cir, execution_map=None).steps[0].snapshot
        # No safe curves left → degrade to the array view rather than render nothing.
        assert isinstance(snap, AlgorithmArraySnapshot)

    def test_mixed_curves_keep_only_safe_ones(self):
        cir = _math_cir(
            PlotSpec(
                curves=[
                    PlotCurveSpec(expression="x^2", label="f"),
                    PlotCurveSpec(expression="<script>alert(1)</script>", label="bad"),
                    PlotCurveSpec(expression="2*x", label="f'", emphasis="secondary"),
                ]
            )
        )
        snap = build_playbook(cir, execution_map=None).steps[0].snapshot
        assert isinstance(snap, MathPlotSnapshot)
        assert [c.expression for c in snap.curves] == ["x^2", "2*x"]
        assert snap.curves[1].emphasis == "secondary"

    def test_unknown_emphasis_normalised_to_primary(self):
        cir = _math_cir(PlotSpec(curves=[PlotCurveSpec(expression="sin(x)", emphasis="weird")]))
        snap = build_playbook(cir, execution_map=None).steps[0].snapshot
        assert isinstance(snap, MathPlotSnapshot)
        assert snap.curves[0].emphasis == "primary"

    def test_function_visual_kind_without_plot_degrades_to_array(self):
        cir = _math_cir(None)
        snap = build_playbook(cir, execution_map=None).steps[0].snapshot
        assert isinstance(snap, AlgorithmArraySnapshot)

    def test_function_supported_math_syntax_passes_whitelist(self):
        cir = _math_cir(
            PlotSpec(
                curves=[PlotCurveSpec(expression="0.5*exp(-x^2) + sin(x)/2 - abs(x)")],
                x_min=-4.0,
                x_max=4.0,
            )
        )
        snap = build_playbook(cir, execution_map=None).steps[0].snapshot
        assert isinstance(snap, MathPlotSnapshot)
        assert snap.curves[0].expression == "0.5*exp(-x^2) + sin(x)/2 - abs(x)"
