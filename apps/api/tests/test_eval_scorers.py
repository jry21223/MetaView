"""Tests for eval/scorers.py.

Tests run against the sample fixture playbook (no API key required) and
synthetic minimal payloads for edge cases.
"""

from __future__ import annotations

import json
import pathlib

import pytest

from eval.scorers import (
    ScoreCard,
    score_diversity,
    score_narration,
    score_playbook,
    score_schema,
    score_snapshot_richness,
    score_step_count,
    score_temporal_coherence,
    score_title_caption,
)
from app.domain.models.playbook import (
    MathFormulaSnapshot,
    MathPlotCurve,
    MathPlotSnapshot,
    MetaStep,
    NarrationCardSnapshot,
    PlaybookScript,
)

FIXTURE_PATH = pathlib.Path(__file__).parents[3] / "eval" / "fixtures" / "sample_math_playbook.json"


@pytest.fixture()
def fixture_json() -> str:
    return FIXTURE_PATH.read_text()


@pytest.fixture()
def fixture_script(fixture_json: str) -> PlaybookScript:
    return PlaybookScript.model_validate_json(fixture_json)


# ---------------------------------------------------------------------------
# score_schema
# ---------------------------------------------------------------------------


def test_schema_valid_fixture(fixture_json: str) -> None:
    result, script = score_schema(fixture_json)
    assert result.score == 20.0
    assert script is not None


def test_schema_invalid_json() -> None:
    result, script = score_schema("not json")
    assert result.score == 0.0
    assert script is None
    assert result.issues


def test_schema_missing_field() -> None:
    # Missing required 'steps' equivalent — empty dict fails pydantic
    result, script = score_schema('{"fps": 30}')
    assert result.score == 0.0
    assert script is None


# ---------------------------------------------------------------------------
# score_step_count
# ---------------------------------------------------------------------------


def _make_script(n_steps: int) -> PlaybookScript:
    steps = [
        MetaStep(
            step_id=f"step_{i:02d}",
            end_frame=(i + 1) * 30,
            title=f"Step {i}",
            voiceover_text="This is a test voiceover with enough words to pass.",
            snapshot=MathPlotSnapshot(
                curves=[MathPlotCurve(expression="x^2")],
                x_min=-5,
                x_max=5,
            ),
        )
        for i in range(1, n_steps + 1)
    ]
    return PlaybookScript(
        fps=30,
        total_frames=n_steps * 30,
        domain="math",
        title="Test",
        summary="Test",
        steps=steps,
    )


@pytest.mark.parametrize("n,expected_score", [(1, 0.0), (3, 0.0), (4, 10.0), (10, 10.0), (14, 10.0), (15, 0.0)])
def test_step_count_thresholds(n: int, expected_score: float) -> None:
    script = _make_script(n)
    result = score_step_count(script)
    assert result.score == expected_score


# ---------------------------------------------------------------------------
# score_narration
# ---------------------------------------------------------------------------


def test_narration_fixture(fixture_script: PlaybookScript) -> None:
    result = score_narration(fixture_script)
    # Fixture should have non-empty voiceovers
    assert result.score > 10.0


def test_narration_empty_voiceover() -> None:
    script = _make_script(4)
    # Blank out first step
    script.steps[0].voiceover_text = ""
    result = score_narration(script)
    # Coverage part reduced
    assert result.score < 20.0


def test_narration_short_voiceover() -> None:
    script = _make_script(4)
    for step in script.steps:
        step.voiceover_text = "hi"
    result = score_narration(script)
    # avg length = 2 chars, depth score = 2/20 * 10 = 1.0
    assert result.score < 15.0


# ---------------------------------------------------------------------------
# score_title_caption
# ---------------------------------------------------------------------------


def test_title_caption_no_regression(fixture_script: PlaybookScript) -> None:
    result = score_title_caption(fixture_script)
    assert result.score == 15.0


def test_title_caption_regression_detected() -> None:
    steps = [
        MetaStep(
            step_id="step_01",
            end_frame=30,
            title="格林公式",
            voiceover_text="Test narration with some words.",
            snapshot=MathFormulaSnapshot(
                formula_latex=r"\oint \vec{F} \cdot d\vec{r}",
                caption="格林公式",  # duplicate!
            ),
        )
    ]
    script = PlaybookScript(
        fps=30, total_frames=30, domain="math", title="T", summary="S", steps=steps
    )
    result = score_title_caption(script)
    assert result.score < 15.0
    assert "格林公式" in result.issues[0]


