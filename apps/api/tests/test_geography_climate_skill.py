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
from app.domain.skills.geography_climate.climate_kernel import solve_climate_problem
from app.domain.skills.geography_climate.manifest import GEOGRAPHY_CLIMATE_MANIFEST
from app.domain.skills.geography_climate.skill_pack import GeographyClimateSkillPack
from app.domain.skills.registry import SkillRegistry

_ALLOWED_SNAPSHOTS = {
    "table_scene",
    "stats_chart_scene",
    "math_formula",
    "modeling_scene",
}


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
        raise AssertionError("LLM must not be called for deterministic climate prompts")


def test_geography_climate_manifest_is_valid() -> None:
    payload = GEOGRAPHY_CLIMATE_MANIFEST.model_dump(mode="json")

    assert payload["skill_id"] == "geography_climate"
    assert payload["domain"] == "geography"
    assert payload["execution_mode"] == "deterministic"
    assert {
        capability["capability_id"] for capability in payload["capabilities"]
    } == {
        "geography_climate.station_normals_summary",
        "geography_climate.annual_temperature_mean",
        "geography_climate.annual_precipitation_total",
        "geography_climate.warmest_coldest_month",
        "geography_climate.wettest_driest_month",
        "geography_climate.station_comparison",
        "geography_climate.anomaly_from_normal",
    }
    assert {
        capability["output_schema"] for capability in payload["capabilities"]
    } == {"GeographyClimateProblemSpec"}


def test_heuristic_match_creates_spec_without_answer_fields() -> None:
    skill = GeographyClimateSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="离线教学站点 EDU_TEMPERATE 的气候常年值摘要")
    )

    assert match is not None
    assert match.skill_id == "geography_climate"
    assert match.capability_id == "geography_climate.station_normals_summary"
    assert match.problem_spec is not None
    assert "answer" not in json.dumps(match.problem_spec)
    assert "solution" not in json.dumps(match.problem_spec)


def test_problem_spec_validation_accepts_heuristic_draft() -> None:
    skill = GeographyClimateSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="比较 EDU_TEMPERATE 和 EDU_ARID 的年均温和年降水")
    )

    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)

    assert spec is not None
    assert spec.kind == "station_comparison"
    assert spec.station_ids == ["EDU_TEMPERATE", "EDU_ARID"]


def test_climate_fixture_summary_kernel_outputs_month_extremes() -> None:
    skill = GeographyClimateSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="离线教学站点 EDU_TEMPERATE 的气候常年值摘要")
    )
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_climate_problem(spec)

    assert solution.metrics["annual_temp_mean_c"] == Decimal("12")
    assert solution.metrics["annual_precip_total_mm"] == Decimal("750")
    assert solution.extremes["warmest_month"] == "7月"
    assert solution.extremes["coldest_month"] == "1月"
    assert solution.extremes["wettest_month"] == "7月"
    assert solution.extremes["driest_month"] == "2月"
    assert "offline educational normal" in solution.station_labels[0]


def test_climate_anomaly_kernel_uses_inline_observed_value() -> None:
    skill = GeographyClimateSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="EDU_TEMPERATE 7月观测气温 28C，求距平")
    )
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_climate_problem(spec)

    assert solution.metrics["anomaly_c"] == Decimal("3")


def test_solid_geometry_prompt_does_not_match_geography_climate() -> None:
    skill = GeographyClimateSkillPack()
    prompt = "正四棱锥 S-ABCD，底面边长为 2，高为 3，求 SA 与底面 ABCD 的线面角"

    assert skill.heuristic_match(SkillRouteInput(prompt=prompt)) is None
    assert SkillRegistry([skill]).heuristic_match(SkillRouteInput(prompt=prompt)) is None


@pytest.mark.asyncio
async def test_incomplete_anomaly_prompt_falls_back_without_raising() -> None:
    skill = GeographyClimateSkillPack()
    prompt = "EDU_TEMPERATE 7月求距平"

    route_match = SkillRegistry([skill]).heuristic_match(SkillRouteInput(prompt=prompt))
    assert route_match is None or route_match.skill_id == "geography_climate"

    result = await skill.execute(
        SkillExecutionContext(run_id="run-missing-anomaly", prompt=prompt, route_match=None),
        None,
    )

    assert result.handled is False
    assert result.fallback_reason


@pytest.mark.asyncio
async def test_unknown_station_falls_back_with_reason() -> None:
    skill = GeographyClimateSkillPack()
    prompt = "查询 UNKNOWN_STATION 的气候常年值摘要"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None
    spec = skill.validate_problem_spec(match.problem_spec or {})

    result = await skill.execute(
        SkillExecutionContext(run_id="run-unknown", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is False
    assert result.fallback_reason is not None


@pytest.mark.asyncio
async def test_execute_outputs_valid_playbook_with_allowed_snapshots() -> None:
    skill = GeographyClimateSkillPack()
    prompt = "离线教学站点 EDU_TEMPERATE 的气候常年值摘要"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    result = await skill.execute(
        SkillExecutionContext(run_id="run-climate", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is True
    assert result.playbook_json is not None
    playbook = PlaybookScript.model_validate_json(result.playbook_json)
    kinds = {step.snapshot.kind for step in playbook.steps}
    assert playbook.domain == TopicDomain.GEOGRAPHY
    assert kinds <= _ALLOWED_SNAPSHOTS
    assert {"table_scene", "stats_chart_scene", "math_formula"} <= kinds
    assert all(step.layers for step in playbook.steps)


@pytest.mark.asyncio
async def test_geography_climate_pipeline_path_does_not_call_llm() -> None:
    registry = SkillRegistry([GeographyClimateSkillPack()])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(repo, _FailingLLM(), skill_registry=registry)

    await use_case.execute(
        "run-climate-pipeline",
        PipelineRequest(prompt="离线教学站点 EDU_TEMPERATE 的气候常年值摘要"),
    )

    assert repo.final_status == PipelineRunStatus.SUCCEEDED
    playbook = json.loads(repo.updates[-1]["playbook_json"])
    assert playbook["domain"] == "geography"
    assert any(step["snapshot"]["kind"] == "stats_chart_scene" for step in playbook["steps"])
