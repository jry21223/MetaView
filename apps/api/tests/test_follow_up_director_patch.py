from __future__ import annotations

import json
from typing import Any

import pytest

from app.application.dto.followup_dto import FollowUpRequest
from app.application.use_cases.follow_up import FollowUpPatchError, FollowUpPatchUseCase
from app.domain.models.director import DirectorScript
from app.domain.models.playbook import PlaybookScript


class SequenceLLM:
    def __init__(self, responses: list[str]) -> None:
        self.responses = list(responses)

    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        if len(self.responses) == 1:
            return self.responses[0]
        return self.responses.pop(0)


@pytest.mark.asyncio
async def test_followup_can_patch_director_without_rewriting_playbook() -> None:
    use_case = FollowUpPatchUseCase(
        SequenceLLM([
            _payload(
                [
                    {"op": "replace", "path": "/beats/1/camera_motion", "value": "push_in"},
                    {"op": "replace", "path": "/beats/1/pacing", "value": "slow"},
                    {
                        "op": "replace",
                        "path": "/beats/1/emphasis_terms",
                        "value": ["顶点公式"],
                    },
                ],
                target="director",
            )
        ]),
        default_step_frames=60,
    )

    result = await use_case.execute(_playbook(), _request(), _director())

    assert result.target == "director"
    assert result.playbook is None
    assert result.director is not None
    assert result.director.source == "manual"
    assert result.director.beats[1].camera_motion == "push_in"
    assert result.director.beats[1].pacing == "slow"
    assert result.director.beats[1].emphasis_terms == ["顶点公式"]


@pytest.mark.asyncio
async def test_followup_infers_director_target_from_beat_paths() -> None:
    use_case = FollowUpPatchUseCase(
        SequenceLLM([
            _payload([
                {"op": "replace", "path": "/beats/0/shot_type", "value": "close"},
            ])
        ]),
        default_step_frames=60,
    )

    result = await use_case.execute(_playbook(), _request(), _director())

    assert result.target == "director"
    assert result.director is not None
    assert result.director.beats[0].shot_type == "close"


@pytest.mark.asyncio
async def test_followup_rejects_forbidden_director_paths_after_repair() -> None:
    use_case = FollowUpPatchUseCase(
        SequenceLLM([
            _payload(
                [{"op": "replace", "path": "/beats/0/start_frame", "value": 30}],
                target="director",
            ),
            _payload(
                [{"op": "replace", "path": "/schema_version", "value": "2.0.0"}],
                target="director",
            ),
        ]),
        default_step_frames=60,
    )

    with pytest.raises(FollowUpPatchError, match="patch path is not allowed"):
        await use_case.execute(_playbook(), _request(), _director())


@pytest.mark.asyncio
async def test_followup_rejects_non_manual_director_source() -> None:
    use_case = FollowUpPatchUseCase(
        SequenceLLM([
            _payload(
                [{"op": "replace", "path": "/source", "value": "agent"}],
                target="director",
            )
        ]),
        default_step_frames=60,
    )

    with pytest.raises(FollowUpPatchError, match="source can only"):
        await use_case.execute(_playbook(), _request(), _director())


def _payload(patch: list[dict[str, Any]], *, target: str | None = None) -> str:
    payload: dict[str, Any] = {
        "reply": "已更新导演层。",
        "change_summary": "update director",
        "patch": patch,
    }
    if target is not None:
        payload["target"] = target
    return json.dumps(payload, ensure_ascii=False)


def _request() -> FollowUpRequest:
    return FollowUpRequest(message="把第二步镜头推近一点，讲慢一点。", messages=[])


def _director() -> DirectorScript:
    return DirectorScript.model_validate(
        {
            "schema_version": "1.0.0",
            "source": "rule",
            "run_id": "run-1",
            "beats": [
                {
                    "beat_id": "beat_01",
                    "step_id": "step_01",
                    "start_frame": 0,
                    "end_frame": 60,
                    "intent": "hook",
                    "shot_type": "wide",
                    "camera_motion": "hold",
                    "pacing": "normal",
                    "emphasis_terms": [],
                },
                {
                    "beat_id": "beat_02",
                    "step_id": "step_02",
                    "start_frame": 60,
                    "end_frame": 120,
                    "intent": "focus",
                    "shot_type": "medium",
                    "camera_motion": "hold",
                    "pacing": "normal",
                    "emphasis_terms": [],
                },
            ],
        }
    )


def _playbook() -> PlaybookScript:
    return PlaybookScript.model_validate(
        {
            "schema_version": "1.0.0",
            "fps": 30,
            "total_frames": 120,
            "domain": "math",
            "title": "二次函数",
            "summary": "讲解顶点和对称轴。",
            "steps": [
                _step("step_01", 60, "顶点"),
                _step("step_02", 120, "对称轴"),
            ],
            "parameter_controls": [],
            "initial_data": {},
        }
    )


def _step(step_id: str, end_frame: int, title: str) -> dict[str, Any]:
    snapshot = {
        "kind": "algorithm_array",
        "array_values": ["1", "2"],
        "active_indices": [],
        "swap_indices": [],
        "sorted_indices": [],
        "pointers": {},
    }
    return {
        "step_id": step_id,
        "end_frame": end_frame,
        "title": title,
        "voiceover_text": f"{title} narration.",
        "snapshot": snapshot,
        "layers": [{"timing": {"enter_at": 0, "exit_at": 1}, "body": snapshot}],
        "tokens": [],
    }
