"""Statistics animation tools."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.domain.animation_tools.registry import register
from app.domain.models.cir import LayerKind, LayerSpec, LayerTimingSpec
from app.domain.models.playbook import ChartPoint, ChartSeries, StatsChartSceneSnapshot


class StatsChartSeriesArgs(BaseModel):
    label: str = Field(min_length=1)
    values: list[float] = Field(default_factory=list)
    points: list[ChartPoint] = Field(default_factory=list)
    emphasis: str = "primary"


class StatsDistributionChartArgs(BaseModel):
    chart_type: Literal["line", "bar", "histogram", "distribution", "box"]
    series: list[StatsChartSeriesArgs] = Field(min_length=1)
    x_label: str = "x"
    y_label: str = "y"
    formula_latex: str | None = None
    caption: str | None = None


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
