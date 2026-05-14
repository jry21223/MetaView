from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class ReviewSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class CirReviewIssue(BaseModel):
    code: str
    severity: ReviewSeverity
    path: str
    message: str
    suggestion: str | None = None


class CirReviewReport(BaseModel):
    status: Literal["clean", "warnings", "repaired", "failed"] = "clean"
    attempts: int = 0
    issues: list[CirReviewIssue] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)
