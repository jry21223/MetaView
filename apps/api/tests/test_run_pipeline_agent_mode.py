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
from app.application.ports.agent_provider import AgentProviderError
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.skills.registry import SkillRegistry


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
        self,
        prompt: str,
        provider_config: dict[str, Any] | None = None,
        route_decision: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self.calls.append({
            "prompt": prompt,
            "provider_config": provider_config,
            "route_decision": route_decision,
        })
        return self.playbook


class _SequenceAgent:
    def __init__(self, playbooks: list[dict[str, Any]]) -> None:
        self.playbooks = playbooks
        self.calls: list[dict[str, Any]] = []

    async def generate(
        self,
        prompt: str,
        provider_config: dict[str, Any] | None = None,
        route_decision: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self.calls.append({
            "prompt": prompt,
            "provider_config": provider_config,
            "route_decision": route_decision,
        })
        index = min(len(self.calls) - 1, len(self.playbooks) - 1)
        return self.playbooks[index]


class _SequenceReviewer:
    model_name = "critic-test"

    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, str]] = []

    async def complete(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        index = min(len(self.calls) - 1, len(self.responses) - 1)
        return self.responses[index]


class _StructuredFailureAgent:
    async def generate(
        self,
        prompt: str,
        provider_config: dict[str, Any] | None = None,
        route_decision: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        raise AgentProviderError(
            "agent self-check blocked PlaybookScript generation",
            structured_failure={
                "status": "blocked",
                "issues": [
                    {
                        "code": "step.empty_voiceover",
                        "severity": "error",
                        "path": "steps[0].voiceover_text",
                        "message": "Every step must have non-empty voiceover_text.",
                        "suggestion": "Write narration.",
                    }
                ],
            },
        )


def _playbook_copy() -> dict[str, Any]:
    return json.loads(json.dumps(_MIN_PLAYBOOK))


def _algorithm_step(index: int) -> dict[str, Any]:
    active = (index - 1) % 4
    snapshot = {
        "kind": "algorithm_bars",
        "array_values": ["3", "1", "4", "2"],
        "numeric_values": [3, 1, 4, 2],
        "active_indices": [active],
        "swap_indices": [],
        "sorted_indices": list(range(active)),
        "pointers": {"cursor": active},
    }
    return {
        "step_id": f"step_{index:02d}",
        "end_frame": index * 60,
        "title": f"Array state {index}",
        "voiceover_text": f"Show the array state {index} and explain the array result.",
        "tokens": [
            {"id": "t0", "label": "3", "value": "3", "emphasis": "primary"},
            {"id": "t1", "label": "1", "value": "1", "emphasis": "accent"},
            {"id": "t2", "label": "4", "value": "4", "emphasis": "secondary"},
            {"id": "t3", "label": "2", "value": "2", "emphasis": "secondary"},
        ],
        "code_highlight": None,
        "narration_template": [
            f"Show the array state {index} and explain the array result."
        ],
        "snapshot": snapshot,
        "layers": [
            {
                "timing": {
                    "enter_at": 0,
                    "exit_at": 1,
                    "appear_anim": "fade",
                    "z_order": 0,
                },
                "body": json.loads(json.dumps(snapshot)),
            }
        ],
    }


def _motion_step(index: int) -> dict[str, Any]:
    start_x = 120 + (index - 1) * 20
    end_x = start_x + 120
    snapshot = {
        "kind": "motion_scene",
        "viewport": {
            "width": 960,
            "height": 540,
            "world": {"xMin": 0, "xMax": 960, "yMin": 0, "yMax": 540},
        },
        "objects": [
            {"id": "p1", "type": "point", "x": start_x, "y": 180, "style": "primary"},
            {"id": "label", "type": "text", "x": start_x + 40, "y": 160, "text": "A"},
        ],
        "tracks": [
            {
                "target": "p1",
                "property": "x",
                "keyframes": [{"t": 0, "value": start_x}, {"t": 1, "value": end_x}],
                "easing": "linear",
            }
        ],
        "camera": {
            "keyframes": [
                {"t": 0, "x": 480, "y": 270, "zoom": 1},
                {"t": 1, "x": end_x, "y": 220, "zoom": 1.2},
            ],
            "easing": "easeInOut",
        },
    }
    return {
        "step_id": f"motion_{index:02d}",
        "end_frame": index * 60,
        "title": f"Move point {index}",
        "voiceover_text": f"Track the motion scene point across the canvas in step {index}.",
        "tokens": [],
        "snapshot": snapshot,
        "layers": [{"body": json.loads(json.dumps(snapshot))}],
    }


def _reviewer_response(status: str, issues: list[dict[str, Any]] | None = None) -> str:
    return json.dumps({
        "status": status,
        "summary": f"Reviewer returned {status}.",
        "issues": issues or [],
    })


def _blocking_issue(code: str = "review.final_answer_missing") -> dict[str, Any]:
    return {
        "code": code,
        "severity": "error",
        "path": "steps[-1].voiceover_text",
        "message": "The final step does not answer the original prompt.",
        "suggestion": "Regenerate the playbook so the final step states the answer.",
    }


_MIN_PLAYBOOK: dict[str, Any] = {
    "fps": 30,
    "total_frames": 480,
    "domain": "algorithm",
    "title": "Sample",
    "summary": "From agent",
    "steps": [_algorithm_step(index) for index in range(1, 9)],
    "parameter_controls": [],
}


_MOTION_SCENE_PLAYBOOK: dict[str, Any] = {
    "fps": 30,
    "total_frames": 480,
    "domain": "math",
    "title": "Motion Scene",
    "summary": "Agent-authored object motion scene",
    "steps": [_motion_step(index) for index in range(1, 9)],
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
        reviewer_mode="off",
    )

    await use_case.execute("run-1", PipelineRequest(prompt="hello math"))

    assert agent.calls[0]["prompt"] == "hello math"
    assert agent.calls[0]["provider_config"] is None
    assert agent.calls[0]["route_decision"]["destination"] == "generic_cir"
    # The final update must carry the persisted playbook JSON.
    last = repo.updates[-1]
    assert last["status"].value == "succeeded"
    playbook_dict = json.loads(last["playbook_json"])
    assert playbook_dict["title"] == "Sample"
    assert playbook_dict["steps"][0]["step_id"] == "step_01"
    assert playbook_dict["steps"][0]["snapshot"]["array_values"] == ["3", "1", "4", "2"]
    assert playbook_dict["steps"][0]["snapshot"]["numeric_values"] == [3.0, 1.0, 4.0, 2.0]
    assert "tokens" not in playbook_dict["steps"][0]["snapshot"]
    assert playbook_dict["steps"][0]["layers"][0]["body"] == playbook_dict["steps"][0]["snapshot"]
    review = json.loads(last["review_json"])
    assert review["status"] == "clean"
    assert "agent:self_check:clean" in review["actions"]
    assert "agent_skill:generic" in review["actions"]
    assert "reviewer:disabled" in review["actions"]
    assert "reviewer:unconfigured" not in review["actions"]
    assert director_repo.upserts[0]["director"].run_id == "run-1"
    assert director_repo.upserts[0]["director"].beats[0].step_id == "step_01"


@pytest.mark.asyncio
async def test_agent_mode_records_domain_agent_skill_action() -> None:
    repo = _RecordingRepo()
    agent = _FakeAgent(_MIN_PLAYBOOK)
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        agent_provider=agent,
        generation_mode="agent",
        reviewer_mode="off",
        skill_registry=SkillRegistry([]),
    )

    await use_case.execute(
        "run-chemistry-agent",
        PipelineRequest(prompt="讲解强酸强碱滴定曲线", domain="chemistry"),
    )

    review = json.loads(repo.updates[-1]["review_json"])
    assert "router:domain:chemistry" in review["actions"]
    assert "agent_skill:chemistry" in review["actions"]


@pytest.mark.asyncio
async def test_agent_mode_missing_reviewer_fails_when_reviewer_enabled() -> None:
    repo = _RecordingRepo()
    agent = _FakeAgent(_MIN_PLAYBOOK)
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        agent_provider=agent,
        generation_mode="agent",
        reviewer_mode="on_failure",
    )

    await use_case.execute("run-reviewer-missing", PipelineRequest(prompt="Show the array"))

    last = repo.updates[-1]
    assert last["status"].value == "failed"
    assert "reviewer.unconfigured" in last["error"]
    assert "playbook_json" not in last
    review = json.loads(last["review_json"])
    assert review["status"] == "blocked"
    assert review["issues"][0]["code"] == "reviewer.unconfigured"
    assert "reviewer:unconfigured" in review["actions"]


