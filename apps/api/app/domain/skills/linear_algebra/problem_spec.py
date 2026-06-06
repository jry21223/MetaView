from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class LinearAlgebraProblemSpec(BaseModel):
    language: str = "zh-CN"
    original_prompt: str
    task: Literal["eigen_basic", "rref", "solve_system", "det_rank"]
    matrix: list[list[float | int | str]] = Field(default_factory=list)
    rhs: list[float | int | str] | None = None
    variable_names: list[str] = Field(default_factory=list)
