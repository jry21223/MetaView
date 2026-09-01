from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import PlaybookScript
from app.domain.skills.base import (
    SkillCapability,
    SkillExecutionContext,
    SkillExecutionResult,
    SkillManifest,
    SkillRouteInput,
    SkillRouteMatch,
)
from app.domain.skills.registry import SkillRegistry, build_default_skill_registry
from app.domain.skills.solid_geometry.skill_pack import SolidGeometrySkillPack
from tests.coverage_test_utils import ComposableCoverageResolver


class _RecordingRepo:
    def __init__(self) -> None:
        self.updates: list[dict[str, Any]] = []
        self.quality_reports: list[dict[str, Any]] = []
        self.lesson_plans: list[dict[str, Any]] = []

    async def update(self, run_id: str, **kwargs: Any) -> None:
        self.updates.append({"run_id": run_id, **kwargs})

    async def update_quality_report(self, run_id: str, quality_report_json: str) -> None:
        self.quality_reports.append({"run_id": run_id, "report": json.loads(quality_report_json)})

    async def update_lesson_plan(self, run_id: str, lesson_plan_json: str) -> None:
        self.lesson_plans.append(
            {"run_id": run_id, "lesson_plan": json.loads(lesson_plan_json)}
        )

    @property
    def final_status(self) -> PipelineRunStatus:
        return self.updates[-1]["status"]

    @property
    def review_json(self) -> str:
        return self.updates[-1].get("review_json") or "{}"


class _FailingLLM:
    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        raise AssertionError("LLM must not be called")


class _WorkingLLM:
    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        return json.dumps(
            {
                "version": "0.1.0",
                "title": "Generic",
                "domain": "math",
                "summary": "Generic fallback.",
                "steps": [
                    {
                        "id": "step_01",
                        "title": "解释概念",
                        "narration": "用通用数学解释路径说明这个概念，不调用任何测试 skill。",
                        "visual_kind": "formula",
                        "tokens": [],
                        "plot": {"formula_latex": "f(x)"},
                        "annotations": [],
                    }
                ],
            }
        )


class _FailingAgentProvider:
    def __init__(self) -> None:
        self.called = False

    async def generate(self, *args: Any, **kwargs: Any) -> dict[str, Any]:  # noqa: ARG002
        self.called = True
        raise AssertionError("agent must not be called")


class FakeSpec(BaseModel):
    text: str


class FakeSkillPack:
    manifest = SkillManifest(
        skill_id="fake_skill",
        domain="math",
        name="Fake Skill",
        description="Test skill",
        execution_mode="deterministic",
        capabilities=[
            SkillCapability(
                capability_id="fake.echo",
                description="Echo test",
                examples=["fake skill test"],
            )
        ],
    )

    def __init__(self) -> None:
        self.contexts: list[SkillExecutionContext] = []

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        if "fake skill test" not in request.prompt:
            return None
        return SkillRouteMatch(
            skill_id="fake_skill",
            domain="math",
            confidence=0.99,
            capability_id="fake.echo",
            problem_spec={"text": request.prompt},
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> FakeSpec | None:
        return FakeSpec.model_validate(data)

    async def execute(
        self,
        context: SkillExecutionContext,
        problem_spec: BaseModel | None,
    ) -> SkillExecutionResult:
        self.contexts.append(context)
        assert isinstance(problem_spec, FakeSpec)
        return SkillExecutionResult(
            handled=True,
            playbook_json=_fake_playbook_json(problem_spec.text),
            review_actions=["skill:fake_skill"],
        )


class MissingAssetSkillPack(FakeSkillPack):
    manifest = SkillManifest(
        skill_id="missing_asset_skill",
        domain="math",
        name="Missing Asset Skill",
        description="Returns a renderer-valid playbook with an unresolved asset.",
        execution_mode="deterministic",
        capabilities=[
            SkillCapability(
                capability_id="missing.asset",
                description="Missing asset regression fixture",
                examples=["missing asset skill test"],
            )
        ],
    )

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        if "missing asset skill test" not in request.prompt:
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain="math",
            confidence=0.99,
            capability_id="missing.asset",
            problem_spec={"text": request.prompt},
        )

    async def execute(
        self,
        context: SkillExecutionContext,
        problem_spec: BaseModel | None,
    ) -> SkillExecutionResult:
        payload = json.loads(_fake_playbook_json(context.prompt))
        snapshot = {
            "kind": "math_plot",
            "pack_id": "math-basic",
            "asset_id": "does-not-exist",
            "curves": [{"expression": "x", "label": "f"}],
        }
        payload["steps"][0]["snapshot"] = snapshot
        payload["steps"][0]["layers"] = [{"body": snapshot}]
        return SkillExecutionResult(
            handled=True,
            playbook_json=json.dumps(payload),
            review_actions=["skill:missing_asset_skill"],
        )


