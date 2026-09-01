"""Math animation tools — function plots, tangents, integral areas, etc."""

from __future__ import annotations

from pydantic import AliasChoices, BaseModel, Field

from app.domain.animation_tools.registry import EXPRESSION_GRAMMAR_HINT, register
from app.domain.models.cir import (
    KaTeXOverlaySpec,
    LayerKind,
    LayerSpec,
    LayerTimingSpec,
    NarrationCardSpec,
    PlotCurveSpec,
    PlotSpec,
    SceneCurve,
    SceneRegion,
    SceneSegment,
    SceneSpec,
)
from app.domain.skills.algebra_core import parse_expression
from app.domain.skills.algebra_core.parser import expression_to_source

_EXPR_DOC = f"Function of x in renderer grammar. {EXPRESSION_GRAMMAR_HINT}"
_LATEX_DOC = "Optional KaTeX string shown as a formula overlay (LaTeX allowed here only)."
_CAPTION_DOC = "Optional one-sentence caption rendered as a narration card."


class _PlotBounds(BaseModel):
    x_min: float = Field(default=-6.0, description="Left edge of the visible x range.")
    x_max: float = Field(default=6.0, description="Right edge of the visible x range.")
    y_min: float | None = Field(
        default=None, description="Optional fixed lower y bound (auto when null)."
    )
    y_max: float | None = Field(
        default=None, description="Optional fixed upper y bound (auto when null)."
    )


class MathShowTangentArgs(_PlotBounds):
    expression: str = Field(min_length=1, description=_EXPR_DOC)
    x0: float = Field(description="x value of the tangent point; also drawn as marker_x.")
    tangent_expression: str | None = Field(
        default=None,
        min_length=1,
        description=(
            "Optional explicit tangent line as a function of x. Omit it and the "
            "backend derives the true tangent of `expression` at `x0` symbolically; "
            "if you do pass it, you are responsible for its correctness."
        ),
    )
    formula_latex: str | None = Field(default=None, description=_LATEX_DOC)
    caption: str | None = Field(default=None, description=_CAPTION_DOC)


class MathShowFunctionArgs(_PlotBounds):
    expression: str = Field(min_length=1, description=_EXPR_DOC)
    expression_2: str | None = Field(
        default=None,
        description=f"Optional second curve g(x) for comparison. {EXPRESSION_GRAMMAR_HINT}",
    )
    formula_latex: str | None = Field(default=None, description=_LATEX_DOC)
    marker_x: float | None = Field(
        default=None, description="Optional x position highlighted with a marker dot."
    )
    shade_from: float | None = Field(
        default=None, description="Optional left x bound of a shaded interval under the curve."
    )
    shade_to: float | None = Field(
        default=None, description="Optional right x bound of the shaded interval."
    )


class MathShowIntegralAreaArgs(_PlotBounds):
    expression: str = Field(min_length=1, description=_EXPR_DOC)
    from_: float = Field(
        validation_alias=AliasChoices("from_", "from"),
        description="Lower integration bound (JSON key: `from` or `from_`).",
    )
    to: float = Field(description="Upper integration bound.")
    formula_latex: str | None = Field(default=None, description=_LATEX_DOC)


class MathShowDerivativeCompareArgs(_PlotBounds):
    expression: str = Field(min_length=1, description=_EXPR_DOC)
    derivative_expression: str | None = Field(
        default=None,
        min_length=1,
        description=(
            "Optional explicit derivative f'(x). Omit it and the backend "
            "differentiates `expression` symbolically; if you do pass it, you "
            "are responsible for its correctness."
        ),
    )
    formula_latex: str | None = Field(default=None, description=_LATEX_DOC)
    caption: str | None = Field(default=None, description=_CAPTION_DOC)


