from __future__ import annotations

import json
from typing import Any

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.skills.base import SkillRouteMatch


def _generic_cir_json(domain: str = "geography") -> str:
    return json.dumps({
        "version": "0.1.0",
        "title": "Generic Route",
        "domain": domain,
        "summary": "A short valid CIR fixture.",
        "steps": [
            {
                "id": "step_01",
                "title": "Show the first idea",
                "narration": "This fixture is enough to exercise prompt routing.",
                "visual_kind": "array",
                "tokens": [
                    {"id": "t0", "label": "A", "value": "A", "emphasis": "primary"},
                    {"id": "t1", "label": "B", "value": "B", "emphasis": "secondary"},
                ],
                "annotations": [],
            }
        ],
    })


class _RecordingRepo:
    def __init__(self) -> None:
        self.updates: list[dict[str, Any]] = []

    async def update(self, run_id: str, **kwargs: Any) -> None:
        self.updates.append({"run_id": run_id, **kwargs})


class _CapturingLLM:
    def __init__(self, response: str = _generic_cir_json()) -> None:
        self.response = response
        self.calls: list[dict[str, str]] = []

    async def complete(self, system: str, user: str) -> str:
        self.calls.append({"system": system, "user": user})
        return self.response


class _FailingLLM:
    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        raise AssertionError("LLM must not be called")


class _StaticRouter:
    def __init__(self, route: SkillRouteMatch | None | Exception) -> None:
        self._route = route
        self.model_name = "router-test"
        self.calls = 0

    async def route(self, **_: Any) -> SkillRouteMatch | None:
        self.calls += 1
        if isinstance(self._route, Exception):
            raise self._route
        return self._route


class _Agent:
    def __init__(self) -> None:
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
        raise AssertionError("agent must not be called for deterministic route")


def _solid_route() -> SkillRouteMatch:
    return SkillRouteMatch(
        skill_id="solid_geometry",
        domain="math",
        confidence=0.95,
        capability_id="regular_quad_pyramid.line_plane_angle",
        problem_spec={
            "body": "regular_quad_pyramid",
            "dimensions": {"base": "2", "height": "3"},
            "query": {
                "kind": "line_plane_angle",
                "line": {"through": ["S", "A"]},
                "plane": {"through": ["A", "B", "C"]},
            },
        },
    )


@pytest.mark.asyncio
async def test_agent_mode_routes_solid_geometry_before_agent() -> None:
    repo = _RecordingRepo()
    agent = _Agent()
    use_case = RunPipelineUseCase(
        repo,
        _FailingLLM(),
        agent_provider=agent,
        generation_mode="agent",
        router_provider=_StaticRouter(_solid_route()),
    )

    await use_case.execute("run-solid-agent", PipelineRequest(prompt="换一种问法，但 spec 已结构化"))

    assert agent.calls == []
    last = repo.updates[-1]
    assert last["status"] == PipelineRunStatus.SUCCEEDED
    playbook = json.loads(last["playbook_json"])
    assert playbook["steps"][0]["snapshot"]["kind"] == "solid_geometry_scene"


@pytest.mark.asyncio
async def test_agent_mode_heuristic_solid_geometry_before_agent_without_router() -> None:
    repo = _RecordingRepo()
    agent = _Agent()
    use_case = RunPipelineUseCase(
        repo,
        _FailingLLM(),
        agent_provider=agent,
        generation_mode="agent",
    )

    await use_case.execute(
        "run-solid-agent-heuristic",
        PipelineRequest(prompt="正四棱锥 S-ABCD，底面边长为 2，高为 3，求 SA 与底面 ABCD 的线面角"),
    )

    assert agent.calls == []
    assert repo.updates[-1]["status"] == PipelineRunStatus.SUCCEEDED
    playbook = json.loads(repo.updates[-1]["playbook_json"])
    assert playbook["steps"][0]["snapshot"]["kind"] == "solid_geometry_scene"


@pytest.mark.asyncio
async def test_router_failure_falls_back_to_heuristic_without_crashing() -> None:
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _FailingLLM(),
        router_provider=_StaticRouter(ValueError("bad router json")),
    )

    await use_case.execute(
        "run-fallback",
        PipelineRequest(prompt="长方体长 2 宽 3 高 4，求体积"),
    )

    assert repo.updates[-1]["status"] == PipelineRunStatus.SUCCEEDED
    review = json.loads(repo.updates[-1]["review_json"])
    assert "skill:solid_geometry" in review["actions"]


@pytest.mark.asyncio
async def test_low_confidence_router_falls_back_to_generic_cir() -> None:
    route = SkillRouteMatch(
        skill_id="solid_geometry",
        domain="math",
        confidence=0.31,
        reason="too ambiguous",
        needs_refinement=True,
    )
    llm = _CapturingLLM()
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(repo, llm, router_provider=_StaticRouter(route))

    await use_case.execute("run-low", PipelineRequest(prompt="some unrelated vague idea"))

    assert llm.calls
    assert repo.updates[-1]["status"] == PipelineRunStatus.SUCCEEDED
    review = json.loads(repo.updates[-1]["review_json"])
    assert "skill:solid_geometry" not in review["actions"]


@pytest.mark.asyncio
async def test_route_metadata_is_persisted_for_generic_cir() -> None:
    llm = _CapturingLLM(
        json.dumps({
            "version": "0.1.0",
            "title": "PDF",
            "domain": "math",
            "summary": "Explain a density function.",
            "steps": [
                {
                    "id": "step_01",
                    "title": "Read the normalization",
                    "narration": "A density integrates to one because total probability is one.",
                    "visual_kind": "formula",
                    "tokens": [],
                    "plot": {"formula_latex": "\\\\int f(x)\\\\,dx=1"},
                    "annotations": ["Total probability is normalized."],
                }
            ],
        })
    )
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(repo, llm, router_provider=_StaticRouter(None))

    await use_case.execute("run-meta", PipelineRequest(prompt="解释概率密度函数为什么面积等于 1"))

    review = json.loads(repo.updates[-1]["review_json"])
    assert "router:destination:generic_cir" in review["actions"]
    assert "generator:generic_cir" in review["actions"]
    assert "The router classified this request as:" in llm.calls[0]["system"]
