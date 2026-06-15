from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import PlaybookScript
from app.domain.models.topic import TopicDomain
from app.domain.skills.base import SkillExecutionContext, SkillRouteInput
from app.domain.skills.probability_statistics_core.manifest import (
    PROBABILITY_STATISTICS_CORE_MANIFEST,
)
from app.domain.skills.probability_statistics_core.skill_pack import (
    ProbabilityStatisticsCoreSkillPack,
)
from app.domain.skills.probability_statistics_core.statistics_kernel import (
    solve_probability_statistics,
)
from app.domain.skills.registry import SkillRegistry

_ALLOWED_SNAPSHOTS = {"table_scene", "stats_chart_scene", "math_formula"}


class _RecordingRepo:
    def __init__(self) -> None:
        self.updates: list[dict[str, Any]] = []

    async def update(self, run_id: str, **kwargs: Any) -> None:
        self.updates.append({"run_id": run_id, **kwargs})

    @property
    def final_status(self) -> PipelineRunStatus:
        return self.updates[-1]["status"]


class _FailingLLM:
    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        raise AssertionError("LLM must not be called for deterministic statistics prompts")


def test_probability_statistics_manifest_is_valid() -> None:
    payload = PROBABILITY_STATISTICS_CORE_MANIFEST.model_dump(mode="json")

    assert payload["skill_id"] == "probability_statistics_core"
    assert payload["domain"] == "math"
    assert payload["execution_mode"] == "deterministic"
    assert {
        capability["capability_id"] for capability in payload["capabilities"]
    } == {
        "probability_statistics_core.descriptive_statistics",
        "probability_statistics_core.probability_union",
        "probability_statistics_core.conditional_probability",
        "probability_statistics_core.contingency_table",
        "probability_statistics_core.binomial_probability",
        "probability_statistics_core.z_score_normal_cdf",
    }
    assert {
        capability["output_schema"] for capability in payload["capabilities"]
    } == {"ProbabilityStatisticsProblemSpec"}


def test_heuristic_match_creates_spec_without_answer_fields() -> None:
    skill = ProbabilityStatisticsCoreSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="总体数据 [2,4,4,4,5,5,7,9]，求均值、中位数、众数和极差")
    )

    assert match is not None
    assert match.skill_id == "probability_statistics_core"
    assert match.capability_id == "probability_statistics_core.descriptive_statistics"
    assert match.problem_spec is not None
    assert "answer" not in json.dumps(match.problem_spec)
    assert "solution" not in json.dumps(match.problem_spec)


def test_problem_spec_validation_accepts_heuristic_draft() -> None:
    skill = ProbabilityStatisticsCoreSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="二项分布 n=5, p=0.2, k=2，求概率")
    )

    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)

    assert spec is not None
    assert spec.kind == "binomial_probability"
    assert spec.parameters["n"] == Decimal("5")


def test_descriptive_statistics_kernel_population_dataset() -> None:
    skill = ProbabilityStatisticsCoreSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="总体数据 [2,4,4,4,5,5,7,9]，求均值、中位数、众数和极差")
    )
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_probability_statistics(spec)

    assert solution.results["mean"] == Decimal("5")
    assert solution.results["median"] == Decimal("4.5")
    assert solution.results["mode"] == Decimal("4")
    assert solution.results["range"] == Decimal("7")


def test_probability_rules_binomial_and_normal_kernel_paths() -> None:
    skill = ProbabilityStatisticsCoreSkillPack()

    union_match = skill.heuristic_match(
        SkillRouteInput(prompt="P(A)=0.6, P(B)=0.5, P(A∩B)=0.2，求 P(A∪B)")
    )
    assert union_match is not None and union_match.problem_spec is not None
    union_spec = skill.validate_problem_spec(union_match.problem_spec)
    assert union_spec is not None
    union_solution = solve_probability_statistics(union_spec)
    assert union_solution.results["P(A∪B)"] == Decimal("0.9")

    binomial_match = skill.heuristic_match(
        SkillRouteInput(prompt="二项分布 n=5, p=0.2, k=2，求概率")
    )
    assert binomial_match is not None and binomial_match.problem_spec is not None
    binomial_spec = skill.validate_problem_spec(binomial_match.problem_spec)
    assert binomial_spec is not None
    binomial_solution = solve_probability_statistics(binomial_spec)
    assert binomial_solution.results["P(X=2)"] == Decimal("0.2048")

    normal_match = skill.heuristic_match(
        SkillRouteInput(prompt="正态分布 x=85, μ=70, σ=10，求 z-score 和 P(X≤85)")
    )
    assert normal_match is not None and normal_match.problem_spec is not None
    normal_spec = skill.validate_problem_spec(normal_match.problem_spec)
    assert normal_spec is not None
    normal_solution = solve_probability_statistics(normal_spec)
    assert normal_solution.results["z"] == Decimal("1.5")
    assert normal_solution.results["Φ(z)"] == Decimal("0.9332")


