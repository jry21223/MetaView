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
from app.domain.skills.biology_genetics.genetics_kernel import solve_genetics_problem
from app.domain.skills.biology_genetics.manifest import BIOLOGY_GENETICS_MANIFEST
from app.domain.skills.biology_genetics.skill_pack import BiologyGeneticsSkillPack
from app.domain.skills.registry import SkillRegistry

_ALLOWED_SNAPSHOTS = {
    "modeling_scene",
    "table_scene",
    "stats_chart_scene",
    "math_formula",
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
        raise AssertionError("LLM must not be called for deterministic genetics prompts")


def test_biology_genetics_manifest_is_valid() -> None:
    payload = BIOLOGY_GENETICS_MANIFEST.model_dump(mode="json")

    assert payload["skill_id"] == "biology_genetics"
    assert payload["domain"] == "biology"
    assert payload["execution_mode"] == "deterministic"
    assert {
        capability["capability_id"] for capability in payload["capabilities"]
    } == {
        "biology_genetics.monohybrid_ratio",
        "biology_genetics.test_cross",
        "biology_genetics.dihybrid_ratio",
        "biology_genetics.genotype_probability",
        "biology_genetics.phenotype_probability",
        "biology_genetics.punnett_table",
    }
    assert {
        capability["output_schema"] for capability in payload["capabilities"]
    } == {"BiologyGeneticsProblemSpec"}


def test_heuristic_match_creates_spec_without_answer_fields() -> None:
    skill = BiologyGeneticsSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="A 对 a 显性，亲本 Aa x Aa，求基因型比例、表现型比例和 P(aa)")
    )

    assert match is not None
    assert match.skill_id == "biology_genetics"
    assert match.capability_id == "biology_genetics.monohybrid_ratio"
    assert match.problem_spec is not None
    assert "answer" not in json.dumps(match.problem_spec)
    assert "solution" not in json.dumps(match.problem_spec)


def test_problem_spec_validation_accepts_heuristic_draft() -> None:
    skill = BiologyGeneticsSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="A 对 a 显性，亲本 Aa x aa，做 test cross 并画 Punnett 表")
    )

    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)

    assert spec is not None
    assert spec.parents == ["Aa", "aa"]
    assert spec.kind == "test_cross"


def test_monohybrid_kernel_outputs_ratios_and_probability() -> None:
    skill = BiologyGeneticsSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="A 对 a 显性，亲本 Aa x Aa，求基因型比例、表现型比例和 P(aa)")
    )
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_genetics_problem(spec)

    assert solution.genotype_ratio == "1:2:1"
    assert solution.phenotype_ratio == "3:1"
    assert str(solution.probabilities["aa"]) == "1/4"


def test_dihybrid_kernel_outputs_mendelian_ratio() -> None:
    skill = BiologyGeneticsSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="A 对 a 显性，B 对 b 显性，亲本 AaBb x AaBb，求表现型比例和 P(A_B_)")
    )
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_genetics_problem(spec)

    assert solution.phenotype_ratio == "9:3:3:1"
    assert str(solution.probabilities["A_B_"]) == "9/16"


@pytest.mark.asyncio
async def test_malformed_parent_prompt_falls_back_without_raising() -> None:
    skill = BiologyGeneticsSkillPack()
    prompt = "亲本 AB x ab，求基因型比例"

    route_match = SkillRegistry([skill]).heuristic_match(SkillRouteInput(prompt=prompt))
    assert route_match is None or route_match.skill_id == "biology_genetics"

    result = await skill.execute(
        SkillExecutionContext(run_id="run-malformed-genetics", prompt=prompt, route_match=None),
        None,
    )

    assert result.handled is False
    assert result.fallback_reason


@pytest.mark.asyncio
async def test_unsupported_genetics_falls_back_with_reason() -> None:
    skill = BiologyGeneticsSkillPack()
    prompt = "A 对 a 显性，伴性遗传亲本 Aa x Aa，求表现型比例"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None
    spec = skill.validate_problem_spec(match.problem_spec or {})

    result = await skill.execute(
        SkillExecutionContext(run_id="run-sex-linked", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is False
    assert result.fallback_reason is not None


@pytest.mark.asyncio
async def test_execute_outputs_valid_playbook_with_allowed_snapshots() -> None:
    skill = BiologyGeneticsSkillPack()
    prompt = "A 对 a 显性，亲本 Aa x Aa，求基因型比例、表现型比例和 P(aa)"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    result = await skill.execute(
        SkillExecutionContext(run_id="run-genetics", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is True
    assert result.playbook_json is not None
    playbook = PlaybookScript.model_validate_json(result.playbook_json)
    kinds = {step.snapshot.kind for step in playbook.steps}
    assert playbook.domain == TopicDomain.BIOLOGY
    assert kinds <= _ALLOWED_SNAPSHOTS
    assert {"modeling_scene", "table_scene", "stats_chart_scene"} <= kinds
    assert all(step.layers for step in playbook.steps)


@pytest.mark.asyncio
async def test_genetics_pipeline_path_does_not_call_llm() -> None:
    registry = SkillRegistry([BiologyGeneticsSkillPack()])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(repo, _FailingLLM(), skill_registry=registry)

    await use_case.execute(
        "run-genetics-pipeline",
        PipelineRequest(prompt="A 对 a 显性，亲本 Aa x Aa，求基因型比例和表现型比例"),
    )

    assert repo.final_status == PipelineRunStatus.SUCCEEDED
    playbook = json.loads(repo.updates[-1]["playbook_json"])
    assert playbook["domain"] == "biology"
    assert any(step["snapshot"]["kind"] == "table_scene" for step in playbook["steps"])
