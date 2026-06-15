"""Math animation tools — function plots, tangents, integral areas, etc."""

from __future__ import annotations

from pydantic import AliasChoices, BaseModel, Field

from app.domain.animation_tools.registry import register
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


class _PlotBounds(BaseModel):
    x_min: float = -6.0
    x_max: float = 6.0
    y_min: float | None = None
    y_max: float | None = None


class MathShowTangentArgs(_PlotBounds):
    expression: str = Field(min_length=1)
    x0: float
    tangent_expression: str = Field(min_length=1)
    formula_latex: str | None = None
    caption: str | None = None


class MathShowFunctionArgs(_PlotBounds):
    expression: str = Field(min_length=1)
    expression_2: str | None = None
    formula_latex: str | None = None
    marker_x: float | None = None
    shade_from: float | None = None
    shade_to: float | None = None


class MathShowIntegralAreaArgs(_PlotBounds):
    expression: str = Field(min_length=1)
    from_: float = Field(validation_alias=AliasChoices("from_", "from"))
    to: float
    formula_latex: str | None = None


class MathShowDerivativeCompareArgs(_PlotBounds):
    expression: str = Field(min_length=1)
    derivative_expression: str = Field(min_length=1)
    formula_latex: str | None = None
    caption: str | None = None


class MathShowFunctionTransformArgs(_PlotBounds):
    base_expression: str = Field(min_length=1)
    transformed_expression: str = Field(min_length=1)
    base_label: str = "f(x)"
    transformed_label: str = "g(x)"
    formula_latex: str | None = None
    caption: str | None = None


class MathShowParametricCurveArgs(BaseModel):
    expression_x: str = Field(min_length=1)
    expression_y: str = Field(min_length=1)
    t_min: float
    t_max: float
    x_min: float = -5.0
    x_max: float = 5.0
    y_min: float = -5.0
    y_max: float = 5.0
    formula_latex: str | None = None
    caption: str | None = None


class MathShowRegionBoundaryArgs(BaseModel):
    vertices: list[tuple[float, float]] = Field(min_length=3)
    label: str | None = None
    x_min: float = -5.0
    x_max: float = 5.0
    y_min: float = -5.0
    y_max: float = 5.0
    formula_latex: str | None = None
    caption: str | None = None


@register("math.show_tangent")
def show_tangent(args: dict) -> list[LayerSpec]:
    parsed = MathShowTangentArgs.model_validate(args)
    layers = _plot_layers(
        PlotSpec(
            curves=[
                PlotCurveSpec(
                    expression=parsed.expression,
                    label="f(x)",
                    emphasis="primary",
                ),
                PlotCurveSpec(
                    expression=parsed.tangent_expression,
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


@register("math.show_function")
def show_function(args: dict) -> list[LayerSpec]:
    parsed = MathShowFunctionArgs.model_validate(args)
    curves = [
        PlotCurveSpec(expression=parsed.expression, label="f(x)", emphasis="primary")
    ]
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


@register("math.show_integral_area")
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


@register("math.show_derivative_compare")
def show_derivative_compare(args: dict) -> list[LayerSpec]:
    parsed = MathShowDerivativeCompareArgs.model_validate(args)
    return _plot_layers(
        PlotSpec(
            curves=[
                PlotCurveSpec(
                    expression=parsed.expression,
                    label="f(x)",
                    emphasis="primary",
                ),
                PlotCurveSpec(
                    expression=parsed.derivative_expression,
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


@register("math.show_function_transform")
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


@register("math.show_parametric_curve")
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


@register("math.show_region_boundary")
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
