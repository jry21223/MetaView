from __future__ import annotations

import json
from typing import Any

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.contracts.playbook_contract import SUPPORTED_SNAPSHOT_KIND_SET
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import PlaybookScript
from app.domain.skills.registry import build_default_skill_registry
from eval.benchmark_v2 import score_benchmark_v2
from eval.conic_hidden_cases import load_hidden_conic_manifest


class _RecordingRepo:
    def __init__(self) -> None:
        self.updates: list[dict[str, Any]] = []
        self.quality_reports: list[dict[str, Any]] = []
        self.lesson_plans: list[dict[str, Any]] = []
        self.coverage_decisions: list[dict[str, Any]] = []

    async def update(self, run_id: str, **kwargs: Any) -> None:
        self.updates.append({"run_id": run_id, **kwargs})

    async def update_quality_report(self, run_id: str, quality_report_json: str) -> None:
        self.quality_reports.append({"run_id": run_id, "value": json.loads(quality_report_json)})

    async def update_lesson_plan(self, run_id: str, lesson_plan_json: str) -> None:
        self.lesson_plans.append({"run_id": run_id, "value": json.loads(lesson_plan_json)})

    async def update_coverage_decision(self, run_id: str, coverage_decision_json: str) -> None:
        self.coverage_decisions.append(
            {"run_id": run_id, "value": json.loads(coverage_decision_json)}
        )


class _ForbiddenModelProvider:
    called = False

    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        self.called = True
        raise AssertionError("specialized hidden conic generation must not call the generic LLM")


class _ForbiddenAgentProvider:
    called = False

    async def generate(self, *args: Any, **kwargs: Any) -> dict[str, Any]:  # noqa: ARG002
        self.called = True
        raise AssertionError("deterministic specialized generation must precede model-backed Agent")


@pytest.mark.asyncio
async def test_hidden_ellipse_runs_through_real_agent_pipeline_and_passes_gold() -> None:
    manifest = load_hidden_conic_manifest()
    variant = manifest.variants[0]
    expectation = manifest.benchmark_suite().by_id(variant.case_id)
    repo = _RecordingRepo()
    llm = _ForbiddenModelProvider()
    agent = _ForbiddenAgentProvider()
    use_case = RunPipelineUseCase(
        repo,
        llm,
        generation_mode="agent",
        agent_provider=agent,
        skill_registry=build_default_skill_registry(),
    )

    await use_case.execute("run-hidden-conic-gold", PipelineRequest(prompt=variant.prompt))

    assert repo.updates[-1]["status"] == PipelineRunStatus.SUCCEEDED
    assert repo.coverage_decisions[-1]["value"]["mode"] == "specialized"
    assert repo.lesson_plans[-1]["value"]["domain"] == "math"
    assert repo.quality_reports[-1]["value"]["status"] == "clean"
    assert llm.called is False
    assert agent.called is False

    raw_playbook = repo.updates[-1]["playbook_json"]
    assert isinstance(raw_playbook, str)
    assert "publicGoldTemplates" not in raw_playbook
    assert "buildPublicPlaybook" not in raw_playbook
    script = PlaybookScript.model_validate_json(raw_playbook)
    snapshot_kinds = {step.snapshot.kind for step in script.steps}
    assert snapshot_kinds <= SUPPORTED_SNAPSHOT_KIND_SET

    card = score_benchmark_v2(expectation, raw_playbook, external_warning_count=0)
    assert card.passed, card.to_dict()
    assert card.warning_count == 0
    assert card.hard_failures == []


@pytest.mark.asyncio
async def test_unsupported_hidden_hyperbola_keeps_real_coverage_failure() -> None:
    manifest = load_hidden_conic_manifest()
    variant = next(item for item in manifest.variants if "hyperbola" in item.case_id)
    repo = _RecordingRepo()
    llm = _ForbiddenModelProvider()
    agent = _ForbiddenAgentProvider()
    use_case = RunPipelineUseCase(
        repo,
        llm,
        generation_mode="agent",
        agent_provider=agent,
        skill_registry=build_default_skill_registry(),
    )

    await use_case.execute("run-hidden-conic-unsupported", PipelineRequest(prompt=variant.prompt))

    assert repo.updates[-1]["status"] == PipelineRunStatus.FAILED
    assert "playbook_json" not in repo.updates[-1]
    assert repo.coverage_decisions[-1]["value"]["mode"] in {"experimental", "unsupported"}
    assert repo.quality_reports[-1]["value"]["generator_path"] == "capability_resolution"
    assert llm.called is False
    assert agent.called is False
