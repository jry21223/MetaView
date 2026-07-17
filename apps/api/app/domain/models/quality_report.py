from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.models.coverage import CoverageMode
from app.domain.models.review import (
    PlaybookIssueSeverity,
    PlaybookReviewIssue,
    PlaybookReviewStatus,
    PlaybookReviewVerdict,
)

QualityReportStatus = Literal["clean", "warnings", "repairable", "blocked"]


class QualityScoreDimension(str, Enum):
    SCHEMA = "schema"
    KNOWLEDGE_CORRECTNESS = "knowledge_correctness"
    PROMPT_COVERAGE = "prompt_coverage"
    PEDAGOGY = "pedagogy"
    SCENE_CONTRACT = "scene_contract"
    VISUAL_STRUCTURE = "visual_structure"
    CODE_SYNC = "code_sync"
    NARRATION_VISUAL_CONSISTENCY = "narration_visual_consistency"
    TIMELINE = "timeline"
    ASSET_LICENSE = "asset_license"
    EXPORT_READINESS = "export_readiness"


QUALITY_SCORE_DIMENSIONS: tuple[str, ...] = tuple(
    dimension.value for dimension in QualityScoreDimension
)


class QualityReport(BaseModel):
    """Canonical backend quality gate result for a candidate PlaybookScript."""

    model_config = ConfigDict(extra="forbid")

    status: QualityReportStatus
    generator_path: str = Field(min_length=1)
    coverage_mode: CoverageMode | Literal["unknown"] = "unknown"
    issues: list[PlaybookReviewIssue] = Field(default_factory=list)
    scores: dict[str, float] = Field(default_factory=dict)
    repair_targets: list[str] = Field(default_factory=list)
    summary: str = ""
    actions: list[str] = Field(default_factory=list)
    attempts: int = Field(default=0, ge=0)

    @classmethod
    def from_review_verdict(
        cls,
        verdict: PlaybookReviewVerdict,
        *,
        generator_path: str,
        coverage_mode: CoverageMode | Literal["unknown"] = "unknown",
        attempts: int = 0,
    ) -> "QualityReport":
        repair_targets = [issue.path for issue in verdict.issues if issue.requires_repair]
        errors = [
            issue for issue in verdict.issues if issue.severity == PlaybookIssueSeverity.ERROR
        ]
        if any(not issue.requires_repair for issue in errors):
            status: QualityReportStatus = "blocked"
        elif errors:
            status = "repairable"
        elif verdict.issues:
            status = "warnings"
        else:
            status = "clean"
        return cls(
            status=status,
            generator_path=generator_path,
            coverage_mode=coverage_mode,
            issues=verdict.issues,
            scores=_scores_from_verdict(verdict),
            repair_targets=repair_targets,
            summary=verdict.summary,
            actions=verdict.actions,
            attempts=attempts,
        )

    @model_validator(mode="after")
    def validate_status_matches_issues(self) -> "QualityReport":
        errors = [
            issue for issue in self.issues if issue.severity == PlaybookIssueSeverity.ERROR
        ]
        if self.status == "clean" and self.issues:
            raise ValueError("clean quality report must not contain issues")
        if self.status == "warnings" and errors:
            raise ValueError("warnings quality report must not contain error issues")
        if self.status == "repairable" and (
            not errors or any(not issue.requires_repair for issue in errors)
        ):
            raise ValueError("repairable quality report requires only repairable error issues")
        if self.status == "blocked" and not any(
            not issue.requires_repair for issue in errors
        ):
            raise ValueError("blocked quality report requires a non-repairable error issue")
        expected_targets = [issue.path for issue in self.issues if issue.requires_repair]
        if self.repair_targets != expected_targets:
            raise ValueError("repair_targets must match issues marked requires_repair")
        return self

    def with_issue(
        self,
        issue: PlaybookReviewIssue,
        *,
        action: str | None = None,
    ) -> "QualityReport":
        """Return a recalculated report with one additional canonical issue."""
        issues = [*self.issues, issue]
        actions = [*self.actions, *([action] if action else [])]
        verdict = PlaybookReviewVerdict(
            status=(
                PlaybookReviewStatus.BLOCKED
                if any(item.severity == PlaybookIssueSeverity.ERROR for item in issues)
                else PlaybookReviewStatus.WARNINGS
            ),
            summary=issue.message,
            issues=issues,
            actions=actions,
        )
        report = self.from_review_verdict(
            verdict,
            generator_path=self.generator_path,
            coverage_mode=self.coverage_mode,
            attempts=self.attempts,
        )
        return report


def _scores_from_verdict(verdict: PlaybookReviewVerdict) -> dict[str, float]:
    dimensions = dict.fromkeys(QUALITY_SCORE_DIMENSIONS, 1.0)
    for issue in verdict.issues:
        penalty = 0.35 if issue.severity == "error" else 0.15
        if issue.code.startswith("capability."):
            keys = ["knowledge_correctness", "prompt_coverage", "export_readiness"]
        elif issue.code.startswith("schema."):
            keys = ["schema", "export_readiness"]
        elif issue.code.startswith("asset."):
            keys = ["asset_license", "export_readiness"]
        elif issue.code.startswith(("scene.", "renderer.", "snapshot.")):
            keys = ["scene_contract", "visual_structure", "export_readiness"]
        elif issue.code.startswith(("math.", "algorithm.")):
            keys = ["knowledge_correctness", "visual_structure"]
        elif issue.code.startswith("lesson_plan.visual_role"):
            keys = ["prompt_coverage", "scene_contract", "visual_structure"]
        elif issue.code.startswith("lesson_plan.scene_type"):
            keys = ["scene_contract", "visual_structure", "export_readiness"]
        elif issue.code.startswith("lesson_plan."):
            keys = ["knowledge_correctness", "prompt_coverage", "pedagogy"]
        elif issue.code.startswith("code."):
            keys = ["knowledge_correctness", "visual_structure", "code_sync"]
        elif issue.code.startswith(("narration.", "step.")):
            keys = ["pedagogy", "prompt_coverage", "narration_visual_consistency"]
        elif issue.code.startswith(("director.", "export.")):
            keys = ["export_readiness"]
        elif issue.code.startswith("timeline."):
            keys = ["timeline", "export_readiness"]
        else:
            keys = ["knowledge_correctness"]
        for key in keys:
            dimensions[key] = max(0.0, dimensions[key] - penalty)
    return dimensions