class MathShowFunctionTransformArgs(_PlotBounds):
    base_expression: str = Field(
        min_length=1, description=f"Base curve before the transform. {EXPRESSION_GRAMMAR_HINT}"
    )
    transformed_expression: str = Field(
        min_length=1, description="Transformed curve, same grammar as base_expression."
    )
    base_label: str = Field(default="f(x)", description="Legend label for the base curve.")
    transformed_label: str = Field(
        default="g(x)", description="Legend label for the transformed curve."
    )
    formula_latex: str | None = Field(default=None, description=_LATEX_DOC)
    caption: str | None = Field(default=None, description=_CAPTION_DOC)


class MathShowParametricCurveArgs(BaseModel):
    expression_x: str = Field(
        min_length=1, description=f"x(t) of the parametric curve. {EXPRESSION_GRAMMAR_HINT}"
    )
    expression_y: str = Field(
        min_length=1, description="y(t) of the parametric curve, same grammar as expression_x."
    )
    t_min: float = Field(description="Start of the parameter interval (radians for trig curves).")
    t_max: float = Field(description="End of the parameter interval.")
    x_min: float = Field(default=-5.0, description="Left edge of the visible x range.")
    x_max: float = Field(default=5.0, description="Right edge of the visible x range.")
    y_min: float = Field(default=-5.0, description="Bottom edge of the visible y range.")
    y_max: float = Field(default=5.0, description="Top edge of the visible y range.")
    formula_latex: str | None = Field(default=None, description=_LATEX_DOC)
    caption: str | None = Field(default=None, description=_CAPTION_DOC)


class MathShowRegionBoundaryArgs(BaseModel):
    vertices: list[tuple[float, float]] = Field(
        min_length=3,
        description=(
            "Polygon vertices as [x, y] pairs in scene coordinates, "
            "in drawing order (auto-closed)."
        ),
    )
    label: str | None = Field(
        default=None, description="Optional label for the region and its boundary."
    )
    x_min: float = Field(default=-5.0, description="Left edge of the visible x range.")
    x_max: float = Field(default=5.0, description="Right edge of the visible x range.")
    y_min: float = Field(default=-5.0, description="Bottom edge of the visible y range.")
    y_max: float = Field(default=5.0, description="Top edge of the visible y range.")
    formula_latex: str | None = Field(default=None, description=_LATEX_DOC)
    caption: str | None = Field(default=None, description=_CAPTION_DOC)


def _plot_symbol(parsed_variables: list[str]):
    import sympy as sp

    # Plot curves are functions of x; fall back to the single parsed variable
    # so e.g. "t^2" still differentiates, but always emit in terms of x.
    name = "x" if "x" in parsed_variables or not parsed_variables else parsed_variables[0]
    return sp.Symbol(name)


def _derived_tangent_expression(expression: str, x0: float) -> str:
    """Compute the tangent line of ``expression`` at ``x0`` in renderer grammar."""
    import sympy as sp

    expr, parsed = parse_expression(expression)
    symbol = _plot_symbol(parsed.variables)
    slope = sp.diff(expr, symbol).subs(symbol, x0)
    value = expr.subs(symbol, x0)
    if not (slope.is_number and value.is_number):
        raise ValueError(
            f"cannot derive a tangent for {expression!r} at x0={x0}: "
            "the expression must evaluate to a number there"
        )
    tangent = sp.nsimplify(value) + sp.nsimplify(slope) * (sp.Symbol("x") - sp.nsimplify(x0))
    return expression_to_source(sp.expand(tangent))


def _derived_derivative_expression(expression: str) -> str:
    """Differentiate ``expression`` symbolically, returned in renderer grammar."""
    import sympy as sp

    expr, parsed = parse_expression(expression)
    return expression_to_source(sp.diff(expr, _plot_symbol(parsed.variables)))