@pytest.mark.asyncio
async def test_agent_mode_clean_output_records_self_check_and_reviewer_status() -> None:
    repo = _RecordingRepo()
    agent = _FakeAgent(_MIN_PLAYBOOK)
    reviewer = _SequenceReviewer([_reviewer_response("clean")])
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        reviewer_llm=reviewer,
        agent_provider=agent,
        generation_mode="agent",
    )

    await use_case.execute("run-clean", PipelineRequest(prompt="Show the array"))

    last = repo.updates[-1]
    assert last["status"].value == "succeeded"
    review = json.loads(last["review_json"])
    assert "agent:self_check:clean" in review["actions"]
    assert "reviewer:model:critic-test" in review["actions"]
    assert "reviewer:status:clean" in review["actions"]


@pytest.mark.asyncio
async def test_agent_mode_self_check_blocked_repairs_before_persisting() -> None:
    blocked = _playbook_copy()
    blocked["steps"][0]["voiceover_text"] = ""
    repaired = _playbook_copy()
    repaired["steps"][0]["voiceover_text"] = "Show the array and explain the final answer."
    agent = _SequenceAgent([blocked, repaired])
    reviewer = _SequenceReviewer([_reviewer_response("clean")])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        reviewer_llm=reviewer,
        agent_provider=agent,
        generation_mode="agent",
    )

    await use_case.execute("run-self-repair", PipelineRequest(prompt="Show the array"))

    assert len(agent.calls) == 2
    assert "agent self-check blocked" in agent.calls[1]["prompt"]
    last = repo.updates[-1]
    assert last["status"].value == "succeeded"
    persisted = json.loads(last["playbook_json"])
    assert persisted["steps"][0]["voiceover_text"] == repaired["steps"][0]["voiceover_text"]
    review = json.loads(last["review_json"])
    assert "agent:self_check:blocked" in review["actions"]
    assert "agent:self_repair_attempt:1" in review["actions"]
    assert "agent:self_check:clean" in review["actions"]