def test_run_pipeline_does_not_import_solid_geometry_directly() -> None:
    source = Path("apps/api/app/application/use_cases/run_pipeline.py").read_text(encoding="utf-8")

    assert "app.domain.skills.solid_geometry" not in source
    assert "app.domain.skills.physics_mechanics" not in source
    assert "app.domain.skills.chemistry_stoichiometry" not in source
    assert "app.domain.skills.algorithm_graph_core" not in source
    assert "app.domain.skills.biology_genetics" not in source
    assert "app.domain.skills.probability_statistics_core" not in source
    assert "app.domain.skills.geography_climate" not in source
    assert "app.domain.skills.geography_earth" not in source


def test_default_registry_contains_subject_skills_and_routes_prompts() -> None:
    registry = build_default_skill_registry()
    manifests = {manifest.skill_id for manifest in registry.manifests()}

    assert {
        "physics_mechanics",
        "chemistry_stoichiometry",
        "algorithm_graph_core",
        "biology_genetics",
        "probability_statistics_core",
        "geography_climate",
        "geography_earth",
    } <= manifests

    physics_route = registry.heuristic_match(
        SkillRouteInput(prompt="质量 2kg 的物体受到 10N 水平拉力，忽略摩擦，求加速度")
    )
    chemistry_route = registry.heuristic_match(SkillRouteInput(prompt="配平 H2 + O2 -> H2O"))
    graph_route = registry.heuristic_match(
        SkillRouteInput(prompt="用 BFS 遍历图 A-B, A-C, B-D，从 A 开始")
    )
    biology_route = registry.heuristic_match(
        SkillRouteInput(prompt="A 对 a 显性，亲本 Aa x Aa，求表现型比例")
    )
    statistics_route = registry.heuristic_match(
        SkillRouteInput(prompt="二项分布 n=5, p=0.2, k=2，求概率")
    )
    geography_route = registry.heuristic_match(
        SkillRouteInput(prompt="离线教学站点 EDU_TEMPERATE 的气候常年值摘要")
    )
    monsoon_route = registry.heuristic_match(SkillRouteInput(prompt="讲解东亚夏季风的海陆热力差异"))

    assert physics_route is not None and physics_route.skill_id == "physics_mechanics"
    assert chemistry_route is not None and chemistry_route.skill_id == "chemistry_stoichiometry"
    assert graph_route is not None and graph_route.skill_id == "algorithm_graph_core"
    assert biology_route is not None and biology_route.skill_id == "biology_genetics"
    assert (
        statistics_route is not None and statistics_route.skill_id == "probability_statistics_core"
    )
    assert geography_route is not None and geography_route.skill_id == "geography_climate"
    assert monsoon_route is not None and monsoon_route.skill_id == "geography_earth"


@pytest.mark.asyncio
async def test_solid_geometry_runs_through_skill_registry() -> None:
    registry = SkillRegistry([SolidGeometrySkillPack()])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(repo, _FailingLLM(), skill_registry=registry)

    await use_case.execute(
        "run-solid",
        PipelineRequest(prompt="正四棱锥 S-ABCD，底面边长为 2，高为 3，求 SA 与底面 ABCD 的线面角"),
    )

    assert repo.final_status == PipelineRunStatus.SUCCEEDED
    playbook = json.loads(repo.updates[-1]["playbook_json"])
    assert playbook["steps"][0]["snapshot"]["kind"] == "solid_geometry_scene"


@pytest.mark.asyncio
async def test_new_skill_can_run_without_pipeline_changes() -> None:
    skill = FakeSkillPack()
    registry = SkillRegistry([skill])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(repo, _FailingLLM(), skill_registry=registry)

    await use_case.execute("run-fake", PipelineRequest(prompt="fake skill test"))

    assert repo.final_status == PipelineRunStatus.SUCCEEDED
    assert "skill:fake_skill" in repo.review_json
    assert repo.quality_reports[-1]["report"]["status"] == "clean"
    assert skill.contexts[0].lesson_plan is not None
    assert skill.contexts[0].lesson_plan.domain == "math"
    assert repo.lesson_plans[-1]["lesson_plan"] == (
        skill.contexts[0].lesson_plan.model_dump(mode="json")
    )


@pytest.mark.asyncio
async def test_specialized_skill_quality_error_cannot_succeed() -> None:
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _FailingLLM(),
        skill_registry=SkillRegistry([MissingAssetSkillPack()]),
    )

    await use_case.execute(
        "run-missing-asset",
        PipelineRequest(prompt="missing asset skill test"),
    )

    assert repo.final_status == PipelineRunStatus.FAILED
    report = repo.quality_reports[-1]["report"]
    assert report["status"] == "blocked"
    assert {issue["code"] for issue in report["issues"]} >= {
        "asset.missing",
        "quality.repair_unavailable",
    }


