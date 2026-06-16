"""Chemistry animation tools."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.domain.animation_tools.registry import register
from app.domain.models.cir import (
    KaTeXOverlaySpec,
    LayerKind,
    LayerSpec,
    LayerTimingSpec,
    NarrationCardSpec,
)
from app.domain.models.playbook import TableSceneSnapshot


class StoichiometryRowArgs(BaseModel):
    species: str = Field(min_length=1)
    coefficient: int = Field(ge=1)
    mol: float | None = Field(default=None, ge=0)
    mass: float | None = Field(default=None, ge=0)
    role: str = Field(min_length=1)


class ChemistryStoichiometryTableArgs(BaseModel):
    rows: list[StoichiometryRowArgs] = Field(min_length=1)
    equation_latex: str = Field(min_length=1)
    caption: str | None = None


@register("chemistry.stoichiometry_table")
def stoichiometry_table(args: dict) -> list[LayerSpec]:
    parsed = ChemistryStoichiometryTableArgs.model_validate(args)
    table = TableSceneSnapshot(
        columns=["species", "coefficient", "mol", "mass", "role"],
        rows=[
            [
                row.species,
                row.coefficient,
                "" if row.mol is None else row.mol,
                "" if row.mass is None else row.mass,
                row.role,
            ]
            for row in parsed.rows
        ],
        active_rows=list(range(len(parsed.rows))),
        caption=parsed.caption,
    )
    layers = [
        LayerSpec(
            kind=LayerKind.TABLE_SCENE,
            table_scene=table,
            timing=LayerTimingSpec(z_order=0),
        ),
        LayerSpec(
            kind=LayerKind.KATEX_OVERLAY,
            timing=LayerTimingSpec(enter_at=0.2, exit_at=1.0, z_order=1),
            katex_overlay=KaTeXOverlaySpec(x=0, y=0, latex=parsed.equation_latex),
        ),
    ]
    if parsed.caption:
        layers.append(
            LayerSpec(
                kind=LayerKind.NARRATION_CARD,
                timing=LayerTimingSpec(enter_at=0.3, exit_at=1.0, z_order=2),
                narration_card=NarrationCardSpec(text=parsed.caption, position="bottom"),
            )
        )
    return layers
