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
from app.domain.skills.chemistry_stoichiometry.manifest import (
    CHEMISTRY_STOICHIOMETRY_MANIFEST,
)
from app.domain.skills.chemistry_stoichiometry.skill_pack import (
    ChemistryStoichiometrySkillPack,
)
from app.domain.skills.chemistry_stoichiometry.stoichiometry_kernel import (
    solve_stoichiometry,
)
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
        raise AssertionError("LLM must not be called for deterministic chemistry prompts")


def test_chemistry_stoichiometry_manifest_is_valid() -> None:
    payload = CHEMISTRY_STOICHIOMETRY_MANIFEST.model_dump(mode="json")

    assert payload["skill_id"] == "chemistry_stoichiometry"
    assert payload["domain"] == "chemistry"
    assert payload["execution_mode"] == "deterministic"
    assert {
        capability["capability_id"] for capability in payload["capabilities"]
    } == {
        "chemistry_stoichiometry.balance_equation",
        "chemistry_stoichiometry.molar_mass",
        "chemistry_stoichiometry.limiting_reagent",
        "chemistry_stoichiometry.solution_concentration",
    }
    assert {
        capability["output_schema"] for capability in payload["capabilities"]
    } == {"ChemistryStoichiometryProblemSpec"}


@pytest.mark.parametrize(
    ("prompt", "expected"),
    [
        ("配平 H2 + O2 -> H2O", "2H2 + O2 -> 2H2O"),
        ("配平 Fe + O2 -> Fe2O3", "4Fe + 3O2 -> 2Fe2O3"),
    ],
)
def test_balance_equation_kernel(prompt: str, expected: str) -> None:
    skill = ChemistryStoichiometrySkillPack()
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_stoichiometry(spec)

    assert solution.answer_text == expected


def test_molar_mass_kernel_uses_common_atomic_weights() -> None:
    skill = ChemistryStoichiometrySkillPack()
    match = skill.heuristic_match(SkillRouteInput(prompt="求 H2O 的摩尔质量"))
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_stoichiometry(spec)

    assert solution.values["molar_mass"].unit == "g/mol"
    assert solution.values["molar_mass"].numeric == pytest.approx(18.015, abs=0.002)


def test_molar_mass_heuristic_accepts_unspaced_chinese_prompt() -> None:
    skill = ChemistryStoichiometrySkillPack()
    match = skill.heuristic_match(SkillRouteInput(prompt="求NaCl的摩尔质量"))
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_stoichiometry(spec)

    assert solution.values["molar_mass"].numeric == pytest.approx(58.44, abs=0.01)


def test_limiting_reagent_kernel_identifies_excess_and_theoretical_yield() -> None:
    skill = ChemistryStoichiometrySkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="10g H2 与 80g O2 反应生成水，判断限量反应物并求理论产量")
    )
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_stoichiometry(spec)

    assert solution.values["limiting_reagent"].display == "H2"
    assert solution.values["excess_reagent"].display == "O2"
    assert solution.values["theoretical_yield"].unit == "g H2O"
    assert solution.values["theoretical_yield"].numeric == pytest.approx(89.36, abs=0.05)


def test_heuristic_match_has_no_answer_fields() -> None:
    skill = ChemistryStoichiometrySkillPack()
    match = skill.heuristic_match(SkillRouteInput(prompt="0.5mol NaOH 溶于 1L 水，求物质的量浓度"))

    assert match is not None
    assert match.skill_id == "chemistry_stoichiometry"
    assert match.problem_spec is not None
    assert "answer" not in json.dumps(match.problem_spec)
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None
    assert spec.kind == "solution_concentration"


@pytest.mark.asyncio
async def test_execute_outputs_valid_playbook_with_table_and_chart() -> None:
    skill = ChemistryStoichiometrySkillPack()
    prompt = "10g H2 与 80g O2 反应生成水，判断限量反应物并求理论产量"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    result = await skill.execute(
        SkillExecutionContext(run_id="run-chem", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is True
    assert "skill:chemistry_stoichiometry" in result.review_actions
    assert result.playbook_json is not None
    playbook = PlaybookScript.model_validate_json(result.playbook_json)
    assert playbook.domain == TopicDomain.CHEMISTRY
    assert 3 <= len(playbook.steps) <= 5
    assert {"table_scene", "math_formula", "stats_chart_scene"} <= {
        step.snapshot.kind for step in playbook.steps
    }
    assert all(step.layers for step in playbook.steps)


@pytest.mark.asyncio
async def test_unsupported_compound_falls_back() -> None:
    skill = ChemistryStoichiometrySkillPack()
    prompt = "求 Uuo2 的摩尔质量"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    if match is None:
        return

    spec = skill.validate_problem_spec(match.problem_spec or {})
    result = await skill.execute(
        SkillExecutionContext(run_id="run-unsupported-chem", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is False
    assert result.fallback_reason is not None


@pytest.mark.asyncio
async def test_malformed_formula_falls_back() -> None:
    skill = ChemistryStoichiometrySkillPack()
    prompt = "求 NaClx 的摩尔质量"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None
    spec = skill.validate_problem_spec(match.problem_spec or {})

    result = await skill.execute(
        SkillExecutionContext(run_id="run-malformed", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is False
    assert result.fallback_reason is not None


@pytest.mark.asyncio
async def test_chemistry_pipeline_path_does_not_call_llm() -> None:
    registry = SkillRegistry([ChemistryStoichiometrySkillPack()])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(repo, _FailingLLM(), skill_registry=registry)

    await use_case.execute("run-chem-pipeline", PipelineRequest(prompt="配平 Fe + O2 -> Fe2O3"))

    assert repo.final_status == PipelineRunStatus.SUCCEEDED
    playbook = json.loads(repo.updates[-1]["playbook_json"])
    assert playbook["domain"] == "chemistry"
    assert "4Fe + 3O2 -> 2Fe2O3" in json.dumps(playbook, ensure_ascii=False)
