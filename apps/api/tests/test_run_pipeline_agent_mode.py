"""Verify ``RunPipelineUseCase`` honours ``generation_mode='agent'``.

In agent mode the use case must:
- skip ``LLMProvider.complete()`` entirely
- forward the prompt to the IAgentProvider
- validate the returned dict against ``PlaybookScript`` schema
- persist the validated JSON without invoking ``build_playbook``
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase


class _RecordingRepo:
    def __init__(self) -> None:
        self.updates: list[dict[str, Any]] = []

    async def create(self, run_id: str, prompt: str, created_at: str) -> None:
        return None

    async def get(self, run_id: str) -> Any:
        return None

    async def list(self, **_: Any) -> list[Any]:
        return []

    async def update(self, run_id: str, **kwargs: Any) -> None:
        self.updates.append({"run_id": run_id, **kwargs})


class _RecordingDirectorRepo:
    def __init__(self) -> None:
        self.upserts: list[dict[str, Any]] = []

    async def upsert(self, director: Any, updated_at: str) -> None:
        self.upserts.append({"director": director, "updated_at": updated_at})

    async def get(self, run_id: str) -> Any:
        return None

    async def delete(self, run_id: str) -> bool:
        return False


class _RaisingLLM:
    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        raise AssertionError("LLM.complete must not be called in agent mode")


class _FakeAgent:
    def __init__(self, playbook: dict[str, Any]) -> None:
        self.playbook = playbook
        self.calls: list[dict[str, Any]] = []

    async def generate(
        self, prompt: str, provider_config: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        self.calls.append({"prompt": prompt, "provider_config": provider_config})
        return self.playbook


_MIN_PLAYBOOK: dict[str, Any] = {
    "fps": 30,
    "total_frames": 120,
    "domain": "algorithm",
    "title": "Sample",
    "summary": "From agent",
    "steps": [
        {
            "step_id": "step_01",
            "end_frame": 120,
            "title": "Array state",
            "voiceover_text": "Show the array.",
            "tokens": [
                {"id": "t0", "label": "3", "value": "3", "emphasis": "primary"},
                {"id": "t1", "label": "1", "value": "1", "emphasis": "accent"},
            ],
            "code_highlight": None,
            "narration_template": ["Show the array."],
            "snapshot": {
                "kind": "algorithm_bars",
                "array_values": ["3", "1"],
                "numeric_values": [3, 1],
                "active_indices": [0],
                "swap_indices": [],
                "sorted_indices": [1],
                "pointers": {},
            },
            "layers": [
                {
                    "timing": {
                        "enter_at": 0,
                        "exit_at": 1,
                        "appear_anim": "fade",
                        "z_order": 0,
                    },
                    "body": {
                        "kind": "algorithm_bars",
                        "array_values": ["3", "1"],
                        "numeric_values": [3, 1],
                        "active_indices": [0],
                        "swap_indices": [],
                        "sorted_indices": [1],
                        "pointers": {},
                    },
                }
            ],
        }
    ],
    "parameter_controls": [],
}


_MOTION_SCENE_PLAYBOOK: dict[str, Any] = {
    "fps": 30,
    "total_frames": 60,
    "domain": "math",
    "title": "Motion Scene",
    "summary": "Agent-authored object motion scene",
    "steps": [
        {
            "step_id": "motion_01",
            "end_frame": 60,
            "title": "Move a point",
            "voiceover_text": "Track a point across the canvas.",
            "tokens": [],
            "snapshot": {
                "kind": "motion_scene",
                "viewport": {
                    "width": 960,
                    "height": 540,
                    "world": {"xMin": 0, "xMax": 960, "yMin": 0, "yMax": 540},
                },
                "objects": [
                    {"id": "p1", "type": "point", "x": 120, "y": 180, "style": "primary"},
                    {"id": "label", "type": "text", "x": 160, "y": 160, "text": "A"},
                ],
                "tracks": [
                    {
                        "target": "p1",
                        "property": "x",
                        "keyframes": [{"t": 0, "value": 120}, {"t": 1, "value": 300}],
                        "easing": "linear",
                    }
                ],
                "camera": {
                    "keyframes": [
                        {"t": 0, "x": 480, "y": 270, "zoom": 1},
                        {"t": 1, "x": 300, "y": 220, "zoom": 1.2},
                    ],
                    "easing": "easeInOut",
                },
            },
            "layers": [
                {
                    "body": {
                        "kind": "motion_scene",
                        "viewport": {
                            "width": 960,
                            "height": 540,
                            "world": {"xMin": 0, "xMax": 960, "yMin": 0, "yMax": 540},
                        },
                        "objects": [
                            {
                                "id": "p1",
                                "type": "point",
                                "x": 120,
                                "y": 180,
                                "style": "primary",
                            }
                        ],
                        "tracks": [],
                    }
                }
            ],
        }
    ],
    "parameter_controls": [],
}


@pytest.mark.asyncio
async def test_agent_mode_routes_to_agent_provider() -> None:
    repo = _RecordingRepo()
    director_repo = _RecordingDirectorRepo()
    agent = _FakeAgent(_MIN_PLAYBOOK)
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        agent_provider=agent,
        generation_mode="agent",
        director_repo=director_repo,
    )

    await use_case.execute("run-1", PipelineRequest(prompt="hello math"))

    assert agent.calls == [{"prompt": "hello math", "provider_config": None}]
    # The final update must carry the persisted playbook JSON.
    last = repo.updates[-1]
    assert last["status"].value == "succeeded"
    playbook_dict = json.loads(last["playbook_json"])
    assert playbook_dict["title"] == "Sample"
    assert playbook_dict["steps"][0]["step_id"] == "step_01"
    assert playbook_dict["steps"][0]["snapshot"]["array_values"] == ["3", "1"]
    assert playbook_dict["steps"][0]["snapshot"]["numeric_values"] == [3.0, 1.0]
    assert "tokens" not in playbook_dict["steps"][0]["snapshot"]
    assert playbook_dict["steps"][0]["layers"][0]["body"] == playbook_dict["steps"][0]["snapshot"]
    assert director_repo.upserts[0]["director"].run_id == "run-1"
    assert director_repo.upserts[0]["director"].beats[0].step_id == "step_01"


@pytest.mark.asyncio
async def test_agent_mode_accepts_motion_scene_playbook_contract() -> None:
    repo = _RecordingRepo()
    agent = _FakeAgent(_MOTION_SCENE_PLAYBOOK)
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        agent_provider=agent,
        generation_mode="agent",
    )

    await use_case.execute("run-motion", PipelineRequest(prompt="show object motion"))

    last = repo.updates[-1]
    assert last["status"].value == "succeeded"
    playbook_dict = json.loads(last["playbook_json"])
    step = playbook_dict["steps"][0]
    assert step["snapshot"]["kind"] == "motion_scene"
    assert step["snapshot"]["tracks"][0]["property"] == "x"
    assert step["layers"][0]["body"]["kind"] == "motion_scene"


@pytest.mark.asyncio
async def test_agent_mode_forwards_provider_override() -> None:
    repo = _RecordingRepo()
    agent = _FakeAgent(_MIN_PLAYBOOK)
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        agent_provider=agent,
        generation_mode="agent",
    )

    await use_case.execute(
        "run-1",
        PipelineRequest(
            prompt="topic",
            provider_api_key="sk-x",
            provider_base_url="https://example.com/v1",
            provider_model="qwen-plus",
        ),
    )
    assert agent.calls[0]["provider_config"] == {
        "api_key": "sk-x",
        "base_url": "https://example.com/v1",
        "model": "qwen-plus",
    }


@pytest.mark.asyncio
async def test_agent_mode_bad_payload_fails_run() -> None:
    repo = _RecordingRepo()
    agent = _FakeAgent({"not": "a playbook"})  # missing required fields
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        agent_provider=agent,
        generation_mode="agent",
    )

    await use_case.execute("run-1", PipelineRequest(prompt="x"))

    assert repo.updates[-1]["status"].value == "failed"
    assert "error" in repo.updates[-1]


@pytest.mark.asyncio
async def test_agent_mode_rejects_legacy_id_only_step_payload() -> None:
    legacy = json.loads(json.dumps(_MIN_PLAYBOOK))
    legacy["steps"][0]["id"] = legacy["steps"][0].pop("step_id")
    repo = _RecordingRepo()
    agent = _FakeAgent(legacy)
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        agent_provider=agent,
        generation_mode="agent",
    )

    await use_case.execute("run-1", PipelineRequest(prompt="x"))

    assert repo.updates[-1]["status"].value == "failed"
    assert "step_id" in repo.updates[-1]["error"]


@pytest.mark.asyncio
async def test_single_mode_does_not_call_agent() -> None:
    repo = _RecordingRepo()
    agent = _FakeAgent(_MIN_PLAYBOOK)

    class _StubLLM:
        async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
            # Return a minimal failing payload so the legacy path exits via the
            # PipelineValidationError branch — we only care that this is the
            # path taken, not whether it succeeds.
            return "{}"

    use_case = RunPipelineUseCase(
        repo,
        _StubLLM(),
        agent_provider=agent,
        generation_mode="single",
    )
    await use_case.execute("run-1", PipelineRequest(prompt="single"))

    # Agent must never be invoked.
    assert agent.calls == []
