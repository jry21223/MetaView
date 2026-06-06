from __future__ import annotations

import json
from typing import Any

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import (
    ComplexPlanePoint,
    ComplexPlaneSceneSnapshot,
    GraphSceneNode,
    GraphSceneSnapshot,
    IterationTraceItem,
    IterationTraceSceneSnapshot,
    ManifoldSceneSnapshot,
    MatrixSceneSnapshot,
    MetaStep,
    ModelingSceneSnapshot,
    OptimizationSceneSnapshot,
    PhasePortraitSceneSnapshot,
    PlaybookScript,
    StatsChartSceneSnapshot,
    TableSceneSnapshot,
)
from app.domain.models.topic import TopicDomain
from app.domain.skills.algebra_core import (
    parse_equation,
    parse_equation_list,
    solve_equation,
    system_to_matrix,
)
from app.domain.skills.base import SkillExecutionContext, SkillRouteInput
from app.domain.skills.calculus_core.skill_pack import CalculusCoreSkillPack
from app.domain.skills.elementary_algebra.skill_pack import ElementaryAlgebraSkillPack
from app.domain.skills.linear_algebra.skill_pack import LinearAlgebraSkillPack
from app.domain.skills.registry import build_default_skill_registry


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
        raise AssertionError("LLM must not be called for deterministic math skill prompts")


def test_algebra_core_solves_equation_and_system_matrix() -> None:
    _, equation = parse_equation("2x+3=11")
    solutions, steps = solve_equation(equation)
    system = parse_equation_list("x+2y=3;3x-y=5")
    matrix, rhs, variables = system_to_matrix(system)

    assert [str(solution) for solution in solutions] == ["4"]
    assert steps[0].formula_latex == "2 x + 3 = 11"
    assert matrix.tolist() == [[1, 2], [3, -1]]
    assert rhs.tolist() == [[3], [5]]
    assert variables == ["x", "y"]


@pytest.mark.parametrize(
    ("skill", "prompt", "expected_skill", "expected_kind"),
    [
        (ElementaryAlgebraSkillPack(), "解方程 2x+3=11", "elementary_algebra", "table_scene"),
        (LinearAlgebraSkillPack(), "求 A=[[1,2],[3,4]] 的特征值", "linear_algebra", "matrix_scene"),
        (CalculusCoreSkillPack(), "求 d/dx (x^2 sin x)", "calculus_core", "iteration_trace_scene"),
    ],
)
@pytest.mark.asyncio
async def test_v1_math_skill_executes_playbook(
    skill: Any,
    prompt: str,
    expected_skill: str,
    expected_kind: str,
) -> None:
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None
    assert match.skill_id == expected_skill
    assert match.problem_spec is not None
    assert "answer" not in json.dumps(match.problem_spec)

    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None
    result = await skill.execute(
        SkillExecutionContext(run_id="test", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is True
    assert result.playbook_json is not None
    playbook = PlaybookScript.model_validate_json(result.playbook_json)
    assert playbook.domain == TopicDomain.MATH
    assert 5 <= len(playbook.steps) <= 8
    assert expected_kind in {step.snapshot.kind for step in playbook.steps}
    assert all(step.layers for step in playbook.steps)


def test_default_registry_contains_v1_math_skills_and_routes_system() -> None:
    registry = build_default_skill_registry()
    manifests = {manifest.skill_id for manifest in registry.manifests()}
    route = registry.heuristic_match(SkillRouteInput(prompt="解方程组 x+2y=3, 3x-y=5"))

    assert {"elementary_algebra", "linear_algebra", "calculus_core"} <= manifests
    assert route is not None
    assert route.skill_id == "linear_algebra"


@pytest.mark.asyncio
async def test_v1_math_skill_pipeline_path_does_not_call_llm() -> None:
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(repo, _FailingLLM())

    await use_case.execute("run-algebra", PipelineRequest(prompt="解方程 2x+3=11"))

    assert repo.final_status == PipelineRunStatus.SUCCEEDED
    playbook = json.loads(repo.updates[-1]["playbook_json"])
    assert playbook["domain"] == "math"
    assert any(step["snapshot"]["kind"] == "table_scene" for step in playbook["steps"])


def test_new_snapshot_kinds_validate_in_playbook_schema() -> None:
    snapshots = [
        MatrixSceneSnapshot(matrix=[[1, 2], [3, 4]]),
        TableSceneSnapshot(columns=["a"], rows=[["b"]]),
        GraphSceneSnapshot(nodes=[GraphSceneNode(id="a")]),
        StatsChartSceneSnapshot(series=[]),
        IterationTraceSceneSnapshot(iterations=[IterationTraceItem(index=0, value="x")]),
        PhasePortraitSceneSnapshot(),
        ComplexPlaneSceneSnapshot(points=[ComplexPlanePoint(re=1, im=2)]),
        OptimizationSceneSnapshot(),
        ModelingSceneSnapshot(),
        ManifoldSceneSnapshot(),
    ]
    steps = [
        MetaStep(
            step_id=f"s{index}",
            end_frame=(index + 1) * 30,
            title="snapshot",
            voiceover_text="snapshot",
            snapshot=snapshot,
            tokens=[],
        )
        for index, snapshot in enumerate(snapshots)
    ]

    playbook = PlaybookScript(
        fps=30,
        total_frames=len(steps) * 30,
        domain=TopicDomain.MATH,
        title="schema",
        summary="schema",
        steps=steps,
    )

    assert {step.snapshot.kind for step in playbook.steps} == {
        "matrix_scene",
        "table_scene",
        "graph_scene",
        "stats_chart_scene",
        "iteration_trace_scene",
        "phase_portrait_scene",
        "complex_plane_scene",
        "optimization_scene",
        "modeling_scene",
        "manifold_scene",
    }
