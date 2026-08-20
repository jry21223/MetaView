from __future__ import annotations

import json
from typing import Any

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.skills.base import SkillRouteInput, SkillRouteMatch
from tests.coverage_test_utils import ComposableCoverageResolver

_SOLID_PROMPT = (
    "正四棱锥 S-ABCD，底面边长为 2，高为 3，求 SA 与底面 ABCD 的线面角"
)


def _generic_cir_json(domain: str = "algorithm") -> str:
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
        self.last_request: SkillRouteInput | None = None

    async def route(self, *, request: SkillRouteInput, **_: Any) -> SkillRouteMatch | None:
        self.calls += 1
        self.last_request = request
        if isinstance(self._route, Exception):
            raise self._route
        return self._route


@pytest.mark.asyncio
async def test_text_request_does_not_send_a_false_python_signal_to_router() -> None:
    router = _StaticRouter(None)
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _CapturingLLM(_generic_cir_json("math")),
        router_provider=router,
        coverage_resolver=ComposableCoverageResolver(default_domain="math"),
    )

    await use_case.execute(
        "run-null-language",
        PipelineRequest(prompt="请解释这个数学概念"),
    )

    assert router.last_request is not None
    assert router.last_request.source_code is None
    assert router.last_request.language is None


@pytest.mark.asyncio
async def test_high_confidence_binary_search_heuristic_skips_model_router() -> None:
    wrong_route = SkillRouteMatch(
        skill_id="probability_statistics_core",
        domain="math",
        confidence=0.99,
        capability_id="probability_statistics_core.descriptive_statistics",
        problem_spec={
            "kind": "descriptive_statistics",
            "data": ["1", "3", "5", "7", "9", "11"],
        },
    )
    router = _StaticRouter(wrong_route)
    agent = _Agent()
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _FailingLLM(),
        generation_mode="agent",
        agent_provider=agent,
        router_provider=router,
        router_mode="hybrid",
    )

    await use_case.execute(
        "run-binary-search-router",
        PipelineRequest(
            prompt="演示在有序数组 [1,3,5,7,9,11] 里二分查找 7，标出 low/mid/high"
        ),
    )

    assert router.calls == 0
    assert agent.calls == []
    assert repo.updates[-1]["status"] == PipelineRunStatus.SUCCEEDED


@pytest.mark.asyncio
async def test_custom_comparator_binary_search_fails_closed() -> None:
    agent = _Agent()
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _FailingLLM(),
        generation_mode="agent",
        agent_provider=agent,
        router_mode="heuristic",
    )

    await use_case.execute(
        "run-binary-search-custom-comparator",
        PipelineRequest(
            prompt=(
                "在有序数组 [1,3,5,7] 中使用自定义比较函数 compare "
                "二分查找 7"
            )
        ),
    )

    assert agent.calls == []
    assert repo.updates[-1]["status"] == PipelineRunStatus.FAILED


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

    await use_case.execute("run-solid-agent", PipelineRequest(prompt=_SOLID_PROMPT))

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
        PipelineRequest(prompt=_SOLID_PROMPT),
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
async def test_low_confidence_router_without_domain_is_rejected() -> None:
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

    assert llm.calls == []
    assert repo.updates[-1]["status"] == PipelineRunStatus.FAILED
    review = json.loads(repo.updates[-1]["review_json"])
    assert review["issues"][0]["code"] == "capability.unsupported"


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
    use_case = RunPipelineUseCase(
        repo,
        llm,
        router_provider=_StaticRouter(None),
        coverage_resolver=ComposableCoverageResolver(default_domain="math"),
    )

    await use_case.execute("run-meta", PipelineRequest(prompt="解释概率密度函数为什么面积等于 1"))

    review = json.loads(repo.updates[-1]["review_json"])
    assert "router:destination:generic_cir" in review["actions"]
    assert "generator:generic_cir" in review["actions"]
    assert "The router classified this request as:" in llm.calls[0]["system"]
