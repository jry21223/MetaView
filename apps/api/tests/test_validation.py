from app.schemas import CirDocument, CirStep, TopicDomain, VisualKind
from app.services.validation import CirValidator


def test_validator_reports_invalid_document() -> None:
    validator = CirValidator()
    report = validator.validate(
        CirDocument(
            title="",
            domain=TopicDomain.ALGORITHM,
            summary="",
            steps=[
                CirStep(
                    id="step-1",
                    title="",
                    narration="",
                    visual_kind=VisualKind.ARRAY,
                    tokens=[],
                )
            ],
        )
    )

    assert report.status == "invalid"
    assert any(issue.code == "missing_title" for issue in report.issues)
    assert any(issue.code == "missing_narration" for issue in report.issues)

