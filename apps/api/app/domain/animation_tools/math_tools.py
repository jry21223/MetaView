"""Math animation tools — function plots, tangents, integral areas, etc."""

from __future__ import annotations

from app.domain.animation_tools.registry import register
from app.domain.models.cir import (
    KaTeXOverlaySpec,
    LayerKind,
    LayerSpec,
    LayerTimingSpec,
    NarrationCardSpec,
    PlotCurveSpec,
    PlotSpec,
)


@register("math.show_tangent")
def show_tangent(args: dict) -> list[LayerSpec]:
    """Draw a function curve and a tangent line at ``x0``.

    Expected ``args`` keys:
        expression (str) — the function, e.g. ``"x^2"``
        x0 (float) — point at which to draw the tangent
        tangent_expression (str) — the linear tangent formula, e.g. ``"4*x - 4"``
        formula_latex (str, optional) — KaTeX label, e.g. ``"f'(2)=4"``
        caption (str, optional) — explanatory text for the narration card
        x_min (float, optional) — default -5.0
        x_max (float, optional) — default 5.0
    """
    expression = args.get("expression", "x^2")
    x0 = args.get("x0", 0.0)
    tangent_expr = args.get("tangent_expression", "0")
    formula_latex = args.get("formula_latex")
    caption = args.get("caption")
    x_min = args.get("x_min", -5.0)
    x_max = args.get("x_max", 5.0)

    layers: list[LayerSpec] = []

    # Layer 1: function plot with marker and optional formula label
    plot = PlotSpec(
        curves=[
            PlotCurveSpec(expression=expression, label="f(x)", emphasis="primary"),
            PlotCurveSpec(
                expression=tangent_expr,
                label=f"切线 (x={x0})",
                emphasis="secondary",
            ),
        ],
        x_min=x_min,
        x_max=x_max,
        marker_x=x0,
        formula_latex=formula_latex,
    )
    layers.append(
        LayerSpec(
            kind=LayerKind.MATH_PLOT,
            timing=LayerTimingSpec(enter_at=0.0, exit_at=1.0, z_order=0),
            plot=plot,
        )
    )

    # Layer 2: narration card (optional)
    if caption:
        layers.append(
            LayerSpec(
                kind=LayerKind.NARRATION_CARD,
                timing=LayerTimingSpec(
                    enter_at=0.2, exit_at=1.0, z_order=1, appear_anim="fade"
                ),
                narration_card=NarrationCardSpec(text=caption, position="bottom"),
            )
        )

    # Layer 3: floating formula overlay when formula_latex is set
    if formula_latex:
        layers.append(
            LayerSpec(
                kind=LayerKind.KATEX_OVERLAY,
                timing=LayerTimingSpec(enter_at=0.3, exit_at=1.0, z_order=2),
                katex_overlay=KaTeXOverlaySpec(
                    x=x_max,
                    y=(x_max - x_min) * 0.8,
                    latex=formula_latex,
                    align="ne",
                ),
            )
        )

    return layers


@register("math.show_function")
def show_function(args: dict) -> list[LayerSpec]:
    """Draw one or more function curves on a 2D plot.

    Expected ``args`` keys:
        expression (str) — primary curve, e.g. ``"x^2"``
        expression_2 (str, optional) — secondary curve
        x_min / x_max (float, optional)
        formula_latex (str, optional)
        marker_x (float, optional)
        shade_from / shade_to (float, optional)
    """
    expression = args.get("expression", "x")
    expression_2 = args.get("expression_2")
    formula_latex = args.get("formula_latex")
    marker_x = args.get("marker_x")
    shade_from = args.get("shade_from")
    shade_to = args.get("shade_to")
    x_min = args.get("x_min", -6.0)
    x_max = args.get("x_max", 6.0)

    curves = [PlotCurveSpec(expression=expression, label="f(x)", emphasis="primary")]
    if expression_2:
        curves.append(
            PlotCurveSpec(expression=expression_2, label="g(x)", emphasis="secondary")
        )

    layers: list[LayerSpec] = [
        LayerSpec(
            kind=LayerKind.MATH_PLOT,
            timing=LayerTimingSpec(enter_at=0.0, exit_at=1.0, z_order=0),
            plot=PlotSpec(
                curves=curves,
                x_min=x_min,
                x_max=x_max,
                marker_x=marker_x,
                shade_from=shade_from,
                shade_to=shade_to,
                formula_latex=formula_latex,
            ),
        )
    ]

    if formula_latex:
        layers.append(
            LayerSpec(
                kind=LayerKind.KATEX_OVERLAY,
                timing=LayerTimingSpec(enter_at=0.3, exit_at=1.0, z_order=1),
                katex_overlay=KaTeXOverlaySpec(
                    x=x_max,
                    y=(x_max - x_min) * 0.8,
                    latex=formula_latex,
                    align="ne",
                ),
            )
        )

    return layers


@register("math.show_integral_area")
def show_integral_area(args: dict) -> list[LayerSpec]:
    """Shade the area under a curve to illustrate definite integrals.

    Expected ``args`` keys:
        expression (str) — the function to integrate
        from_ / to (float) — integration bounds (note: ``from_`` because
            ``from`` is a Python keyword)
        x_min / x_max (float, optional)
        formula_latex (str, optional)
    """
    expression = args.get("expression", "x^2")
    from_ = args.get("from_", args.get("from", 0.0))
    to_ = args.get("to", 2.0)
    formula_latex = args.get("formula_latex")
    x_min = args.get("x_min", -1.0)
    x_max = args.get("x_max", 4.0)

    shade_from = min(from_, to_)
    shade_to = max(from_, to_)

    layers: list[LayerSpec] = [
        LayerSpec(
            kind=LayerKind.MATH_PLOT,
            timing=LayerTimingSpec(enter_at=0.0, exit_at=1.0, z_order=0),
            plot=PlotSpec(
                curves=[PlotCurveSpec(expression=expression, label="f(x)", emphasis="primary")],
                x_min=x_min,
                x_max=x_max,
                shade_from=shade_from,
                shade_to=shade_to,
                formula_latex=formula_latex,
            ),
        )
    ]

    if formula_latex:
        layers.append(
            LayerSpec(
                kind=LayerKind.KATEX_OVERLAY,
                timing=LayerTimingSpec(enter_at=0.3, exit_at=1.0, z_order=1),
                katex_overlay=KaTeXOverlaySpec(
                    x=x_max,
                    y=(x_max - x_min) * 0.8,
                    latex=formula_latex,
                    align="ne",
                ),
            )
        )

    return layers