@pytest.mark.asyncio
async def test_agent_mode_routes_registered_skill_before_agent() -> None:
    registry = SkillRegistry([FakeSkillPack()])
    agent = _FailingAgentProvider()
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _FailingLLM(),
        generation_mode="agent",
        agent_provider=agent,
        skill_registry=registry,
    )

    await use_case.execute("run-fake", PipelineRequest(prompt="fake skill test"))

    assert agent.called is False
    assert repo.final_status == PipelineRunStatus.SUCCEEDED


@pytest.mark.asyncio
async def test_derivative_tangent_prompt_produces_required_visual_evidence() -> None:
    prompt = "用动画解释导数的几何意义：曲线 y=x² 在点 (1,1) 处切线的斜率为什么是 2。"
    agent = _FailingAgentProvider()
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _FailingLLM(),
        generation_mode="agent",
        agent_provider=agent,
    )

    await use_case.execute(
        "run-derivative-tangent",
        PipelineRequest(prompt=prompt),
    )

    assert agent.called is False
    assert repo.final_status == PipelineRunStatus.SUCCEEDED
    assert repo.quality_reports[-1]["report"]["status"] == "clean"

    playbook = json.loads(repo.updates[-1]["playbook_json"])
    math_plots = [
        step["snapshot"]
        for step in playbook["steps"]
        if step["snapshot"]["kind"] == "math_plot"
    ]
    curve_roles = {
        curve.get("semantic_role")
        for snapshot in math_plots
        for curve in snapshot["curves"]
    }
    assert {"curve", "secant", "tangent"} <= curve_roles
    assert any(snapshot.get("marker_x") == 1 for snapshot in math_plots)
    final_voiceover = playbook["steps"][-1]["voiceover_text"]
    # Since #283 the final step states the full requested conclusion.
    assert "切线斜率为 2" in final_voiceover
    assert "d/dx" in final_voiceover


@pytest.mark.asyncio
async def test_geography_earth_scene_blueprint_runs_through_default_registry() -> None:
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo, _FailingLLM(), skill_registry=build_default_skill_registry()
    )

    await use_case.execute("run-monsoon", PipelineRequest(prompt="讲解东亚夏季风的海陆热力差异"))

    assert repo.final_status == PipelineRunStatus.SUCCEEDED
    assert "skill:geography_earth" in repo.review_json
    playbook = json.loads(repo.updates[-1]["playbook_json"])
    assert playbook["domain"] == "geography"
    assert playbook["initial_data"]["scene_blueprint"] == ["east_asia_monsoon"]
    assert playbook["steps"][0]["snapshot"]["kind"] == "geo_map_scene"
    assert playbook["steps"][0]["snapshot"]["pack_id"] == "geography-earth-basic"
    assert any(
        layer.get("asset_id") == "east-asia-land-110m"
        for layer in playbook["steps"][0]["snapshot"]["layers"]
    )


@pytest.mark.asyncio
async def test_no_skill_match_blocks_generic_output_that_does_not_cover_prompt() -> None:
    registry = SkillRegistry([FakeSkillPack()])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _WorkingLLM(),
        skill_registry=registry,
        coverage_resolver=ComposableCoverageResolver(default_domain="math"),
    )

    await use_case.execute("run-generic", PipelineRequest(prompt="解释一下概率密度函数"))

    assert repo.final_status == PipelineRunStatus.FAILED
    assert "skill:fake_skill" not in repo.review_json
    issue_codes = {issue["code"] for issue in repo.quality_reports[-1]["report"]["issues"]}
    assert "step.does_not_answer_prompt" in issue_codes


def _fake_playbook_json(text: str) -> str:
    playbook = PlaybookScript.model_validate(
        {
            "fps": 30,
            "total_frames": 180,
            "domain": "math",
            "title": "Fake Skill",
            "summary": text,
            "steps": [
                {
                    "step_id": "fake_01",
                    "end_frame": 180,
                    "title": "Echo",
                    "voiceover_text": "Echo the fake skill input.",
                    "tokens": [],
                    "snapshot": {
                        "kind": "math_formula",
                        "formula_latex": "x=x",
                        "caption": text,
                    },
                    "layers": [
                        {
                            "body": {
                                "kind": "math_formula",
                                "formula_latex": "x=x",
                                "caption": text,
                            }
                        }
                    ],
                }
            ],
            "parameter_controls": [],
        }
    )
    return playbook.model_dump_json()
