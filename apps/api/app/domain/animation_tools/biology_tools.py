"""Biology animation tools."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.domain.animation_tools.registry import register
from app.domain.models.cir import LayerKind, LayerSpec, LayerTimingSpec
from app.domain.models.playbook import ChartSeries, StatsChartSceneSnapshot, TableSceneSnapshot


class BiologyPunnettSquareArgs(BaseModel):
    parent_a: str = Field(
        min_length=1,
        description="Genotype of the first parent, e.g. 'Aa'; shown as the column-side parent.",
    )
    parent_b: str = Field(
        min_length=1,
        description="Genotype of the second parent, e.g. 'Aa'; shown as the row-side parent.",
    )
    alleles: list[str] = Field(
        min_length=1,
        description=(
            "Gamete labels, e.g. ['A', 'a']. They become the column headers "
            "and, in order, the row headers."
        ),
    )
    cells: list[list[str]] = Field(
        min_length=1,
        description=(
            "Offspring genotypes as a grid: cells[i][j] is row-gamete i crossed "
            "with column-gamete j, so the grid is len(alleles) x len(alleles)."
        ),
    )
    phenotype_counts: dict[str, float] = Field(
        default_factory=dict,
        description=(
            "Optional phenotype -> count (or probability) mapping charted "
            "next to the square."
        ),
    )


@register("biology.punnett_square", BiologyPunnettSquareArgs)
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
        categories=list(parsed.phenotype_counts.keys()),
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