@pytest.mark.asyncio
async def test_agent_mode_reviewer_blocked_repairs_and_reruns_reviewer() -> None:
    initial = _playbook_copy()
    repaired = _playbook_copy()
    repaired["title"] = "Repaired Sample"
    agent = _SequenceAgent([initial, repaired])
    reviewer = _SequenceReviewer([
        _reviewer_response("blocked", [_blocking_issue()]),
        _reviewer_response("clean"),
    ])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        reviewer_llm=reviewer,
        agent_provider=agent,
        generation_mode="agent",
    )

    await use_case.execute("run-reviewer-repair", PipelineRequest(prompt="Show the array"))

    assert len(agent.calls) == 2
    assert "third-party reviewer blocked" in agent.calls[1]["prompt"]
    assert len(reviewer.calls) == 2
    last = repo.updates[-1]
    assert last["status"].value == "succeeded"
    persisted = json.loads(last["playbook_json"])
    assert persisted["title"] == "Repaired Sample"
    review = json.loads(last["review_json"])
    assert "reviewer:status:blocked" in review["actions"]
    assert "reviewer:repair_attempt:1" in review["actions"]
    assert "reviewer:status:clean" in review["actions"]


@pytest.mark.asyncio
async def test_agent_mode_reviewer_blocked_after_max_attempts_fails() -> None:
    agent = _SequenceAgent([_playbook_copy(), _playbook_copy()])
    reviewer = _SequenceReviewer([
        _reviewer_response("blocked", [_blocking_issue("review.missing_answer")]),
        _reviewer_response("blocked", [_blocking_issue("review.still_missing_answer")]),
    ])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        reviewer_llm=reviewer,
        max_repair_attempts=1,
        agent_provider=agent,
        generation_mode="agent",
    )

    await use_case.execute("run-reviewer-fail", PipelineRequest(prompt="Show the array"))

    last = repo.updates[-1]
    assert last["status"].value == "failed"
    assert "review.still_missing_answer" in last["error"]
    assert "playbook_json" not in last
    review = json.loads(last["review_json"])
    assert review["status"] == "blocked"
    assert "reviewer:repair_attempt:1" in review["actions"]


