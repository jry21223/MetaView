from __future__ import annotations

import json
from typing import Any

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import PlaybookScript
from app.domain.models.topic import TopicDomain
from app.domain.skills.algorithm_graph_core.graph_kernel import solve_graph_problem
from app.domain.skills.algorithm_graph_core.manifest import ALGORITHM_GRAPH_CORE_MANIFEST
from app.domain.skills.algorithm_graph_core.skill_pack import AlgorithmGraphCoreSkillPack
from app.domain.skills.base import SkillExecutionContext, SkillRouteInput
from app.domain.skills.elementary_algebra.spec_extractor import try_extract_elementary_algebra
from app.domain.skills.registry import SkillRegistry
from eval.scorers import score_playbook


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
        raise AssertionError("LLM must not be called for deterministic graph prompts")


def test_algorithm_graph_core_manifest_is_valid() -> None:
    payload = ALGORITHM_GRAPH_CORE_MANIFEST.model_dump(mode="json")

    assert payload["skill_id"] == "algorithm_graph_core"
    assert payload["domain"] == "algorithm"
    assert payload["execution_mode"] == "deterministic"
    assert {
        capability["capability_id"] for capability in payload["capabilities"]
    } == {
        "algorithm_graph_core.bfs",
        "algorithm_graph_core.dfs",
        "algorithm_graph_core.dijkstra",
        "algorithm_graph_core.topological_sort",
    }
    assert {
        capability["output_schema"] for capability in payload["capabilities"]
    } == {"AlgorithmGraphProblemSpec"}


def test_bfs_kernel_outputs_stable_order() -> None:
    skill = AlgorithmGraphCoreSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="用 BFS 遍历图 A-B, A-C, B-D, C-D，从 A 开始")
    )
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_graph_problem(spec)

    assert solution.order == ["A", "B", "C", "D"]
    assert solution.table_rows[0][:2] == ["A", "A"]


def test_dfs_kernel_outputs_stable_order() -> None:
    skill = AlgorithmGraphCoreSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="用 DFS 遍历图 A-B, A-C, B-D, C-D，从 A 开始")
    )
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_graph_problem(spec)

    assert solution.order == ["A", "B", "D", "C"]


def test_dijkstra_kernel_outputs_dist_and_path() -> None:
    skill = AlgorithmGraphCoreSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="解释 Dijkstra：A->B=2, A->C=5, B->C=1, C->D=3，求 A 到 D 最短路")
    )
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_graph_problem(spec)

    assert solution.distances["D"] == 6
    assert solution.path == ["A", "B", "C", "D"]


def test_dijkstra_keeps_zero_weight_edges() -> None:
    skill = AlgorithmGraphCoreSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="解释 Dijkstra：A->B=0, B->C=2, A->C=5，求 A 到 C 最短路")
    )
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_graph_problem(spec)

    assert solution.distances["C"] == 2
    assert solution.path == ["A", "B", "C"]


def test_dijkstra_extracts_explicit_target_before_chinese_possessive() -> None:
    skill = AlgorithmGraphCoreSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="解释 Dijkstra：A->B=1, B->C=1, A->D=10，求 A 到 C 的最短路")
    )
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_graph_problem(spec)

    assert spec.target == "C"
    assert solution.path == ["A", "B", "C"]
    assert solution.distances["C"] == 2


def test_topological_sort_kernel_outputs_valid_order() -> None:
    skill = AlgorithmGraphCoreSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="对有向图 A->B, A->C, B->D, C->D 做拓扑排序")
    )
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    solution = solve_graph_problem(spec)

    assert solution.order == ["A", "B", "C", "D"]


def test_heuristic_match_has_no_answer_fields() -> None:
    skill = AlgorithmGraphCoreSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="用 BFS 遍历图 A-B, A-C, B-D, C-D，从 A 开始")
    )

    assert match is not None
    assert match.skill_id == "algorithm_graph_core"
    assert match.problem_spec is not None
    assert "answer" not in json.dumps(match.problem_spec)
    assert "solution" not in json.dumps(match.problem_spec)


def test_factorial_prompt_does_not_route_to_algebra_factor_skill() -> None:
    spec = try_extract_elementary_algebra("逐行追踪 Python 函数 factorial(4) 的递归调用栈")

    assert spec is None


@pytest.mark.asyncio
async def test_execute_outputs_valid_playbook_with_graph_scene() -> None:
    skill = AlgorithmGraphCoreSkillPack()
    prompt = "用 BFS 遍历图 A-B, A-C, B-D, C-D，从 A 开始"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None and match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    result = await skill.execute(
        SkillExecutionContext(run_id="run-graph", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is True
    assert "skill:algorithm_graph_core" in result.review_actions
    assert result.playbook_json is not None
    playbook = PlaybookScript.model_validate_json(result.playbook_json)
    assert playbook.domain == TopicDomain.ALGORITHM
    assert 4 <= len(playbook.steps) <= 5
    assert "graph_scene" in {step.snapshot.kind for step in playbook.steps}
    assert "table_scene" in {step.snapshot.kind for step in playbook.steps}
    assert all(len(step.voiceover_text) >= 20 for step in playbook.steps)
    assert all(step.layers for step in playbook.steps)

    score = score_playbook("algorithm-bfs-runtime", result.playbook_json)
    assert score.passed, [(dim.name, dim.score, dim.issues) for dim in score.dimensions]


@pytest.mark.asyncio
async def test_dijkstra_negative_weight_falls_back() -> None:
    skill = AlgorithmGraphCoreSkillPack()
    prompt = "解释 Dijkstra：A->B=-2, B->C=1，求 A 到 C 最短路"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None
    spec = skill.validate_problem_spec(match.problem_spec or {})
    result = await skill.execute(
        SkillExecutionContext(run_id="run-negative", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is False
    assert result.fallback_reason is not None


@pytest.mark.asyncio
async def test_topological_cycle_falls_back() -> None:
    skill = AlgorithmGraphCoreSkillPack()
    prompt = "对有向图 A->B, B->A 做拓扑排序"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None
    spec = skill.validate_problem_spec(match.problem_spec or {})
    result = await skill.execute(
        SkillExecutionContext(run_id="run-cycle", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is False
    assert result.fallback_reason is not None


@pytest.mark.asyncio
async def test_graph_pipeline_path_does_not_call_llm() -> None:
    registry = SkillRegistry([AlgorithmGraphCoreSkillPack()])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(repo, _FailingLLM(), skill_registry=registry)

    await use_case.execute(
        "run-graph-pipeline",
        PipelineRequest(prompt="用 BFS 遍历图 A-B, A-C, B-D, C-D，从 A 开始"),
    )

    assert repo.final_status == PipelineRunStatus.SUCCEEDED
    playbook = json.loads(repo.updates[-1]["playbook_json"])
    assert playbook["domain"] == "algorithm"
    assert any(step["snapshot"]["kind"] == "graph_scene" for step in playbook["steps"])
