from __future__ import annotations

import json
from typing import Any

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import PlaybookScript
from app.domain.models.topic import TopicDomain
from app.domain.skills.base import SkillExecutionContext, SkillRouteInput
from app.domain.skills.physics_mechanics.manifest import PHYSICS_MECHANICS_MANIFEST
from app.domain.skills.physics_mechanics.mechanics_kernel import solve_mechanics
from app.domain.skills.physics_mechanics.skill_pack import PhysicsMechanicsSkillPack
from app.domain.skills.registry import SkillRegistry


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
        raise AssertionError("LLM must not be called for deterministic mechanics prompts")


def test_physics_mechanics_manifest_is_valid() -> None:
    payload = PHYSICS_MECHANICS_MANIFEST.model_dump(mode="json")

    assert payload["skill_id"] == "physics_mechanics"
    assert payload["domain"] == "physics"
    assert payload["execution_mode"] == "deterministic"
    assert {capability["capability_id"] for capability in payload["capabilities"]} == {
        "physics_mechanics.uniform_acceleration_1d",
        "physics_mechanics.projectile_motion",
        "physics_mechanics.newton_second_law",
        "physics_mechanics.incline_force",
    }
    assert {capability["output_schema"] for capability in payload["capabilities"]} == {
        "PhysicsMechanicsProblemSpec"
    }


def test_uniform_acceleration_heuristic_extracts_spec_without_answer_fields() -> None:
    skill = PhysicsMechanicsSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(
            prompt="小球从静止开始做匀加速直线运动，加速度 2m/s²，求 5 秒后的速度和位移"
        )
    )

    assert match is not None
    assert match.skill_id == "physics_mechanics"
    assert match.capability_id == "physics_mechanics.uniform_acceleration_1d"
    assert match.problem_spec is not None
    assert "answer" not in json.dumps(match.problem_spec)
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None
    assert spec.kind == "uniform_acceleration_1d"
    assert str(spec.values["acceleration"].value) == "2"
    assert str(spec.values["time"].value) == "5"


def test_mechanics_kernel_solves_uniform_acceleration() -> None:
    skill = PhysicsMechanicsSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="初速度 3m/s，加速度 2m/s²，运动 4 秒，求末速度和位移")
    )
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_mechanics(spec)

    assert solution.values["final_velocity"].display == "11 m/s"
    assert solution.values["displacement"].display == "28 m"
    assert "v=v_0+at" in solution.answer_latex
    assert "s=v_0t+\\frac{1}{2}at^2" in solution.answer_latex


@pytest.mark.asyncio
async def test_execute_outputs_valid_playbook_with_formula_and_table() -> None:
    skill = PhysicsMechanicsSkillPack()
    prompt = "小球从静止开始做匀加速直线运动，加速度 2m/s²，求 5 秒后的速度和位移"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    result = await skill.execute(
        SkillExecutionContext(run_id="run-physics", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is True
    assert "skill:physics_mechanics" in result.review_actions
    assert result.playbook_json is not None
    playbook = PlaybookScript.model_validate_json(result.playbook_json)
    assert playbook.domain == TopicDomain.PHYSICS
    assert 3 <= len(playbook.steps) <= 5
    assert {"math_formula", "table_scene"} <= {step.snapshot.kind for step in playbook.steps}
    assert all(step.layers for step in playbook.steps)
    assert "10 m/s" in result.playbook_json
    assert "25 m" in result.playbook_json


@pytest.mark.asyncio
async def test_projectile_motion_uses_asset_backed_force_scene() -> None:
    skill = PhysicsMechanicsSkillPack()
    prompt = "一个物体以 10m/s 水平抛出，高度 20m，求落地时间和水平位移"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    result = await skill.execute(
        SkillExecutionContext(run_id="run-projectile", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is True
    assert result.playbook_json is not None
    playbook = PlaybookScript.model_validate_json(result.playbook_json)
    force_steps = [step for step in playbook.steps if step.snapshot.kind == "physics_force_scene"]
    assert force_steps
    force_snapshot = force_steps[0].snapshot.model_dump(mode="json")
    assert force_snapshot["pack_id"] == "physics-basic"
    assert all(item.get("asset_id") is None for item in force_snapshot["objects"])


@pytest.mark.asyncio
async def test_incline_with_friction_falls_back() -> None:
    skill = PhysicsMechanicsSkillPack()
    prompt = "斜面倾角 30°，物体质量 1kg，摩擦系数 0.2，求沿斜面下滑的加速度"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    if match is None:
        return

    spec = skill.validate_problem_spec(match.problem_spec or {})
    result = await skill.execute(
        SkillExecutionContext(run_id="run-friction", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is False
    assert result.fallback_reason is not None


@pytest.mark.asyncio
async def test_physics_mechanics_pipeline_path_does_not_call_llm() -> None:
    registry = SkillRegistry([PhysicsMechanicsSkillPack()])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(repo, _FailingLLM(), skill_registry=registry)

    await use_case.execute(
        "run-physics-pipeline",
        PipelineRequest(prompt="质量 2kg 的物体受到 10N 水平拉力，忽略摩擦，求加速度"),
    )

    assert repo.final_status == PipelineRunStatus.SUCCEEDED
    playbook = json.loads(repo.updates[-1]["playbook_json"])
    assert playbook["domain"] == "physics"
    assert any(step["snapshot"]["kind"] == "math_formula" for step in playbook["steps"])
