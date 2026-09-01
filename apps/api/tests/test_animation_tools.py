"""Tests for the Animation Tool Registry — macro expansion and CIR integration."""

import pytest

from app.domain.animation_tools import (
    expand_animation_call,
    expand_cir_animation_calls,
    safe_expand_animation_call,
    safe_expand_cir_animation_calls_with_issues,
)
from app.domain.animation_tools.registry import _REGISTRY, list_animation_tools
from app.domain.models.cir import (
    AnimationCall,
    CirDocument,
    CirStep,
    LayerKind,
    VisualKind,
)
from app.domain.models.playbook import PlaybookScript
from app.domain.models.topic import TopicDomain
from app.domain.services.cir_quality import validate_cir_quality
from app.domain.services.playbook_builder import build_playbook


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
        layers = expand_animation_call(
            "math.show_tangent",
            {"expression": "sin(x)", "x0": 0, "tangent_expression": "1"},
        )
        assert len(layers) >= 1
        assert layers[0].kind == LayerKind.MATH_PLOT
        assert layers[0].plot is not None
        assert layers[0].plot.curves[0].expression == "sin(x)"

    def test_unknown_tool_returns_issue(self):
        result = safe_expand_animation_call("does_not_exist", {})

        assert result.layers == []
        assert len(result.issues) == 1
        assert result.issues[0].code == "animation_tool.unknown_tool"
        assert result.issues[0].tool == "does_not_exist"

    def test_invalid_args_return_issue(self):
        result = safe_expand_animation_call("math.show_tangent", {"expression": "sin(x)"})

        assert result.layers == []
        assert len(result.issues) == 1
        assert result.issues[0].code == "animation_tool.invalid_args"


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


class TestNewMathTools:
    def test_derivative_compare(self):
        result = safe_expand_animation_call(
            "math.show_derivative_compare",
            {
                "expression": "x^2",
                "derivative_expression": "2*x",
                "formula_latex": "f'(x)=2x",
            },
        )
        assert result.issues == []
        assert result.layers[0].kind == LayerKind.MATH_PLOT
        assert [curve.expression for curve in result.layers[0].plot.curves] == ["x^2", "2*x"]

    def test_function_transform(self):
        result = safe_expand_animation_call(
            "math.show_function_transform",
            {
                "base_expression": "x^2",
                "transformed_expression": "(x-1)^2+2",
                "formula_latex": "g(x)=f(x-1)+2",
            },
        )
        assert result.issues == []
        assert result.layers[0].kind == LayerKind.MATH_PLOT
        assert len(result.layers[0].plot.curves) == 2

    def test_parametric_curve(self):
        result = safe_expand_animation_call(
            "math.show_parametric_curve",
            {
                "expression_x": "cos(t)",
                "expression_y": "sin(t)",
                "t_min": 0,
                "t_max": 6.28,
                "formula_latex": "x=\\cos t, y=\\sin t",
            },
        )
        assert result.issues == []
        assert result.layers[0].kind == LayerKind.MATH_SCENE
        assert result.layers[0].scene.curves[0].expression_x == "cos(t)"

    def test_region_boundary(self):
        result = safe_expand_animation_call(
            "math.show_region_boundary",
            {
                "vertices": [[0, 0], [2, 0], [2, 1], [0, 1]],
                "label": "R",
                "caption": "矩形区域边界。",
            },
        )
        assert result.issues == []
        assert result.layers[0].kind == LayerKind.MATH_SCENE
        assert result.layers[0].scene.regions[0].label == "R"