@pytest.mark.asyncio
async def test_labelled_contingency_table_falls_back_without_raising() -> None:
    skill = ProbabilityStatisticsCoreSkillPack()
    prompt = "列联表 [['A','B'],[30,10]]，求行列合计"

    route_match = SkillRegistry([skill]).heuristic_match(SkillRouteInput(prompt=prompt))
    assert route_match is None or route_match.skill_id == "probability_statistics_core"

    result = await skill.execute(
        SkillExecutionContext(
            run_id="run-labelled-contingency",
            prompt=prompt,
            route_match=route_match,
        ),
        None,
    )

    assert result.handled is False
    assert result.fallback_reason


@pytest.mark.asyncio
async def test_binomial_decimal_trial_counts_fall_back() -> None:
    skill = ProbabilityStatisticsCoreSkillPack()
    prompt = "二项分布 n=5.5, p=0.2, k=2.2，求概率"

    route_match = SkillRegistry([skill]).heuristic_match(SkillRouteInput(prompt=prompt))
    assert route_match is None or route_match.skill_id == "probability_statistics_core"

    result = await skill.execute(
        SkillExecutionContext(
            run_id="run-decimal-binomial",
            prompt=prompt,
            route_match=route_match,
        ),
        None,
    )

    assert result.handled is False
    assert result.fallback_reason


@pytest.mark.asyncio
async def test_inconsistent_probability_union_falls_back() -> None:
    skill = ProbabilityStatisticsCoreSkillPack()
    prompt = "P(A)=0.9, P(B)=0.8, P(A∩B)=0.1，求 P(A∪B)"

    route_match = SkillRegistry([skill]).heuristic_match(SkillRouteInput(prompt=prompt))
    assert route_match is None or route_match.skill_id == "probability_statistics_core"

    result = await skill.execute(
        SkillExecutionContext(
            run_id="run-invalid-union",
            prompt=prompt,
            route_match=route_match,
        ),
        None,
    )

    assert result.handled is False
    assert result.fallback_reason


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "prompt",
    [
        "P(A∩B)=0.8, P(B)=0.4，求 P(A|B)",
        "P(A∩B)=-0.1, P(B)=0.4，求 P(A|B)",
        "P(A∩B)=0.1, P(B)=-0.4，求 P(A|B)",
    ],
)
async def test_impossible_conditional_probability_falls_back(prompt: str) -> None:
    skill = ProbabilityStatisticsCoreSkillPack()

    route_match = SkillRegistry([skill]).heuristic_match(SkillRouteInput(prompt=prompt))
    assert route_match is None or route_match.skill_id == "probability_statistics_core"

    result = await skill.execute(
        SkillExecutionContext(
            run_id="run-invalid-conditional",
            prompt=prompt,
            route_match=route_match,
        ),
        None,
    )

    assert result.handled is False
    assert result.fallback_reason


@pytest.mark.asyncio
async def test_unsupported_statistics_falls_back_with_reason() -> None:
    skill = ProbabilityStatisticsCoreSkillPack()
    prompt = "对数据 [1,2,3,4] 做回归分析并检验假设"
    result = await skill.execute(
        SkillExecutionContext(run_id="run-regression", prompt=prompt, route_match=None),
        None,
    )

    assert result.handled is False
    assert result.fallback_reason is not None


@pytest.mark.asyncio
async def test_execute_outputs_valid_playbook_with_allowed_snapshots() -> None:
    skill = ProbabilityStatisticsCoreSkillPack()
    prompt = "总体数据 [2,4,4,4,5,5,7,9]，求均值、中位数、众数和极差"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    result = await skill.execute(
        SkillExecutionContext(run_id="run-stats", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is True
    assert result.playbook_json is not None
    playbook = PlaybookScript.model_validate_json(result.playbook_json)
    kinds = {step.snapshot.kind for step in playbook.steps}
    assert playbook.domain == TopicDomain.MATH
    assert kinds <= _ALLOWED_SNAPSHOTS
    assert {"table_scene", "stats_chart_scene", "math_formula"} <= kinds
    assert all(step.layers for step in playbook.steps)


@pytest.mark.asyncio
async def test_probability_statistics_pipeline_path_does_not_call_llm() -> None:
    registry = SkillRegistry([ProbabilityStatisticsCoreSkillPack()])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(repo, _FailingLLM(), skill_registry=registry)

    await use_case.execute(
        "run-statistics-pipeline",
        PipelineRequest(prompt="二项分布 n=5, p=0.2, k=2，求概率"),
    )

    assert repo.final_status == PipelineRunStatus.SUCCEEDED
    playbook = json.loads(repo.updates[-1]["playbook_json"])
    assert playbook["domain"] == "math"
    assert any(step["snapshot"]["kind"] == "stats_chart_scene" for step in playbook["steps"])
