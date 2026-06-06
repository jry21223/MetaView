from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class CalculusCoreProblemSpec(BaseModel):
    language: str = "zh-CN"
    original_prompt: str
    task: Literal["derivative", "integral_area", "limit_1var", "series_basic"]
    expression: str
    variable: str = "x"
    lower: float | int | str | None = None
    upper: float | int | str | None = None
    point: float | int | str | None = None
    order: int = 5
