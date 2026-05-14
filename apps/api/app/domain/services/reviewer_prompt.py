from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.domain.models.review import CirReviewIssue, CirReviewReport


class ReviewResult(BaseModel):
    action: Literal["accept", "correct", "regenerate"]
    issues: list[CirReviewIssue] = Field(default_factory=list)
    corrected: dict[str, Any] | None = None
    fix_instructions: str | None = None


class PipelineValidationError(Exception):
    def __init__(self, report: CirReviewReport) -> None:
        super().__init__("Pipeline output failed review")
        self.report = report


_REVIEWER_SYSTEM = """You are the CIR reviewer for an educational animation pipeline.
Validate the primary LLM output against the schema, renderability rules, and
pedagogy rules. Return ONLY valid JSON with this shape:
{
  "action": "accept" | "correct" | "regenerate",
  "issues": [
    {
      "code": "string",
      "severity": "info" | "warning" | "error",
      "path": "string",
      "message": "string",
      "suggestion": "string | null"
    }
  ],
  "corrected": { "cir": {...}, "execution_map": {...} } | null,
  "fix_instructions": "string | null"
}

Use "correct" when you can emit the full corrected combined JSON.
Use "regenerate" when the generator should rewrite using concrete instructions.
Use "accept" only if the listed issues are false positives.
Never return markdown fences or explanatory prose."""


def build_reviewer_prompt(
    original_user: str,
    previous_output: str,
    issues: list[CirReviewIssue],
) -> tuple[str, str]:
    user_payload = {
        "original_prompt": original_user,
        "previous_output": previous_output,
        "blocking_issues": [issue.model_dump(mode="json") for issue in issues],
    }
    return _REVIEWER_SYSTEM, json.dumps(user_payload, ensure_ascii=False)
