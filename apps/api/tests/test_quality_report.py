from __future__ import annotations

from app.domain.models.quality_report import QualityReport
from app.domain.models.review import (
    PlaybookReviewIssue,
    PlaybookReviewStatus,
    PlaybookReviewVerdict,
)


def test_quality_report_maps_clean_review_to_clean_gate() -> None:
    report = QualityReport.from_review_verdict(
        PlaybookReviewVerdict(status=PlaybookReviewStatus.CLEAN, summary="ok"),
        generator_path="agent",
        coverage_mode="specialized",
    )
    assert report.status == "clean"
    assert report.generator_path == "agent"
    assert report.coverage_mode == "specialized"


def test_quality_report_marks_repairable_error_targets() -> None:
    verdict = PlaybookReviewVerdict(
        status=PlaybookReviewStatus.BLOCKED,
        summary="needs repair",
        issues=[
            PlaybookReviewIssue(
                code="snapshot.empty_payload",
                severity="error",
                path="steps[0].snapshot",
                message="empty",
                requires_repair=True,
            )
        ],
    )
    report = QualityReport.from_review_verdict(verdict, generator_path="single")
    assert report.status == "repairable"
    assert report.repair_targets == ["steps[0].snapshot"]
    assert report.scores["visual_structure"] < 1.0


def test_quality_report_non_repairable_error_takes_precedence() -> None:
    verdict = PlaybookReviewVerdict(
        status=PlaybookReviewStatus.BLOCKED,
        summary="blocked",
        issues=[
            PlaybookReviewIssue(
                code="asset.missing",
                severity="error",
                path="steps[0].snapshot.asset_id",
                message="missing",
                requires_repair=True,
            ),
            PlaybookReviewIssue(
                code="quality.repair_exhausted",
                severity="error",
                path="playbook",
                message="exhausted",
                requires_repair=False,
            ),
        ],
    )

    report = QualityReport.from_review_verdict(verdict, generator_path="agent")

    assert report.status == "blocked"
    assert report.scores["asset_license"] < 1.0
    assert report.scores["export_readiness"] < 1.0
