from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

GeographyClimateKind = Literal[
    "station_normals_summary",
    "annual_temperature_mean",
    "annual_precipitation_total",
    "warmest_coldest_month",
    "wettest_driest_month",
    "station_comparison",
    "anomaly_from_normal",
]

ClimateVariable = Literal["temperature_c", "precipitation_mm"]


class GeographyClimateProblemSpec(BaseModel):
    language: str = "zh-CN"
    kind: GeographyClimateKind
    station_ids: list[str] = Field(default_factory=list)
    month: int | None = None
    variable: ClimateVariable | None = None
    observed_value: Decimal | None = None
    query: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_climate_spec(self) -> "GeographyClimateProblemSpec":
        if not self.station_ids:
            raise ValueError("at least one station id is required")
        if self.kind == "station_comparison" and len(self.station_ids) != 2:
            raise ValueError("station comparison requires exactly two station ids")
        if self.kind == "anomaly_from_normal":
            if self.month is None or not 1 <= self.month <= 12:
                raise ValueError("anomaly requires month 1-12")
            if self.variable is None or self.observed_value is None:
                raise ValueError("anomaly requires variable and observed value")
        return self
