"""Biology animation tools."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.domain.animation_tools.registry import register
from app.domain.models.cir import LayerKind, LayerSpec, LayerTimingSpec
from app.domain.models.playbook import ChartSeries, StatsChartSceneSnapshot, TableSceneSnapshot


class BiologyPunnettSquareArgs(BaseModel):
    parent_a: str = Field(min_length=1)
    parent_b: str = Field(min_length=1)
    alleles: list[str] = Field(min_length=1)
    cells: list[list[str]] = Field(min_length=1)
    phenotype_counts: dict[str, float] = Field(default_factory=dict)


@register("biology.punnett_square")
def punnett_square(args: dict) -> list[LayerSpec]:
    parsed = BiologyPunnettSquareArgs.model_validate(args)
    table = TableSceneSnapshot(
        columns=[parsed.parent_a, *parsed.alleles],
        rows=[
            [parsed.alleles[index] if index < len(parsed.alleles) else "", *row]
            for index, row in enumerate(parsed.cells)
        ],
        active_rows=list(range(len(parsed.cells))),
        caption=f"{parsed.parent_a} x {parsed.parent_b}",
    )
    chart = StatsChartSceneSnapshot(
        chart_type="bar",
        series=[
            ChartSeries(
                label="phenotype counts",
                values=list(parsed.phenotype_counts.values()),
                emphasis="accent",
            )
        ],
        x_label="phenotype",
        y_label="count",
        caption="Phenotype count distribution",
    )
    return [
        LayerSpec(
            kind=LayerKind.TABLE_SCENE,
            table_scene=table,
            timing=LayerTimingSpec(z_order=0),
        ),
        LayerSpec(
            kind=LayerKind.STATS_CHART_SCENE,
            stats_chart_scene=chart,
            timing=LayerTimingSpec(enter_at=0.25, exit_at=1.0, z_order=1),
        ),
    ]