@register("math.show_tangent", MathShowTangentArgs)
def show_tangent(args: dict) -> list[LayerSpec]:
    parsed = MathShowTangentArgs.model_validate(args)
    tangent_expression = parsed.tangent_expression or _derived_tangent_expression(
        parsed.expression, parsed.x0
    )
    layers = _plot_layers(
        PlotSpec(
            curves=[
                PlotCurveSpec(
                    expression=parsed.expression,
                    label="f(x)",
                    emphasis="primary",
                ),
                PlotCurveSpec(
                    expression=tangent_expression,
                    label=f"切线 (x={parsed.x0})",
                    emphasis="secondary",
                ),
            ],
            x_min=parsed.x_min,
            x_max=parsed.x_max,
            y_min=parsed.y_min,
            y_max=parsed.y_max,
            marker_x=parsed.x0,
            formula_latex=parsed.formula_latex,
        ),
        formula_latex=parsed.formula_latex,
        caption=parsed.caption,
    )
    return layers


@register("math.show_function", MathShowFunctionArgs)
def show_function(args: dict) -> list[LayerSpec]:
    parsed = MathShowFunctionArgs.model_validate(args)
    curves = [PlotCurveSpec(expression=parsed.expression, label="f(x)", emphasis="primary")]
    if parsed.expression_2:
        curves.append(
            PlotCurveSpec(
                expression=parsed.expression_2,
                label="g(x)",
                emphasis="secondary",
            )
        )
    return _plot_layers(
        PlotSpec(
            curves=curves,
            x_min=parsed.x_min,
            x_max=parsed.x_max,
            y_min=parsed.y_min,
            y_max=parsed.y_max,
            marker_x=parsed.marker_x,
            shade_from=parsed.shade_from,
            shade_to=parsed.shade_to,
            formula_latex=parsed.formula_latex,
        ),
        formula_latex=parsed.formula_latex,
    )


@register("math.show_integral_area", MathShowIntegralAreaArgs)
def show_integral_area(args: dict) -> list[LayerSpec]:
    parsed = MathShowIntegralAreaArgs.model_validate(args)
    return _plot_layers(
        PlotSpec(
            curves=[
                PlotCurveSpec(
                    expression=parsed.expression,
                    label="f(x)",
                    emphasis="primary",
                )
            ],
            x_min=parsed.x_min,
            x_max=parsed.x_max,
            y_min=parsed.y_min,
            y_max=parsed.y_max,
            shade_from=min(parsed.from_, parsed.to),
            shade_to=max(parsed.from_, parsed.to),
            formula_latex=parsed.formula_latex,
        ),
        formula_latex=parsed.formula_latex,
    )


@register("math.show_derivative_compare", MathShowDerivativeCompareArgs)
def show_derivative_compare(args: dict) -> list[LayerSpec]:
    parsed = MathShowDerivativeCompareArgs.model_validate(args)
    derivative_expression = parsed.derivative_expression or _derived_derivative_expression(
        parsed.expression
    )
    return _plot_layers(
        PlotSpec(
            curves=[
                PlotCurveSpec(
                    expression=parsed.expression,
                    label="f(x)",
                    emphasis="primary",
                ),
                PlotCurveSpec(
                    expression=derivative_expression,
                    label="f'(x)",
                    emphasis="accent",
                ),
            ],
            x_min=parsed.x_min,
            x_max=parsed.x_max,
            y_min=parsed.y_min,
            y_max=parsed.y_max,
            formula_latex=parsed.formula_latex,
        ),
        formula_latex=parsed.formula_latex,
        caption=parsed.caption,
    )


@register("math.show_function_transform", MathShowFunctionTransformArgs)
def show_function_transform(args: dict) -> list[LayerSpec]:
    parsed = MathShowFunctionTransformArgs.model_validate(args)
    return _plot_layers(
        PlotSpec(
            curves=[
                PlotCurveSpec(
                    expression=parsed.base_expression,
                    label=parsed.base_label,
                    emphasis="secondary",
                ),
                PlotCurveSpec(
                    expression=parsed.transformed_expression,
                    label=parsed.transformed_label,
                    emphasis="primary",
                ),
            ],
            x_min=parsed.x_min,
            x_max=parsed.x_max,
            y_min=parsed.y_min,
            y_max=parsed.y_max,
            formula_latex=parsed.formula_latex,
        ),
        formula_latex=parsed.formula_latex,
        caption=parsed.caption,
    )


