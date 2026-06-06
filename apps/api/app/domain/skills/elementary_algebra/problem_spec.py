from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class ElementaryAlgebraProblemSpec(BaseModel):
    language: str = "zh-CN"
    original_prompt: str
    task: Literal[
        "linear_equation",
        "quadratic_equation",
        "inequality",
        "factor_expression",
    ]
    equation: str | None = None
    expression: str | None = None
    variable: str = "x"