class TestSubjectTools:
    def test_physics_force_diagram(self):
        result = safe_expand_animation_call(
            "physics.force_diagram",
            {
                "forces": [
                    {"name": "F", "magnitude": 10, "angle_deg": 0},
                    {"name": "N", "magnitude": 5, "angle_deg": 90},
                ],
                "caption": "受力图。",
            },
        )
        assert result.issues == []
        assert result.layers[0].kind == LayerKind.MATH_SCENE
        assert len(result.layers[0].scene.segments) == 2

    def test_physics_projectile_motion(self):
        result = safe_expand_animation_call(
            "physics.projectile_motion",
            {"v0": 10, "angle_deg": 30},
        )
        assert result.issues == []
        assert result.layers[0].kind == LayerKind.MOTION_SCENE
        assert result.layers[0].motion_scene.objects[0].id == "projectile"

    def test_chemistry_stoichiometry_table(self):
        result = safe_expand_animation_call(
            "chemistry.stoichiometry_table",
            {
                "equation_latex": "2H_2 + O_2 \\to 2H_2O",
                "rows": [
                    {"species": "H2", "coefficient": 2, "mol": 1, "role": "limiting"},
                    {"species": "O2", "coefficient": 1, "mol": 1, "role": "excess"},
                ],
            },
        )
        assert result.issues == []
        assert result.layers[0].kind == LayerKind.TABLE_SCENE
        assert result.layers[0].table_scene.rows[0][0] == "H2"

    def test_algorithm_graph_traversal(self):
        result = safe_expand_animation_call(
            "algorithm.graph_traversal",
            {
                "nodes": ["A", "B"],
                "edges": [{"source": "A", "target": "B"}],
                "active_node_ids": ["A"],
                "active_edge_ids": ["A->B"],
                "directed": True,
                "weighted": False,
                "caption": "BFS 当前访问 A。",
            },
        )
        assert result.issues == []
        assert result.layers[0].kind == LayerKind.GRAPH_SCENE
        assert result.layers[0].graph_scene.active_node_ids == ["A"]

    def test_biology_punnett_square(self):
        result = safe_expand_animation_call(
            "biology.punnett_square",
            {
                "parent_a": "Aa",
                "parent_b": "Aa",
                "alleles": ["A", "a"],
                "cells": [["AA", "Aa"], ["Aa", "aa"]],
                "phenotype_counts": {"dominant": 3, "recessive": 1},
            },
        )
        assert result.issues == []
        assert [layer.kind for layer in result.layers[:2]] == [
            LayerKind.TABLE_SCENE,
            LayerKind.STATS_CHART_SCENE,
        ]

    def test_stats_distribution_chart(self):
        result = safe_expand_animation_call(
            "stats.distribution_chart",
            {
                "chart_type": "bar",
                "series": [{"label": "P(X=k)", "values": [0.1, 0.3, 0.6]}],
                "x_label": "k",
                "y_label": "probability",
                "formula_latex": "P(X=k)",
            },
        )
        assert result.issues == []
        assert result.layers[0].kind == LayerKind.STATS_CHART_SCENE
        assert result.layers[0].stats_chart_scene.series[0].values == [0.1, 0.3, 0.6]


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
        expanded_result = safe_expand_cir_animation_calls_with_issues(cir)
        expanded = expanded_result.cir
        # Step 1 should have expanded layers and cleared animation_calls
        assert expanded_result.issues == []
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
                        AnimationCall(
                            tool="math.show_tangent",
                            args={"expression": "x", "x0": 1, "tangent_expression": "1"},
                        )
                    ],
                )
            ],
        )
        expanded = expand_cir_animation_calls(cir)
        assert len(expanded.steps[0].layers) >= 1

    def test_unknown_call_records_issue_and_preserves_step(self):
        cir = CirDocument(
            title="坏工具",
            domain=TopicDomain.MATH,
            summary="验证错误处理",
            steps=[
                CirStep(
                    id="s1",
                    title="未知工具",
                    narration="工具不存在。",
                    visual_kind=VisualKind.FORMULA,
                    animation_calls=[AnimationCall(tool="math.unknown", args={})],
                )
            ],
        )
        result = safe_expand_cir_animation_calls_with_issues(cir)

        assert result.cir.steps[0].animation_calls[0].tool == "math.unknown"
        assert result.issues[0].path == "cir.steps[0].animation_calls[0]"
        assert result.issues[0].code == "animation_tool.unknown_tool"

    def test_build_playbook_with_animation_calls_produces_valid_playbook(self):
        cir = CirDocument(
            title="导数对比",
            domain=TopicDomain.MATH,
            summary="用工具画函数与导数",
            steps=[
                CirStep(
                    id="s1",
                    title="函数与导数",
                    narration="先看函数，再看导函数。",
                    visual_kind=VisualKind.FUNCTION,
                    animation_calls=[
                        AnimationCall(
                            tool="math.show_derivative_compare",
                            args={
                                "expression": "x^2",
                                "derivative_expression": "2*x",
                                "formula_latex": "f'(x)=2x",
                            },
                        )
                    ],
                )
            ],
        )

        playbook = build_playbook(cir, execution_map=None)

        assert isinstance(playbook, PlaybookScript)
        assert playbook.steps[0].layers[0].body.kind == "math_plot"

    def test_cir_quality_reports_animation_tool_issue(self):
        cir = CirDocument(
            title="坏工具",
            domain=TopicDomain.MATH,
            summary="验证 review path",
            steps=[
                CirStep(
                    id="s1",
                    title="未知工具",
                    narration="工具不存在。",
                    visual_kind=VisualKind.FORMULA,
                    animation_calls=[AnimationCall(tool="math.unknown", args={})],
                )
            ],
        )
        issues = validate_cir_quality(cir, None, "prompt")

        assert any(issue.code == "animation_tool.unknown_tool" for issue in issues)