@register("math.show_parametric_curve", MathShowParametricCurveArgs)
def show_parametric_curve(args: dict) -> list[LayerSpec]:
    parsed = MathShowParametricCurveArgs.model_validate(args)
    scene = SceneSpec(
        x_min=parsed.x_min,
        x_max=parsed.x_max,
        y_min=parsed.y_min,
        y_max=parsed.y_max,
        curves=[
            SceneCurve(
                expression_x=parsed.expression_x,
                expression_y=parsed.expression_y,
                t_min=parsed.t_min,
                t_max=parsed.t_max,
                label="parametric",
                emphasis="primary",
                arrows=True,
            )
        ],
        formula_latex=parsed.formula_latex,
        caption=parsed.caption,
    )
    return _scene_layers(scene, parsed.formula_latex, parsed.caption)


@register("math.show_region_boundary", MathShowRegionBoundaryArgs)
def show_region_boundary(args: dict) -> list[LayerSpec]:
    parsed = MathShowRegionBoundaryArgs.model_validate(args)
    closed = [*parsed.vertices, parsed.vertices[0]]
    scene = SceneSpec(
        x_min=parsed.x_min,
        x_max=parsed.x_max,
        y_min=parsed.y_min,
        y_max=parsed.y_max,
        regions=[SceneRegion(vertices=parsed.vertices, label=parsed.label)],
        segments=[
            SceneSegment(
                points=closed,
                arrow=True,
                label=parsed.label,
                emphasis="accent",
            )
        ],
        formula_latex=parsed.formula_latex,
        caption=parsed.caption,
    )
    return _scene_layers(scene, parsed.formula_latex, parsed.caption)


def _plot_layers(
    plot: PlotSpec,
    *,
    formula_latex: str | None,
    caption: str | None = None,
) -> list[LayerSpec]:
    layers = [
        LayerSpec(
            kind=LayerKind.MATH_PLOT,
            timing=LayerTimingSpec(enter_at=0.0, exit_at=1.0, z_order=0),
            plot=plot,
        )
    ]
    layers.extend(_overlay_layers(formula_latex, caption, x=plot.x_max, y=0.8 * plot.x_max))
    return layers


def _scene_layers(
    scene: SceneSpec,
    formula_latex: str | None,
    caption: str | None,
) -> list[LayerSpec]:
    layers = [
        LayerSpec(
            kind=LayerKind.MATH_SCENE,
            timing=LayerTimingSpec(enter_at=0.0, exit_at=1.0, z_order=0),
            scene=scene,
        )
    ]
    layers.extend(_overlay_layers(formula_latex, caption, x=scene.x_max, y=scene.y_max))
    return layers


def _overlay_layers(
    formula_latex: str | None,
    caption: str | None,
    *,
    x: float,
    y: float,
) -> list[LayerSpec]:
    layers: list[LayerSpec] = []
    if caption:
        layers.append(
            LayerSpec(
                kind=LayerKind.NARRATION_CARD,
                timing=LayerTimingSpec(
                    enter_at=0.2,
                    exit_at=1.0,
                    z_order=1,
                    appear_anim="fade",
                ),
                narration_card=NarrationCardSpec(text=caption, position="bottom"),
            )
        )
    if formula_latex:
        layers.append(
            LayerSpec(
                kind=LayerKind.KATEX_OVERLAY,
                timing=LayerTimingSpec(enter_at=0.3, exit_at=1.0, z_order=2),
                katex_overlay=KaTeXOverlaySpec(
                    x=x,
                    y=y,
                    latex=formula_latex,
                    align="ne",
                ),
            )
        )
    return layers
