"""Tests for the Animation Tool Registry — macro expansion and CIR integration."""

import pytest

from app.domain.animation_tools import expand_animation_call, expand_cir_animation_calls
from app.domain.animation_tools.registry import _REGISTRY
from app.domain.models.cir import (
    AnimationCall,
    CirDocument,
    CirStep,
    LayerKind,
    PlotSpec,
    VisualKind,
)
from app.domain.models.topic import TopicDomain


class TestShowTangent:
    def test_expands_to_layers(self):
        layers = expand_animation_call(
            "math.show_tangent",
            {
                "expression": "x^2",
                "x0": 2,
                "tangent_expression": "4*x - 4",
                "formula_latex": "f'(2)=4",
                "caption": "切线斜率就是这一点的瞬时变化率。",
                "x_min": -3,
                "x_max": 5,
            },
        )
        assert len(layers) >= 1
        # First layer must be a math_plot
        assert layers[0].kind == LayerKind.MATH_PLOT
        assert layers[0].plot is not None
        assert len(layers[0].plot.curves) == 2
        assert layers[0].plot.curves[0].expression == "x^2"
        assert layers[0].plot.curves[1].expression == "4*x - 4"
        assert layers[0].plot.marker_x == 2

    def test_minimal_args(self):
        layers = expand_animation_call("math.show_tangent", {"expression": "sin(x)", "x0": 0})
        assert len(layers) >= 1
        assert layers[0].kind == LayerKind.MATH_PLOT
        assert layers[0].plot is not None
        assert layers[0].plot.curves[0].expression == "sin(x)"

    def test_unknown_tool_returns_empty(self):
        layers = expand_animation_call("does_not_exist", {})
        assert layers == []


class TestShowFunction:
    def test_single_curve(self):
        layers = expand_animation_call(
            "math.show_function",
            {"expression": "x^2", "x_min": -3, "x_max": 3, "formula_latex": "f(x)=x^2"},
        )
        assert layers[0].kind == LayerKind.MATH_PLOT
        assert len(layers[0].plot.curves) == 1

    def test_two_curves(self):
        layers = expand_animation_call(
            "math.show_function", {"expression": "x^2", "expression_2": "2*x"}
        )
        assert len(layers[0].plot.curves) == 2


class TestShowIntegralArea:
    def test_basic(self):
        layers = expand_animation_call(
            "math.show_integral_area",
            {"expression": "x^2", "from_": 0, "to": 2},
        )
        assert layers[0].kind == LayerKind.MATH_PLOT
        assert layers[0].plot.shade_from == 0
        assert layers[0].plot.shade_to == 2


class TestExpandCirAnimationCalls:
    def test_expands_calls_in_steps(self):
        cir = CirDocument(
            title="抛物线切线",
            domain=TopicDomain.MATH,
            summary="演示切线概念",
            steps=[
                CirStep(
                    id="step-1",
                    title="先用动画工具",
                    narration="工具生成曲线与切线",
                    visual_kind=VisualKind.FUNCTION,
                    tokens=[],
                    animation_calls=[
                        AnimationCall(
                            tool="math.show_tangent",
                            args={
                                "expression": "x^2",
                                "x0": 2,
                                "tangent_expression": "4*x - 4",
                            },
                        )
                    ],
                ),
                CirStep(
                    id="step-2",
                    title="纯文本步",
                    narration="这一步没有动画调用",
                    visual_kind=VisualKind.FORMULA,
                    tokens=[],
                ),
            ],
        )
        expanded = expand_cir_animation_calls(cir)
        # Step 1 should have expanded layers and cleared animation_calls
        assert len(expanded.steps[0].layers) >= 1
        assert expanded.steps[0].animation_calls == []
        assert expanded.steps[0].layers[0].kind == LayerKind.MATH_PLOT
        # Step 2 should be untouched
        assert expanded.steps[1].animation_calls == []
        assert expanded.steps[1].layers == []

    def test_compatible_with_no_calls(self):
        cir = CirDocument(
            title="简单加法",
            domain=TopicDomain.MATH,
            summary="什么都不做",
            steps=[
                CirStep(
                    id="s1",
                    title="第一步",
                    narration="无工具",
                    visual_kind=VisualKind.FORMULA,
                    tokens=[],
                )
            ],
        )
        expanded = expand_cir_animation_calls(cir)
        assert len(expanded.steps) == 1
        assert expanded.steps[0].layers == []

    def test_preserves_existing_layers(self):
        cir = CirDocument(
            title="多层测试",
            domain=TopicDomain.ALGORITHM,
            summary="验证现有layers不被覆盖",
            steps=[
                CirStep(
                    id="s1",
                    title="有现有层",
                    narration="也有工具",
                    visual_kind=VisualKind.FUNCTION,
                    tokens=[],
                    layers=[],  # existing empty layers
                    animation_calls=[
                        AnimationCall(tool="math.show_tangent", args={"expression": "x", "x0": 1})
                    ],
                )
            ],
        )
        expanded = expand_cir_animation_calls(cir)
        assert len(expanded.steps[0].layers) >= 1


class TestRegistry:
    def test_registered_tools(self):
        assert "math.show_tangent" in _REGISTRY
        assert "math.show_function" in _REGISTRY
        assert "math.show_integral_area" in _REGISTRY

    def test_tool_count(self):
        # Expect at least 3 math tools
        math_tools = [k for k in _REGISTRY if k.startswith("math.")]
        assert len(math_tools) >= 3