class TestRegistry:
    def test_registered_tools(self):
        assert "math.show_tangent" in _REGISTRY
        assert "math.show_function" in _REGISTRY
        assert "math.show_integral_area" in _REGISTRY
        assert "math.show_derivative_compare" in _REGISTRY
        assert "physics.force_diagram" in _REGISTRY
        assert "chemistry.stoichiometry_table" in _REGISTRY
        assert "algorithm.graph_traversal" in _REGISTRY
        assert "biology.punnett_square" in _REGISTRY
        assert "stats.distribution_chart" in _REGISTRY

    def test_tool_count(self):
        # Expect at least 3 math tools
        math_tools = [k for k in _REGISTRY if k.startswith("math.")]
        assert len(math_tools) >= 7

    def test_list_includes_args_schema_for_math_function(self):
        tools = {tool.name: tool for tool in list_animation_tools()}

        schema = tools["math.show_function"].args_schema

        assert tools["math.show_function"].description
        assert schema["type"] == "object"
        assert schema["properties"]["expression"]["minLength"] == 1
        assert "x_min" in schema["properties"]
        assert "x_max" in schema["properties"]

    @pytest.mark.parametrize(
        ("exc_type", "message"),
        [(KeyboardInterrupt, "ctrl-c"), (SystemExit, "system exit")],
    )
    def test_safe_expand_animation_call_propagates_process_control_exceptions(
        self,
        exc_type: type[BaseException],
        message: str,
    ):
        original = _REGISTRY.get("test.raise_base_exception")

        def raise_base_exception(_args):
            raise exc_type(message)

        _REGISTRY["test.raise_base_exception"] = raise_base_exception
        try:
            with pytest.raises(exc_type, match=message):
                safe_expand_animation_call("test.raise_base_exception", {})
        finally:
            if original is None:
                _REGISTRY.pop("test.raise_base_exception", None)
            else:
                _REGISTRY["test.raise_base_exception"] = original


