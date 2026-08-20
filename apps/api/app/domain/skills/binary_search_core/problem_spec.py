from __future__ import annotations

import math

from pydantic import BaseModel, Field, StrictFloat, StrictInt, model_validator

Number = StrictInt | StrictFloat


class BinarySearchProblemSpec(BaseModel):
    values: list[Number] = Field(min_length=1, max_length=64)
    target: Number

    @model_validator(mode="after")
    def validate_search_input(self) -> "BinarySearchProblemSpec":
        if not all(
            not isinstance(value, float) or math.isfinite(value)
            for value in self.values
        ):
            raise ValueError("binary-search values must be finite")
        if isinstance(self.target, float) and not math.isfinite(self.target):
            raise ValueError("binary-search target must be finite")
        if any(
            left > right
            for left, right in zip(self.values, self.values[1:], strict=False)
        ):
            raise ValueError("binary-search values must be sorted in ascending order")
        if self.target not in self.values:
            raise ValueError("binary-search target must appear in the input values")
        return self
