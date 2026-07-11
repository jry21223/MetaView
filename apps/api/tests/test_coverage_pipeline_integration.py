from __future__ import annotations

import json
from typing import Any, Literal

import pytest
from pydantic import BaseModel

from app.application.agent.types import AgentRequest
from app.application.dto.pipeline_dto import PipelineRequest
from app.application.ports.agent_provider import AgentProviderError
from app.application.services.lesson_planner import build_rule_based_lesson_plan
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.models.coverage import CoverageDecision, CoverageMode
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.skills.base import (
    SkillCapability,
    SkillExecutionContext,
    SkillExecutionResult,
    SkillManifest,
    SkillRouteInput,
    SkillRouteMatch,
)
from app.domain.skills.registry import SkillRegistry


class _RecordingRepo:
    def __init__(self, events: list[str]) -> None:
        self.events = events
        self.updates: list[dict[str, Any]] = []
        self.coverage_decisions: list[dict[str, Any]] = []
        self.lesson_plans: list[dict[str, Any]] = []
        self.quality_reports: list[dict[str, Any]] = []

    async def update(self, run_id: str, **kwargs: Any) -> None:
        self.events.append(f"update:{kwargs['status'].value}")
        self.updates.append({"run_id": run_id, **kwargs})

    async def update_coverage_decision(
        self,
        run_id: str,
        coverage_decision_json: str,
    ) -> None:
        self.events.append("coverage")
        self.coverage_decisions.append(
            {"run_id": run_id, "decision": json.loads(coverage_decision_json)}
        )

    async def update_lesson_plan(self, run_id: str, lesson_plan_json: str) -> None:
        self.events.append("lesson_persisted")
        self.lesson_plans.append(
            {"run_id": run_id, "lesson_plan": json.loads(lesson_plan_json)}
        )

    async def update_quality_report(self, run_id: str, quality_report_json: str) -> None:
        self.events.append("quality")
        self.quality_reports.append(
            {"run_id": run_id, "report": json.loads(quality_report_json)}
        )


class _FixedCoverageResolver:
    def __init__(self, decision: CoverageDecision) -> None:
        self.decision = decision
        self.calls: list[dict[str, Any]] = []

    def resolve(self, **kwargs: Any) -> CoverageDecision:
        self.calls.append(kwargs)
        return self.decision


class _RecordingLessonPlanner:
    def __init__(self, events: list[str]) -> None:
        self.events = events
        self.calls: list[dict[str, Any]] = []

    async def plan(self, **kwargs: Any):
        self.events.append("planner")
        self.calls.append(kwargs)
        return build_rule_based_lesson_plan(
            prompt=kwargs["prompt"],
            domain=kwargs.get("domain"),
        )


class _ForbiddenLessonPlanner:
    async def plan(self, **kwargs: Any):  # noqa: ARG002
        raise AssertionError("blocked coverage must stop before LessonPlanner")


class _RecordingFailingLLM:
    def __init__(self, events: list[str]) -> None:
        self.events = events
        self.calls = 0

    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        self.events.append("single_provider")
        self.calls += 1
        raise RuntimeError("single provider fixture stopped after route verification")


class _RecordingFailingAgent:
    def __init__(self, events: list[str]) -> None:
        self.events = events
        self.requests: list[AgentRequest] = []

    async def run(self, request: AgentRequest):
        self.events.append("agent_provider")
        self.requests.append(request)
        raise AgentProviderError("agent fixture stopped after request verification")


class _ForbiddenLLM:
    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        raise AssertionError("blocked coverage must stop before the single provider")


class _ForbiddenAgent:
    async def run(self, request: AgentRequest):  # noqa: ARG002
        raise AssertionError("blocked coverage must stop before the agent provider")


class _FixedRouter:
    model_name = "fixed-router"

    def __init__(self, match: SkillRouteMatch) -> None:
        self.match = match

    async def route(self, **kwargs: Any) -> SkillRouteMatch:  # noqa: ARG002
        return self.match


class _FakeSpec(BaseModel):
    value: str


class _RecordingSkill:
    manifest = SkillManifest(
        skill_id="coverage_test_skill",
        domain="algorithm",
        name="Coverage integration fixture",
        description="Records whether the pipeline attempted deterministic execution.",
        execution_mode="deterministic",
        capabilities=[
            SkillCapability(
                capability_id="coverage.test",
                description="Coverage phase pipeline integration fixture.",
                examples=["fixture"],
            )
        ],
    )

    def __init__(self) -> None:
        self.executions: list[SkillExecutionContext] = []

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch:  # noqa: ARG002
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.99,
            capability_id="coverage.test",
            problem_spec={"value": "fixture"},
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> _FakeSpec:
        return _FakeSpec.model_validate(data)

    async def execute(
        self,
        context: SkillExecutionContext,
        problem_spec: BaseModel | None,
    ) -> SkillExecutionResult:
        assert isinstance(problem_spec, _FakeSpec)
        self.executions.append(context)
        # The fixture deliberately declines the request so the test can also
        # prove that the existing agent/single fallback remains reachable.
        return SkillExecutionResult(handled=False, fallback_reason="test-decline")


