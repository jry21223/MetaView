from __future__ import annotations

import json
from typing import Any

import pytest

from app.application.dto.followup_dto import FollowUpRequest
from app.application.use_cases.follow_up import (
    FollowUpPatchError,
    FollowUpPatchUseCase,
    _build_system_prompt,
)
from app.domain.models.playbook import PlaybookScript


class SequenceLLM:
    def __init__(self, responses: list[str]) -> None:
        self.responses = list(responses)
        self.calls = 0
        self.requests: list[tuple[str, str]] = []

    async def complete(self, system: str, user: str) -> str:
        self.calls += 1
        self.requests.append((system, user))
        if len(self.responses) == 1:
            return self.responses[0]
        return self.responses.pop(0)


def test_followup_prompt_guides_students_without_direct_homework_answers() -> None:
    prompt = _build_system_prompt()

    assert "引导学生" in prompt
    assert "不要直接给出作业答案" in prompt
    assert "一次只问一个问题" in prompt
    assert "patch 必须是空数组 []" in prompt


@pytest.mark.asyncio
async def test_explicit_interaction_explanation_injects_semantic_context_without_patch() -> None:
    llm = SequenceLLM([
        _payload([{"op": "replace", "path": "/title", "value": "不应写入"}]),
    ])
    use_case = FollowUpPatchUseCase(llm, default_step_frames=60)
    request = FollowUpRequest.model_validate(
        {
            "message": "请解释我刚才的操作",
            "intent": "explain_interaction",
            "interaction_context": {
                "manifest_version": "1",
                "events": [
                    {
                        "adapter_id": "math.derivative-tangent",
                        "step_id": "step_01",
                        "target_id": "step:step_01:marker-x",
                        "action": "set-value",
                        "value": 3,
                        "sequence": 1,
                    }
                ],
            },
        }
    )

    result = await use_case.execute(_playbook(), request)

    assert result.playbook is None
    assert result.patch == []
    assert result.change_summary == "explain: interaction context"
    system, user = llm.requests[0]
    assert "解释我的操作" in system
    payload = json.loads(user)
    assert payload["interaction_context"]["events"][0]["value"] == 3.0


def test_interaction_context_rejects_raw_targets_and_implicit_attachment() -> None:
    event = {
        "adapter_id": "algorithm.bfs",
        "step_id": "graph",
        "target_id": "#graph > circle:first-child",
        "action": "select",
        "value": "A",
        "sequence": 1,
    }

    with pytest.raises(ValueError, match="semantic start-node"):
        FollowUpRequest.model_validate(
            {
                "message": "解释",
                "intent": "explain_interaction",
                "interaction_context": {"manifest_version": "1", "events": [event]},
            }
        )

    event["target_id"] = "step:graph:start-node"
    with pytest.raises(ValueError, match="only accepted for explicit explanation"):
        FollowUpRequest.model_validate(
            {
                "message": "普通追问",
                "interaction_context": {"manifest_version": "1", "events": [event]},
            }
        )

    with pytest.raises(ValueError, match="Extra inputs are not permitted"):
        FollowUpRequest.model_validate(
            {
                "message": "解释",
                "intent": "explain_interaction",
                "interaction_context": {
                    "manifest_version": "1",
                    "events": [event],
                },
                "patch": [{"op": "replace", "path": "/title", "value": "bad"}],
            }
        )


@pytest.mark.asyncio
async def test_followup_patch_can_replace_title() -> None:
    result = await _execute_patch([
        {"op": "replace", "path": "/title", "value": "切线斜率讲解"},
    ])

    assert result.playbook is not None
    assert result.playbook.title == "切线斜率讲解"
    assert result.playbook.total_frames == 120


@pytest.mark.asyncio
async def test_followup_patch_can_replace_step_voiceover() -> None:
    result = await _execute_patch([
        {
            "op": "replace",
            "path": "/steps/0/voiceover_text",
            "value": "先观察曲线，再把割线慢慢贴近切线。",
        },
    ])

    assert result.playbook is not None
    assert result.playbook.steps[0].voiceover_text == "先观察曲线，再把割线慢慢贴近切线。"


