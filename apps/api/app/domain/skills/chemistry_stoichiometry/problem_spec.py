from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

ChemistryStoichiometryKind = Literal[
    "balance_equation",
    "molar_mass",
    "limiting_reagent",
    "solution_concentration",
]


class QuantityValue(BaseModel):
    value: Decimal
    unit: str


class ChemistryStoichiometryProblemSpec(BaseModel):
    language: str = "zh-CN"
    kind: ChemistryStoichiometryKind
    equation: str | None = None
    compounds: list[str] = Field(default_factory=list)
    givens: list[str] = Field(default_factory=list)
    quantities: dict[str, QuantityValue] = Field(default_factory=dict)
    query: dict[str, str] = Field(default_factory=dict)
    assumptions: list[str] = Field(default_factory=list)


def q(value: str | int | float | Decimal, unit: str) -> QuantityValue:
    return QuantityValue(value=Decimal(str(value)), unit=unit)

