from __future__ import annotations

import re
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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


class PlaybookReviewStatus(str, Enum):
    CLEAN = "clean"
    WARNINGS = "warnings"
    BLOCKED = "blocked"


class PlaybookIssueSeverity(str, Enum):
    WARNING = "warning"
    ERROR = "error"


SUPPORTED_PLAYBOOK_REVIEW_CODES: tuple[str, ...] = (
    "schema.invalid",
    "timeline.non_monotonic",
    "timeline.exceeds_total_frames",
    "timeline.voiceover_too_short",
    "step.empty_voiceover",
    "step.too_shallow",
    "step.does_not_answer_prompt",
    "snapshot.unsupported_kind",
    "snapshot.empty_payload",
    "snapshot.domain_fallback",
    "snapshot.narration_mismatch",
    "renderer.contract_risk",
    "scene.required_contract_missing",
    "asset.missing",
    "math.inconsistent_formula",
    "math.low_visual_richness",
    "algorithm.invalid_state_transition",
    "algorithm.state_missing",
    "code.line_out_of_range",
    "code.execution_state_missing",
    "physics.state_missing",
    "director.persistence_failed",
    "quality.repair_unavailable",
    "quality.repair_exhausted",
    "quality.generation_failed",
    "pipeline.timeout",
    "capability.limited_visual_unavailable",
    "capability.text_only_required",
    "capability.unsupported",
    "skill.consistency_failed",
    "skill.execution_unhandled",
    "export.not_ready",
    "reviewer.unconfigured",
    "reviewer.invalid_output",
)


_MACHINE_CODE_PATTERN = re.compile(r"^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$")


class PlaybookReviewIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    severity: PlaybookIssueSeverity
    path: str = Field(min_length=1)
    message: str = Field(min_length=1)
    suggestion: str | None = None
    requires_repair: bool = False

    @field_validator("code")
    @classmethod
    def validate_machine_code(cls, value: str) -> str:
        if not _MACHINE_CODE_PATTERN.fullmatch(value):
            raise ValueError("code must be machine-readable dotted lower_snake_case")
        return value

    @model_validator(mode="after")
    def validate_repair_severity(self) -> "PlaybookReviewIssue":
        if self.requires_repair and self.severity != PlaybookIssueSeverity.ERROR:
            raise ValueError("requires_repair=true is only valid on error issues")
        return self


class PlaybookReviewVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: PlaybookReviewStatus
    summary: str = Field(min_length=1)
    issues: list[PlaybookReviewIssue] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_status_matches_issues(self) -> "PlaybookReviewVerdict":
        has_error = any(issue.severity == PlaybookIssueSeverity.ERROR for issue in self.issues)
        if self.status == PlaybookReviewStatus.BLOCKED and not has_error:
            raise ValueError("blocked verdict requires at least one error issue")
        if self.status == PlaybookReviewStatus.CLEAN and has_error:
            raise ValueError("clean verdict must not contain error issues")
        if self.status == PlaybookReviewStatus.WARNINGS and has_error:
            raise ValueError("warnings verdict must not contain error issues")
        return self