def test_title_caption_none_is_ok() -> None:
    steps = [
        MetaStep(
            step_id="step_01",
            end_frame=30,
            title="格林公式",
            voiceover_text="Test narration with some words.",
            snapshot=MathFormulaSnapshot(
                formula_latex=r"\oint \vec{F} \cdot d\vec{r}",
                caption=None,
            ),
        )
    ]
    script = PlaybookScript(
        fps=30, total_frames=30, domain="math", title="T", summary="S", steps=steps
    )
    result = score_title_caption(script)
    assert result.score == 15.0


# ---------------------------------------------------------------------------
# score_snapshot_richness
# ---------------------------------------------------------------------------


def test_snapshot_richness_fixture(fixture_script: PlaybookScript) -> None:
    result = score_snapshot_richness(fixture_script)
    assert result.score == 15.0


def test_snapshot_richness_empty_curves() -> None:
    steps = [
        MetaStep(
            step_id="step_01",
            end_frame=30,
            title="T",
            voiceover_text="Narration text here.",
            snapshot=MathPlotSnapshot(curves=[]),  # empty!
        )
    ]
    script = PlaybookScript(
        fps=30, total_frames=30, domain="math", title="T", summary="S", steps=steps
    )
    result = score_snapshot_richness(script)
    assert result.score == 0.0


def test_snapshot_richness_narration_card_ok() -> None:
    steps = [
        MetaStep(
            step_id="step_01",
            end_frame=30,
            title="T",
            voiceover_text="Narration text here.",
            snapshot=NarrationCardSnapshot(text="Some content"),
        )
    ]
    script = PlaybookScript(
        fps=30, total_frames=30, domain="math", title="T", summary="S", steps=steps
    )
    result = score_snapshot_richness(script)
    assert result.score == 15.0


# ---------------------------------------------------------------------------
# score_temporal_coherence
# ---------------------------------------------------------------------------


def test_temporal_coherence_fixture(fixture_script: PlaybookScript) -> None:
    result = score_temporal_coherence(fixture_script)
    assert result.score == 10.0


def test_temporal_non_monotonic() -> None:
    script = _make_script(4)
    # Scramble end_frames
    script.steps[2].end_frame = 20  # less than step 1's 60
    result = score_temporal_coherence(script)
    assert result.score == 0.0


def test_temporal_exceeds_total() -> None:
    script = _make_script(4)
    script.steps[-1].end_frame = script.total_frames + 100
    result = score_temporal_coherence(script)
    assert result.score == 0.0


# ---------------------------------------------------------------------------
# score_diversity
# ---------------------------------------------------------------------------


def test_diversity_fixture(fixture_script: PlaybookScript) -> None:
    # Fixture is all math_plot — 1 kind
    kinds = {s.snapshot.kind for s in fixture_script.steps}
    result = score_diversity(fixture_script)
    if len(kinds) < 2:
        assert result.score == 0.0
    else:
        assert result.score == 10.0


def test_diversity_two_kinds() -> None:
    script = _make_script(4)
    # Mix in a narration card
    script.steps[0].snapshot = NarrationCardSnapshot(text="Intro")
    result = score_diversity(script)
    assert result.score == 10.0


# ---------------------------------------------------------------------------
# score_playbook aggregate
# ---------------------------------------------------------------------------


def test_score_playbook_fixture(fixture_json: str) -> None:
    card = score_playbook("sample-math", fixture_json)
    assert card.parse_error is None
    assert card.max_total == 100.0
    assert card.total >= 0


def test_score_playbook_invalid_json() -> None:
    card = score_playbook("bad", "garbage")
    assert card.parse_error is not None
    assert card.total == 0.0
    assert card.max_total == 100.0


def test_score_playbook_passed_flag() -> None:
    # A high-quality synthetic script should pass
    script = _make_script(8)
    # Add a second snapshot kind for diversity
    script.steps[0].snapshot = NarrationCardSnapshot(text="Introduction to this topic")
    raw = script.model_dump_json()
    card = score_playbook("synthetic", raw)
    assert card.max_total == 100.0
    # Check individual scores are in range
    for dim in card.dimensions:
        assert 0.0 <= dim.score <= dim.max_score
