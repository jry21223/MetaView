from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

PhysicsMechanicsKind = Literal[
    "uniform_acceleration_1d",
    "projectile_motion",
    "newton_second_law",
    "incline_force",
]


class QuantityValue(BaseModel):
    value: Decimal
    unit: str


class PhysicsMechanicsProblemSpec(BaseModel):
    language: str = "zh-CN"
    kind: PhysicsMechanicsKind
    givens: list[str] = Field(default_factory=list)
    query: dict[str, str] = Field(default_factory=dict)
    values: dict[str, QuantityValue] = Field(default_factory=dict)
    assumptions: list[str] = Field(default_factory=list)


def q(value: str | int | float | Decimal, unit: str) -> QuantityValue:
    return QuantityValue(value=Decimal(str(value)), unit=unit)

