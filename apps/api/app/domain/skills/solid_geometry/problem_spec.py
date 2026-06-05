from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SolidGeometryBody = Literal[
    "cube",
    "cuboid",
    "regular_quad_pyramid",
]
SolidGeometryQueryKind = Literal[
    "line_plane_angle",
    "dihedral_angle",
    "skew_line_angle",
    "point_plane_distance",
    "volume",
]


class PointRef(BaseModel):
    label: str = Field(min_length=1)


class LineRef(BaseModel):
    through: tuple[str, str]


class PlaneRef(BaseModel):
    through: tuple[str, str, str]


class SolidGeometryQuery(BaseModel):
    kind: SolidGeometryQueryKind
    line: LineRef | None = None
    plane: PlaneRef | None = None
    line_a: LineRef | None = None
    line_b: LineRef | None = None
    point: PointRef | None = None


class SolidGeometryProblemSpec(BaseModel):
    language: str = "zh-CN"
    body: SolidGeometryBody
    dimensions: dict[str, str | int | float]
    givens: list[str] = []
    query: SolidGeometryQuery