@pytest.mark.asyncio
async def test_agent_mode_malformed_reviewer_json_fails_closed() -> None:
    agent = _FakeAgent(_MIN_PLAYBOOK)
    reviewer = _SequenceReviewer(["not json"])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        reviewer_llm=reviewer,
        agent_provider=agent,
        generation_mode="agent",
    )

    await use_case.execute("run-reviewer-malformed", PipelineRequest(prompt="Show the array"))

    last = repo.updates[-1]
    assert last["status"].value == "failed"
    assert "reviewer.invalid_output" in last["error"]
    assert "playbook_json" not in last
    review = json.loads(last["review_json"])
    assert review["status"] == "blocked"
    assert "reviewer:status:blocked" in review["actions"]


@pytest.mark.asyncio
async def test_agent_mode_structured_sidecar_self_check_failure_is_reviewed() -> None:
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        agent_provider=_StructuredFailureAgent(),
        generation_mode="agent",
    )

    await use_case.execute("run-sidecar-self-check", PipelineRequest(prompt="Show the array"))

    last = repo.updates[-1]
    assert last["status"].value == "failed"
    assert "step.empty_voiceover" in last["error"]
    assert "playbook_json" not in last
    review = json.loads(last["review_json"])
    assert review["status"] == "blocked"
    assert review["issues"][0]["code"] == "step.empty_voiceover"
    assert "agent:self_check:blocked" in review["actions"]


@pytest.mark.asyncio
async def test_agent_mode_accepts_motion_scene_playbook_contract() -> None:
    repo = _RecordingRepo()
    agent = _FakeAgent(_MOTION_SCENE_PLAYBOOK)
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        agent_provider=agent,
        generation_mode="agent",
        reviewer_mode="off",
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
        reviewer_mode="off",
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

    assert len(agent.calls) == 3
    assert repo.updates[-1]["status"].value == "failed"
    assert "error" in repo.updates[-1]
    review = json.loads(repo.updates[-1]["review_json"])
    assert review["status"] == "blocked"
    assert review["issues"][0]["code"] == "schema.invalid"
    assert "agent:self_repair_attempt:1" in review["actions"]
    assert "agent:self_repair_attempt:2" in review["actions"]


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
    review = json.loads(repo.updates[-1]["review_json"])
    assert review["status"] == "blocked"
    assert review["issues"][0]["code"] == "schema.invalid"


@pytest.mark.asyncio
async def test_agent_mode_rejects_invalid_third_party_reviewer_output() -> None:
    repo = _RecordingRepo()
    agent = _FakeAgent(_MIN_PLAYBOOK)
    reviewer = _SequenceReviewer(["Looks good to me."])
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        reviewer_llm=reviewer,
        agent_provider=agent,
        generation_mode="agent",
    )

    await use_case.execute("run-1", PipelineRequest(prompt="hello math"))

    last = repo.updates[-1]
    assert last["status"].value == "failed"
    review = json.loads(last["review_json"])
    assert review["status"] == "blocked"
    assert review["issues"][0]["code"] == "reviewer.invalid_output"


@pytest.mark.asyncio
async def test_agent_mode_persists_third_party_reviewer_warnings() -> None:
    repo = _RecordingRepo()
    agent = _FakeAgent(_MIN_PLAYBOOK)
    reviewer = _SequenceReviewer([
        json.dumps(
            {
                "status": "warnings",
                "summary": "Useful but shallow.",
                "issues": [
                    {
                        "code": "step.too_shallow",
                        "severity": "warning",
                        "path": "steps[0]",
                        "message": "The step could carry more reasoning.",
                        "suggestion": "Add a comparison or decision point.",
                        "requires_repair": False,
                    }
                ],
            }
        )
    ])
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        reviewer_llm=reviewer,
        agent_provider=agent,
        generation_mode="agent",
    )

    await use_case.execute("run-1", PipelineRequest(prompt="hello math"))

    last = repo.updates[-1]
    assert last["status"].value == "succeeded"
    review = json.loads(last["review_json"])
    assert review["status"] == "warnings"
    assert review["issues"][0]["code"] == "step.too_shallow"
    assert "reviewer:started" in review["actions"]
    assert "reviewer:status:warnings" in review["actions"]


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
