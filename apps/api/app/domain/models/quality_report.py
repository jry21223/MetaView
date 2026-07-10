from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.models.review import PlaybookReviewIssue, PlaybookReviewStatus, PlaybookReviewVerdict

QualityReportStatus = Literal["clean", "warnings", "repairable", "blocked"]


class QualityReport(BaseModel):
    """Canonical backend quality gate result for a candidate PlaybookScript."""

    model_config = ConfigDict(extra="forbid")

    status: QualityReportStatus
    generator_path: str = Field(min_length=1)
    coverage_mode: str = Field(default="unknown", min_length=1)
    issues: list[PlaybookReviewIssue] = Field(default_factory=list)
    scores: dict[str, float] = Field(default_factory=dict)
    repair_targets: list[str] = Field(default_factory=list)

    @classmethod
    def from_review_verdict(
        cls,
        verdict: PlaybookReviewVerdict,
        *,
        generator_path: str,
        coverage_mode: str = "unknown",
    ) -> "QualityReport":
        repair_targets = [issue.path for issue in verdict.issues if issue.requires_repair]
        if verdict.status == PlaybookReviewStatus.CLEAN:
            status: QualityReportStatus = "clean"
        elif verdict.status == PlaybookReviewStatus.WARNINGS:
            status = "warnings"
        elif repair_targets:
            status = "repairable"
        else:
            status = "blocked"
        return cls(
            status=status,
            generator_path=generator_path,
            coverage_mode=coverage_mode,
            issues=verdict.issues,
            scores=_scores_from_verdict(verdict),
            repair_targets=repair_targets,
        )


def _scores_from_verdict(verdict: PlaybookReviewVerdict) -> dict[str, float]:
    dimensions = {
        "schema": 1.0,
        "knowledge_correctness": 1.0,
        "prompt_coverage": 1.0,
        "pedagogy": 1.0,
        "scene_contract": 1.0,
        "visual_structure": 1.0,
        "narration_visual_consistency": 1.0,
        "timeline": 1.0,
        "asset_license": 1.0,
        "export_readiness": 1.0,
    }
    for issue in verdict.issues:
        penalty = 0.35 if issue.severity == "error" else 0.15
        if issue.code.startswith("timeline."):
            keys = ["timeline", "export_readiness"]
        elif issue.code.startswith("snapshot."):
            keys = ["visual_structure", "scene_contract"]
        elif issue.code.startswith("renderer."):
            keys = ["scene_contract", "export_readiness"]
        elif issue.code.startswith("step."):
            keys = ["pedagogy", "prompt_coverage"]
        else:
            keys = ["knowledge_correctness"]
        for key in keys:
            dimensions[key] = max(0.0, dimensions[key] - penalty)
    return dimensions