class TestErrorEchoAndFailFast:
    """Issues #279/#280: field paths in errors and fail-fast expression checks."""

    def test_unknown_tool_lists_available_tools(self):
        result = safe_expand_animation_call("math.show_tangent_line", {})

        assert result.issues[0].code == "animation_tool.unknown_tool"
        assert "math.show_tangent" in result.issues[0].message

    def test_invalid_args_message_names_every_missing_field(self):
        result = safe_expand_animation_call("math.show_parametric_curve", {})

        assert result.issues[0].code == "animation_tool.invalid_args"
        message = result.issues[0].message
        for field in ("expression_x", "expression_y", "t_min", "t_max"):
            assert field in message

    def test_invalid_args_message_names_nested_field_path(self):
        result = safe_expand_animation_call(
            "physics.force_diagram",
            {"forces": [{"name": "重力", "magnitude": "9.8牛", "angle_deg": -90}]},
        )

        assert result.issues[0].code == "animation_tool.invalid_args"
        assert "forces.0.magnitude" in result.issues[0].message

    @pytest.mark.parametrize("bad_expression", ["x**2", "\\sin(x)"])
    def test_python_or_latex_expression_fails_fast(self, bad_expression):
        result = safe_expand_animation_call(
            "math.show_function", {"expression": bad_expression}
        )

        assert result.layers == []
        assert result.issues[0].code == "animation_tool.invalid_expression"
        assert "expression" in result.issues[0].message
        assert "'^'" in result.issues[0].message

    def test_caret_grammar_still_expands(self):
        result = safe_expand_animation_call(
            "math.show_function", {"expression": "x^2*sin(x)"}
        )

        assert result.issues == []
        assert result.layers[0].kind == LayerKind.MATH_PLOT

    def test_formula_latex_is_not_expression_checked(self):
        result = safe_expand_animation_call(
            "math.show_function",
            {"expression": "x^2", "formula_latex": "\\int_0^1 x^2 dx"},
        )

        assert result.issues == []


class TestDerivedTangentAndDerivative:
    """Issue #281: omit tangent/derivative expressions and get the true ones."""

    def test_show_tangent_derives_true_tangent_when_omitted(self):
        layers = expand_animation_call(
            "math.show_tangent", {"expression": "x^2", "x0": 2}
        )

        tangent = layers[0].plot.curves[1].expression
        from app.domain.services.safe_math_expr import compile_safe_math_expression

        fn = compile_safe_math_expression(tangent)
        # Tangent of x^2 at x0=2 is 4x - 4.
        for x in (-1.0, 0.0, 2.0, 3.5):
            assert fn({"x": x}) == pytest.approx(4 * x - 4)

    def test_show_tangent_keeps_explicit_tangent_expression(self):
        layers = expand_animation_call(
            "math.show_tangent",
            {"expression": "x^2", "x0": 2, "tangent_expression": "4*x - 4"},
        )

        assert layers[0].plot.curves[1].expression == "4*x - 4"

    def test_show_derivative_compare_derives_derivative_when_omitted(self):
        layers = expand_animation_call(
            "math.show_derivative_compare", {"expression": "x^3"}
        )

        derivative = layers[0].plot.curves[1].expression
        from app.domain.services.safe_math_expr import compile_safe_math_expression

        fn = compile_safe_math_expression(derivative)
        for x in (-2.0, 0.5, 3.0):
            assert fn({"x": x}) == pytest.approx(3 * x * x)

    def test_every_tool_documents_every_arg_field(self):
        for tool in list_animation_tools():
            properties = tool.args_schema.get("properties", {})
            defs = tool.args_schema.get("$defs", {})
            for name, prop in properties.items():
                assert _schema_field_documented(prop, defs), (
                    f"{tool.name}.{name} has no description"
                )
            for def_name, definition in defs.items():
                for name, prop in definition.get("properties", {}).items():
                    assert _schema_field_documented(prop, defs), (
                        f"{tool.name} ${def_name}.{name} has no description"
                    )


def _schema_field_documented(prop: dict, defs: dict) -> bool:
    if prop.get("description"):
        return True
    ref = prop.get("$ref", "")
    if ref.startswith("#/$defs/"):
        return True  # nested model documented via its own properties
    items = prop.get("items")
    if isinstance(items, dict) and items.get("$ref", "").startswith("#/$defs/"):
        return True
    for variant in prop.get("anyOf", []) or []:
        if isinstance(variant, dict) and variant.get("description"):
            return True
    return False