def _decision(mode: CoverageMode) -> CoverageDecision:
    if mode == "specialized":
        return CoverageDecision(
            mode=mode,
            domain="algorithm",
            confidence=0.99,
            matched_skill_ids=["coverage_test_skill"],
            available_tool_ids=["playbook.schema.validate"],
            missing_capabilities=[],
            fallback_policy="use_skill",
            reason="A validated deterministic SkillPack is available.",
        )
    if mode == "composable":
        return CoverageDecision(
            mode=mode,
            domain="algorithm",
            confidence=0.88,
            matched_skill_ids=[],
            available_tool_ids=["playbook.schema.validate"],
            missing_capabilities=[],
            fallback_policy="compose",
            reason="Canonical tools can compose this request.",
        )
    if mode == "experimental":
        return CoverageDecision(
            mode=mode,
            domain="algorithm",
            confidence=0.62,
            matched_skill_ids=[],
            available_tool_ids=["playbook.schema.validate"],
            missing_capabilities=["controlled_composition:algorithm"],
            fallback_policy="limited_visual",
            reason="The request can continue only with limited visual guarantees.",
        )
    return CoverageDecision(
        mode=mode,
        domain="algorithm",
        confidence=0.25,
        matched_skill_ids=[],
        available_tool_ids=["playbook.schema.validate"],
        missing_capabilities=["verified_knowledge:fixture"],
        fallback_policy="reject",
        reason="The request cannot be verified reliably.",
    )


def _quality_issue_codes(repo: _RecordingRepo) -> set[str]:
    return {
        issue["code"]
        for issue in repo.quality_reports[-1]["report"]["issues"]
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("generation_mode", "coverage_mode", "provider_event"),
    [
        ("agent", "composable", "agent_provider"),
        ("single", "composable", "single_provider"),
    ],
)
async def test_coverage_is_persisted_before_planner_and_provider(
    generation_mode: Literal["agent", "single"],
    coverage_mode: CoverageMode,
    provider_event: str,
) -> None:
    events: list[str] = []
    repo = _RecordingRepo(events)
    planner = _RecordingLessonPlanner(events)
    llm = _RecordingFailingLLM(events)
    agent = _RecordingFailingAgent(events)
    decision = _decision(coverage_mode)
    use_case = RunPipelineUseCase(
        repo,
        llm,
        agent_provider=agent,
        generation_mode=generation_mode,
        reviewer_mode="off",
        router_mode="off",
        skill_registry=SkillRegistry([]),
        lesson_planner=planner,
        coverage_resolver=_FixedCoverageResolver(decision),
    )

    await use_case.execute(
        f"run-{generation_mode}",
        PipelineRequest(prompt="coverage integration fixture", domain="algorithm"),
    )

    assert events.index("coverage") < events.index("planner") < events.index(provider_event)
    assert repo.coverage_decisions[0]["decision"] == decision.model_dump(mode="json")
    assert repo.lesson_plans
    assert repo.quality_reports[-1]["report"]["coverage_mode"] == coverage_mode
    assert repo.updates[-1]["status"] == PipelineRunStatus.FAILED
    if generation_mode == "agent":
        assert agent.requests[0].coverage_decision == decision
    else:
        assert llm.calls == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("generation_mode", ["agent", "single"])
