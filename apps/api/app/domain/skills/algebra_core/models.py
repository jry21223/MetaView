from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ParsedExpression(BaseModel):
    original: str
    normalized: str
    source: str
    variables: list[str] = Field(default_factory=list)
    latex: str


class AlgebraEquation(BaseModel):
    original: str
    normalized: str
    lhs_source: str
    rhs_source: str
    relation: Literal["=", "<", ">", "<=", ">="]
    variables: list[str] = Field(default_factory=list)
    latex: str


class AlgebraSystem(BaseModel):
    original: str
    equations: list[AlgebraEquation] = Field(default_factory=list)
    variables: list[str] = Field(default_factory=list)


class AlgebraStep(BaseModel):
    title: str
    formula_latex: str
    caption: str | None = None
