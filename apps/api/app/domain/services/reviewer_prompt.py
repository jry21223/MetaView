from __future__ import annotations

import json
from json import JSONDecodeError
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from app.domain.models.playbook import PlaybookScript
from app.domain.models.review import (
    SUPPORTED_PLAYBOOK_REVIEW_CODES,
    CirReviewIssue,
    CirReviewReport,
    PlaybookIssueSeverity,
    PlaybookReviewIssue,
    PlaybookReviewStatus,
    PlaybookReviewVerdict,
)


class ReviewResult(BaseModel):
    action: Literal["accept", "correct", "regenerate"]
    issues: list[CirReviewIssue] = Field(default_factory=list)
    corrected: dict[str, Any] | None = None
    fix_instructions: str | None = None


class PipelineValidationError(Exception):
    def __init__(self, report: CirReviewReport | PlaybookReviewVerdict) -> None:
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


_PLAYBOOK_REVIEWER_SYSTEM = f"""You are the PlaybookScript reviewer for MetaView.
Return ONLY strict JSON matching this shape:
{{
  "status": "clean" | "warnings" | "blocked",
  "summary": "short reviewer summary",
  "issues": [
    {{
      "code": "machine.readable_code",
      "severity": "warning" | "error",
      "path": "steps[0].snapshot",
      "message": "specific issue",
      "suggestion": "specific repair guidance or null",
      "requires_repair": false
    }}
  ]
}}

Use "blocked" for any error-level issue. Use "clean" only when there are no
errors. Never return markdown fences, prose, or corrected PlaybookScript JSON.
For math lessons, compare the original prompt, derivation, parameter_controls,
and renderer-visible curve expressions. If the prompt asks for a moving or
varying family, every parameter that remains free after all stated conditions
must stay symbolic in the curve expression and have one effective control.
Report math.parameter_hardcoded when such a parameter was replaced by a numeric
example. Report missing, unused, or invalid controls with the matching
math.parameter_control_* code. Do not require sliders for coordinate variables,
intrinsic parametric variables, or quantities fixed by the derivation.
Supported issue codes include:
{", ".join(SUPPORTED_PLAYBOOK_REVIEW_CODES)}"""

_BLOCKING_MATH_PARAMETER_CODES = {
    "math.parameter_hardcoded",
    "math.parameter_control_missing",
    "math.parameter_control_unused",
    "math.parameter_control_invalid",
}


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


def build_playbook_reviewer_prompt(
    original_prompt: str,
    playbook: PlaybookScript,
    self_check: PlaybookReviewVerdict,
) -> tuple[str, str]:
    user_payload = {
        "original_prompt": original_prompt,
        "playbook": playbook.model_dump(mode="json"),
        "api_self_check": self_check.model_dump(mode="json"),
    }
    return _PLAYBOOK_REVIEWER_SYSTEM, json.dumps(user_payload, ensure_ascii=False)


def parse_playbook_reviewer_output(raw: str) -> PlaybookReviewVerdict:
    try:
        data = json.loads(raw.strip())
    except JSONDecodeError as exc:
        return _invalid_playbook_reviewer_verdict(f"Reviewer output is not JSON: {exc.msg}")
    try:
        verdict = PlaybookReviewVerdict.model_validate(data)
    except ValidationError as exc:
        return _invalid_playbook_reviewer_verdict(f"Reviewer output failed schema: {exc}")
    normalized_issues = [
        issue.model_copy(
            update={
                "severity": PlaybookIssueSeverity.ERROR,
                "requires_repair": True,
            }
        )
        if issue.code in _BLOCKING_MATH_PARAMETER_CODES
        else issue
        for issue in verdict.issues
    ]
    if normalized_issues == verdict.issues:
        return verdict
    return verdict.model_copy(
        update={
            "status": PlaybookReviewStatus.BLOCKED,
            "issues": normalized_issues,
        }
    )


def _invalid_playbook_reviewer_verdict(message: str) -> PlaybookReviewVerdict:
    return PlaybookReviewVerdict(
        status=PlaybookReviewStatus.BLOCKED,
        summary="Third-party reviewer returned invalid structured JSON.",
        issues=[
            PlaybookReviewIssue(
                code="reviewer.invalid_output",
                severity=PlaybookIssueSeverity.ERROR,
                path="reviewer",
                message=message,
                suggestion="Return one JSON object matching PlaybookReviewVerdict.",
                requires_repair=True,
            )
        ],
        actions=["reviewer:invalid_output"],
    )
