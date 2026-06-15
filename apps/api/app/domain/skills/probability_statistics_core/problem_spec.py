from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

ProbabilityStatisticsKind = Literal[
    "descriptive_statistics",
    "probability_union",
    "conditional_probability",
    "contingency_table",
    "binomial_probability",
    "z_score_normal_cdf",
]

ScopeKind = Literal["population", "sample"]


class ProbabilityStatisticsProblemSpec(BaseModel):
    language: str = "zh-CN"
    kind: ProbabilityStatisticsKind
    data: list[Decimal] = Field(default_factory=list)
    parameters: dict[str, Decimal] = Field(default_factory=dict)
    table: list[list[Decimal]] = Field(default_factory=list)
    scope: ScopeKind | None = None
    query: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_statistics_spec(self) -> "ProbabilityStatisticsProblemSpec":
        if self.kind == "descriptive_statistics" and not self.data:
            raise ValueError("dataset is required")
        if self.kind == "probability_union":
            _require_parameters(self.parameters, {"P(A)", "P(B)", "P(A∩B)"})
        if self.kind == "conditional_probability":
            _require_parameters(self.parameters, {"P(A∩B)", "P(B)"})
        if self.kind == "contingency_table" and not self.table:
            raise ValueError("contingency table is required")
        if self.kind == "binomial_probability":
            _require_parameters(self.parameters, {"n", "p", "k"})
        if self.kind == "z_score_normal_cdf":
            _require_parameters(self.parameters, {"x", "mu", "sigma"})
            if self.parameters["sigma"] <= 0:
                raise ValueError("sigma must be positive")
        return self


def _require_parameters(parameters: dict[str, Decimal], keys: set[str]) -> None:
    missing = keys - set(parameters)
    if missing:
        raise ValueError(f"missing parameters: {', '.join(sorted(missing))}")
