from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.domain.models.director import DirectorBeat, DirectorScript
from app.domain.models.playbook import PlaybookScript
from app.domain.services.director_builder import build_default_director


def test_director_script_validates_beat_frame_ranges() -> None:
    director = DirectorScript(
        run_id="run-1",
        beats=[
            DirectorBeat(
                beat_id="beat_01",
                step_id="s1",
                start_frame=0,
                end_frame=30,
                intent="hook",
                shot_type="medium",
                camera_motion="push_in",
                pacing="normal",
                voiceover_text="Start here.",
            )
        ],
    )

    assert director.schema_version == "1.0.0"
    assert director.source == "rule"
    assert director.beats[0].focus_target is None

    with pytest.raises(ValidationError):
        DirectorBeat(
            beat_id="bad",
            step_id="s1",
            start_frame=30,
            end_frame=30,
            intent="hook",
            shot_type="medium",
            camera_motion="hold",
            pacing="normal",
        )


def test_director_script_rejects_invalid_source_and_overlapping_beats() -> None:
    with pytest.raises(ValidationError):
        DirectorScript(run_id="run-1", source="unknown", beats=[])

    with pytest.raises(ValidationError):
        DirectorScript(
            run_id="run-1",
            beats=[
                DirectorBeat(
                    beat_id="beat_01",
                    step_id="s1",
                    start_frame=0,
                    end_frame=30,
                    intent="hook",
                    shot_type="medium",
                    camera_motion="hold",
                    pacing="normal",
                ),
                DirectorBeat(
                    beat_id="beat_02",
                    step_id="s2",
                    start_frame=29,
                    end_frame=60,
                    intent="focus",
                    shot_type="close",
                    camera_motion="focus_target",
                    pacing="normal",
                    focus_target="segment:Line_BE",
                ),
            ],
        )


def test_build_default_director_handles_empty_playbook_steps() -> None:
    director = build_default_director(_playbook([]), "run-empty")

    assert director.run_id == "run-empty"
    assert director.source == "rule"
    assert director.beats == []


def test_build_default_director_infers_formula_scene_and_summary_beats() -> None:
    playbook = _playbook(
        [
            _math_formula_step("s1", 30, "核心公式", "E = mc^2"),
            _math_scene_step("s2", 90),
            _narration_step("s3", 120),
        ]
    )

    director = build_default_director(playbook, "run-1")

    assert [(beat.start_frame, beat.end_frame) for beat in director.beats] == [
        (0, 30),
        (30, 90),
        (90, 120),
    ]
    assert director.beats[0].intent == "hook"
    assert director.beats[0].camera_motion == "push_in"
    assert director.beats[1].intent == "reveal"
    assert director.beats[1].shot_type == "medium"
    assert director.beats[-1].intent == "summary"
    assert director.beats[-1].camera_motion == "pull_out"
    assert director.beats[-1].pacing == "slow"
    assert director.beats[0].voiceover_text is None
    assert "核心公式" in director.beats[0].emphasis_terms


def test_build_default_director_infers_middle_formula_focus() -> None:
    playbook = _playbook(
        [
            _array_step("s1", 30),
            _math_formula_step("s2", 60, "导数公式", "\\frac{d}{dx}x^2=2x"),
            _array_step("s3", 90),
        ]
    )

    director = build_default_director(playbook, "run-2")

    middle = director.beats[1]
    assert middle.intent == "focus"
    assert middle.shot_type == "close"
    assert middle.camera_motion == "hold"
    assert any("frac" in term or "dx" in term for term in middle.emphasis_terms)


def _playbook(steps: list[dict]) -> PlaybookScript:
    return PlaybookScript.model_validate(
        {
            "schema_version": "1.0.0",
            "fps": 30,
            "total_frames": max([step["end_frame"] for step in steps], default=60),
            "domain": "math",
            "title": "Director fixture",
            "summary": "Fixture summary.",
            "steps": steps,
            "parameter_controls": [],
            "initial_data": {},
        }
    )


def _array_step(step_id: str, end_frame: int) -> dict:
    snapshot = {
        "kind": "algorithm_array",
        "array_values": ["1", "2"],
        "active_indices": [],
        "swap_indices": [],
        "sorted_indices": [],
        "pointers": {},
    }
    return _step(step_id, end_frame, "数组状态", "Show array.", snapshot)


def _math_formula_step(step_id: str, end_frame: int, title: str, formula: str) -> dict:
    return _step(
        step_id,
        end_frame,
        title,
        "Explain the formula.",
        {
            "kind": "math_formula",
            "formula_latex": formula,
            "caption": "公式含义",
            "highlights": [],
            "annotations": [],
        },
    )


def _math_scene_step(step_id: str, end_frame: int) -> dict:
    return _step(
        step_id,
        end_frame,
        "展示几何关系",
        "Reveal the scene.",
        {
            "kind": "math_scene",
            "x_min": -1,
            "x_max": 1,
            "y_min": -1,
            "y_max": 1,
            "x_label": "x",
            "y_label": "y",
            "points": [],
            "curves": [],
            "regions": [],
            "segments": [],
            "annotations": [],
            "formula_latex": "x+y=1",
            "caption": "几何图像",
        },
    )


def _narration_step(step_id: str, end_frame: int) -> dict:
    return _step(
        step_id,
        end_frame,
        "总结",
        "Summarize.",
        {"kind": "narration_card", "text": "总结要点", "position": "bottom"},
    )


def _step(
    step_id: str,
    end_frame: int,
    title: str,
    voiceover: str,
    snapshot: dict,
) -> dict:
    return {
        "step_id": step_id,
        "end_frame": end_frame,
        "title": title,
        "voiceover_text": voiceover,
        "snapshot": snapshot,
        "layers": [{"timing": {"enter_at": 0, "exit_at": 1}, "body": snapshot}],
        "tokens": [],
    }
