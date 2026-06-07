from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from app.domain.models.review import (
    PlaybookReviewIssue,
    PlaybookReviewStatus,
    PlaybookReviewVerdict,
)
from app.domain.services.reviewer_prompt import parse_playbook_reviewer_output


def test_playbook_review_accepts_clean_warnings_and_blocked_verdicts() -> None:
    clean = PlaybookReviewVerdict(status=PlaybookReviewStatus.CLEAN, summary="No issues.")
    warning = PlaybookReviewVerdict(
        status=PlaybookReviewStatus.WARNINGS,
        summary="Mostly usable.",
        issues=[
            PlaybookReviewIssue(
                code="step.too_shallow",
                severity="warning",
                path="steps[0]",
                message="The step is thin.",
                suggestion="Add a concrete visual transition.",
            )
        ],
    )
    blocked = PlaybookReviewVerdict(
        status=PlaybookReviewStatus.BLOCKED,
        summary="Repair required.",
        issues=[
            PlaybookReviewIssue(
                code="snapshot.empty_payload",
                severity="error",
                path="steps[2].snapshot.curves",
                message="math_plot snapshot has no curves.",
                suggestion="Add at least one curve or use math_formula.",
                requires_repair=True,
            )
        ],
    )

    assert clean.status == PlaybookReviewStatus.CLEAN
    assert warning.status == PlaybookReviewStatus.WARNINGS
    assert blocked.status == PlaybookReviewStatus.BLOCKED


@pytest.mark.parametrize("status", ["ok", "failed", "repaired", ""])
def test_playbook_review_rejects_invalid_status(status: str) -> None:
    with pytest.raises(ValidationError):
        PlaybookReviewVerdict.model_validate({"status": status, "summary": "bad"})


def test_playbook_review_rejects_blocked_without_error_issue() -> None:
    with pytest.raises(ValidationError):
        PlaybookReviewVerdict(
            status=PlaybookReviewStatus.BLOCKED,
            summary="Blocked but only warning.",
            issues=[
                PlaybookReviewIssue(
                    code="renderer.contract_risk",
                    severity="warning",
                    path="steps[0].layers",
                    message="Layer mismatch may render poorly.",
                )
            ],
        )


def test_playbook_review_rejects_clean_with_error_issue() -> None:
    with pytest.raises(ValidationError):
        PlaybookReviewVerdict(
            status=PlaybookReviewStatus.CLEAN,
            summary="Clean but has an error.",
            issues=[
                PlaybookReviewIssue(
                    code="schema.invalid",
                    severity="error",
                    path="steps[0].snapshot",
                    message="Invalid snapshot.",
                    requires_repair=True,
                )
            ],
        )


def test_playbook_review_rejects_requires_repair_on_warning() -> None:
    with pytest.raises(ValidationError):
        PlaybookReviewIssue(
            code="step.too_shallow",
            severity="warning",
            path="steps[1]",
            message="Needs more detail.",
            requires_repair=True,
        )


@pytest.mark.parametrize("code", ["Snapshot empty payload", "snapshot empty", "snapshot..empty"])
def test_playbook_review_rejects_non_machine_readable_codes(code: str) -> None:
    with pytest.raises(ValidationError):
        PlaybookReviewIssue(
            code=code,
            severity="error",
            path="steps[0].snapshot",
            message="Bad code.",
            requires_repair=True,
        )


def test_playbook_review_rejects_empty_issue_path() -> None:
    with pytest.raises(ValidationError):
        PlaybookReviewIssue(
            code="snapshot.empty_payload",
            severity="error",
            path="",
            message="No path.",
            requires_repair=True,
        )


def test_invalid_playbook_reviewer_json_becomes_reviewer_invalid_output() -> None:
    verdict = parse_playbook_reviewer_output("The playbook is fine.")

    assert verdict.status == PlaybookReviewStatus.BLOCKED
    assert verdict.issues[0].code == "reviewer.invalid_output"
    assert verdict.issues[0].severity == "error"
    assert verdict.issues[0].path == "reviewer"
    assert verdict.issues[0].requires_repair is True


def test_invalid_playbook_reviewer_schema_becomes_reviewer_invalid_output() -> None:
    verdict = parse_playbook_reviewer_output(
        json.dumps({"status": "clean", "summary": "Looks clean.", "issues": [
            {
                "code": "schema.invalid",
                "severity": "error",
                "path": "steps[0].snapshot",
                "message": "Contradicts clean status.",
                "requires_repair": True,
            }
        ]})
    )

    assert verdict.status == PlaybookReviewStatus.BLOCKED
    assert verdict.issues[0].code == "reviewer.invalid_output"
