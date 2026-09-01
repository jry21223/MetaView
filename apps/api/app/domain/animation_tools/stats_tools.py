"""Statistics animation tools."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.domain.animation_tools.registry import register
from app.domain.models.cir import LayerKind, LayerSpec, LayerTimingSpec
from app.domain.models.playbook import ChartPoint, ChartSeries, StatsChartSceneSnapshot


class StatsChartSeriesArgs(BaseModel):
    label: str = Field(min_length=1, description="Series name shown in the legend.")
    values: list[float] = Field(
        default_factory=list,
        description=(
            "y values plotted at indices 0..n-1; use `points` instead for "
            "explicit x positions."
        ),
    )
    points: list[ChartPoint] = Field(
        default_factory=list,
        description="Explicit {x, y} points; takes precedence over `values` when non-empty.",
    )
    emphasis: str = Field(
        default="primary", description="Series color role: primary, secondary, or accent."
    )


class StatsDistributionChartArgs(BaseModel):
    chart_type: Literal["line", "bar", "histogram", "distribution", "box"] = Field(
        description="Chart family; bar/histogram draw one bar per value, line connects the points."
    )
    series: list[StatsChartSeriesArgs] = Field(
        min_length=1, description="One or more data series drawn on shared axes."
    )
    x_label: str = Field(default="x", description="x-axis title.")
    y_label: str = Field(default="y", description="y-axis title.")
    categories: list[str] = Field(
        default_factory=list,
        description=(
            "Category names for bar/histogram charts, one per series value; "
            "when set the renderer labels each bar instead of a numeric axis."
        ),
    )
    formula_latex: str | None = Field(
        default=None, description="Optional KaTeX formula overlay (LaTeX allowed here only)."
    )
    caption: str | None = Field(
        default=None, description="Optional one-sentence caption rendered as a narration card."
    )


@register("stats.distribution_chart", StatsDistributionChartArgs)
def distribution_chart(args: dict) -> list[LayerSpec]:
    parsed = StatsDistributionChartArgs.model_validate(args)
    snapshot = StatsChartSceneSnapshot(
        chart_type=parsed.chart_type,
        series=[
            ChartSeries(
                label=series.label,
                values=series.values,
                points=series.points,
                emphasis=series.emphasis,
            )
            for series in parsed.series
        ],
        x_label=parsed.x_label,
        y_label=parsed.y_label,
        categories=parsed.categories,
        formula_latex=parsed.formula_latex,
        caption=parsed.caption,
    )
    return [
        LayerSpec(
            kind=LayerKind.STATS_CHART_SCENE,
            stats_chart_scene=snapshot,
            timing=LayerTimingSpec(z_order=0),
        )
    ]
