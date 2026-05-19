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
    "total_frames": 60,
    "domain": "math",
    "title": "Sample",
    "summary": "From agent",
    "steps": [],
    "parameter_controls": [],
}


@pytest.mark.asyncio
async def test_agent_mode_routes_to_agent_provider() -> None:
    repo = _RecordingRepo()
    agent = _FakeAgent(_MIN_PLAYBOOK)
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        agent_provider=agent,
        generation_mode="agent",
    )

    await use_case.execute("run-1", PipelineRequest(prompt="hello math"))

    assert agent.calls == [{"prompt": "hello math", "provider_config": None}]
    # The final update must carry the persisted playbook JSON.
    last = repo.updates[-1]
    assert last["status"].value == "succeeded"
    playbook_dict = json.loads(last["playbook_json"])
    assert playbook_dict["title"] == "Sample"


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