async def test_unsupported_coverage_fails_before_planner_or_provider(
    generation_mode: Literal["agent", "single"],
) -> None:
    events: list[str] = []
    repo = _RecordingRepo(events)
    decision = _decision("unsupported")
    use_case = RunPipelineUseCase(
        repo,
        _ForbiddenLLM(),
        agent_provider=_ForbiddenAgent(),
        generation_mode=generation_mode,
        reviewer_mode="off",
        router_mode="off",
        skill_registry=SkillRegistry([]),
        lesson_planner=_ForbiddenLessonPlanner(),
        coverage_resolver=_FixedCoverageResolver(decision),
    )

    await use_case.execute(
        f"run-unsupported-{generation_mode}",
        PipelineRequest(prompt="unsupported coverage fixture", domain="algorithm"),
    )

    assert events.index("coverage") < events.index("quality")
    assert "planner" not in events
    assert "agent_provider" not in events
    assert "single_provider" not in events
    assert repo.lesson_plans == []
    assert repo.updates[-1]["status"] == PipelineRunStatus.FAILED
    report = repo.quality_reports[-1]["report"]
    assert report["status"] == "blocked"
    assert report["generator_path"] == "capability_resolution"
    assert report["coverage_mode"] == "unsupported"
    assert "capability.unsupported" in _quality_issue_codes(repo)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("generation_mode", "fallback_policy", "expected_code"),
    [
        ("agent", "text_only", "capability.text_only_required"),
        ("single", "limited_visual", "capability.limited_visual_unavailable"),
    ],
)
async def test_experimental_coverage_fails_before_planner_or_provider(
    generation_mode: Literal["agent", "single"],
    fallback_policy: Literal["text_only", "limited_visual"],
    expected_code: str,
) -> None:
    events: list[str] = []
    repo = _RecordingRepo(events)
    decision = _decision("experimental").model_copy(
        update={"fallback_policy": fallback_policy}
    )
    use_case = RunPipelineUseCase(
        repo,
        _ForbiddenLLM(),
        agent_provider=_ForbiddenAgent(),
        generation_mode=generation_mode,
        reviewer_mode="off",
        router_mode="off",
        skill_registry=SkillRegistry([]),
        lesson_planner=_ForbiddenLessonPlanner(),
        coverage_resolver=_FixedCoverageResolver(decision),
    )

    await use_case.execute(
        f"run-experimental-{generation_mode}",
        PipelineRequest(prompt="experimental coverage fixture", domain="algorithm"),
    )

    assert events.index("coverage") < events.index("quality")
    assert "planner" not in events
    assert "agent_provider" not in events
    assert "single_provider" not in events
    assert repo.lesson_plans == []
    assert repo.updates[-1]["status"] == PipelineRunStatus.FAILED
    report = repo.quality_reports[-1]["report"]
    assert report["status"] == "blocked"
    assert report["generator_path"] == "capability_resolution"
    assert report["coverage_mode"] == "experimental"
    assert expected_code in _quality_issue_codes(repo)


@pytest.mark.asyncio
async def test_unsupported_skill_assumption_never_reaches_generic_provider() -> None:
    events: list[str] = []
    repo = _RecordingRepo(events)
    llm = _RecordingFailingLLM(events)
    use_case = RunPipelineUseCase(
        repo,
        llm,
        reviewer_mode="off",
        router_mode="heuristic",
        lesson_planner=_ForbiddenLessonPlanner(),
    )

    await use_case.execute(
        "run-unsupported-friction",
        PipelineRequest(
            prompt="质量 2kg 的物体受到 10N 水平拉力，摩擦系数 0.2，求加速度"
        ),
    )

    assert llm.calls == 0
    assert "single_provider" not in events
    assert repo.updates[-1]["status"] == PipelineRunStatus.FAILED
    assert repo.coverage_decisions[-1]["decision"]["mode"] == "unsupported"
    assert "capability.unsupported" in _quality_issue_codes(repo)


@pytest.mark.asyncio
@pytest.mark.parametrize("generation_mode", ["agent", "single"])
@pytest.mark.parametrize(
    ("coverage_mode", "expected_skill_executions"),
    [
        ("specialized", 1),
        ("composable", 0),
    ],
)
async def test_only_specialized_coverage_attempts_the_matched_skill(
    generation_mode: Literal["agent", "single"],
    coverage_mode: CoverageMode,
    expected_skill_executions: int,
) -> None:
    events: list[str] = []
    repo = _RecordingRepo(events)
    planner = _RecordingLessonPlanner(events)
    llm = _RecordingFailingLLM(events)
    agent = _RecordingFailingAgent(events)
    skill = _RecordingSkill()
    match = SkillRouteMatch(
        skill_id=skill.manifest.skill_id,
        domain=skill.manifest.domain,
        confidence=0.99,
        capability_id="coverage.test",
        problem_spec={"value": "fixture"},
    )
    use_case = RunPipelineUseCase(
        repo,
        llm,
        agent_provider=agent,
        generation_mode=generation_mode,
        reviewer_mode="off",
        router_provider=_FixedRouter(match),
        router_mode="llm",
        skill_registry=SkillRegistry([skill]),
        lesson_planner=planner,
        coverage_resolver=_FixedCoverageResolver(_decision(coverage_mode)),
    )

    await use_case.execute(
        f"run-gate-{generation_mode}-{coverage_mode}",
        PipelineRequest(prompt="fixed routed fixture", domain="algorithm"),
    )

    assert len(skill.executions) == expected_skill_executions
    provider_event = "agent_provider" if generation_mode == "agent" else "single_provider"
    if coverage_mode == "specialized":
        assert provider_event not in events
        assert repo.updates[-1]["status"] == PipelineRunStatus.FAILED
        assert "skill.execution_unhandled" in _quality_issue_codes(repo)
        assert repo.quality_reports[-1]["report"]["generator_path"] == "skill_pack"
    else:
        assert provider_event in events
    assert repo.quality_reports[-1]["report"]["coverage_mode"] == coverage_mode