@pytest.mark.asyncio
async def test_followup_patch_normalizes_timeline_after_adding_step() -> None:
    result = await _execute_patch([
        {"op": "add", "path": "/steps/-", "value": _step("新增慢讲", "把斜率读数停留久一点。")},
    ])

    assert result.playbook is not None
    assert [step.end_frame for step in result.playbook.steps] == [60, 120, 180]
    assert result.playbook.total_frames == 180
    assert result.playbook.steps[2].step_id == "step_03"
    assert result.playbook.steps[2].layers[0].body.kind == "algorithm_array"


@pytest.mark.asyncio
async def test_followup_patch_rejects_illegal_root_path_after_repair() -> None:
    llm = SequenceLLM([
        _payload([{"op": "replace", "path": "/fps", "value": 24}]),
        _payload([{"op": "replace", "path": "/total_frames", "value": 300}]),
    ])
    use_case = FollowUpPatchUseCase(llm, default_step_frames=60)

    with pytest.raises(FollowUpPatchError, match="patch path is not allowed"):
        await use_case.execute(_playbook(), _request())

    assert llm.calls == 2


@pytest.mark.asyncio
async def test_followup_patch_normalizes_parameter_and_initial_data_values_to_strings() -> None:
    result = await _execute_patch([
        {
            "op": "replace",
            "path": "/parameter_controls",
            "value": [
                {
                    "id": 7,
                    "label": "样本点",
                    "value": 3,
                    "description": 2,
                    "placeholder": 4,
                }
            ],
        },
        {"op": "replace", "path": "/initial_data", "value": {"array": [3, 1, 2], "n": 3}},
    ])

    assert result.playbook is not None
    assert result.playbook.parameter_controls[0].id == "7"
    assert result.playbook.parameter_controls[0].value == "3"
    assert result.playbook.parameter_controls[0].description == "2"
    assert result.playbook.parameter_controls[0].placeholder == "4"
    assert result.playbook.initial_data == {"array": ["3", "1", "2"], "n": ["3"]}


async def _execute_patch(patch: list[dict[str, Any]]):
    llm = SequenceLLM([_payload(patch)])
    use_case = FollowUpPatchUseCase(llm, default_step_frames=60)
    return await use_case.execute(_playbook(), _request())


def _request() -> FollowUpRequest:
    return FollowUpRequest(message="请修改当前讲解", messages=[])


def _payload(patch: list[dict[str, Any]]) -> str:
    return json.dumps(
        {
            "reply": "已更新讲解。",
            "change_summary": "update playbook",
            "patch": patch,
        },
        ensure_ascii=False,
    )


def _playbook() -> PlaybookScript:
    return PlaybookScript.model_validate(
        {
            "schema_version": "1.0.0",
            "fps": 30,
            "total_frames": 120,
            "domain": "math",
            "title": "原始标题",
            "summary": "原始摘要",
            "steps": [
                _step("观察曲线", "先看 y=x^2 在 x=1 附近的形状。", step_id="step_01", end_frame=60),
                _step("贴近切线", "割线不断靠近切线，斜率也趋近一个稳定值。", step_id="step_02", end_frame=120),
            ],
            "parameter_controls": [],
            "initial_data": {"array": ["1", "2"]},
        }
    )


def _step(
    title: str,
    voiceover_text: str,
    *,
    step_id: str | None = None,
    end_frame: int = 1,
) -> dict[str, Any]:
    snapshot = {
        "kind": "algorithm_array",
        "array_values": ["1", "2"],
        "active_indices": [0],
        "swap_indices": [],
        "sorted_indices": [],
        "pointers": {},
    }
    step = {
        "end_frame": end_frame,
        "title": title,
        "voiceover_text": voiceover_text,
        "snapshot": snapshot,
        "layers": [{"body": snapshot}],
    }
    if step_id is not None:
        step["step_id"] = step_id
    return step
