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
from app.domain.skills.quadratic_transform.manifest import QUADRATIC_TRANSFORM_MANIFEST
from app.domain.skills.quadratic_transform.skill_pack import QuadraticTransformSkillPack
from app.domain.skills.quadratic_transform.spec_extractor import (
    try_extract_quadratic_transform,
)
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
        raise AssertionError("LLM must not be called")


def test_quadratic_transform_manifest_is_valid() -> None:
    payload = QUADRATIC_TRANSFORM_MANIFEST.model_dump(mode="json")

    assert payload["skill_id"] == "quadratic_transform"
    assert payload["domain"] == "math"
    assert payload["execution_mode"] == "deterministic"
    assert payload["capabilities"][0]["capability_id"] == "quadratic_transform.vertex_form"
    assert payload["capabilities"][0]["output_schema"] == "QuadraticTransformProblemSpec"


@pytest.mark.parametrize(
    ("prompt", "expected"),
    [
        ("解释 y=(x-2)^2+1 的图像变换", {"a": 1, "h": 2, "k": 1, "expr": "(x-2)^2+1"}),
        (
            "讲一下 y=2(x+1)^2-3 是怎么从 y=x^2 变来的",
            {"a": 2, "h": -1, "k": -3, "expr": "2*(x+1)^2-3"},
        ),
        ("解释 y=-(x-1)^2 的开口和平移", {"a": -1, "h": 1, "k": 0, "expr": "-(x-1)^2"}),
        ("解释 y=x^2 的图像", {"a": 1, "h": 0, "k": 0, "expr": "x^2"}),
        ("解释 y=x² 的图像", {"a": 1, "h": 0, "k": 0, "expr": "x^2"}),
    ],
)
def test_extractor_parses_supported_vertex_forms(prompt: str, expected: dict[str, Any]) -> None:
    spec = try_extract_quadratic_transform(prompt)

    assert spec is not None
    assert spec.a == expected["a"]
    assert spec.h == expected["h"]
    assert spec.k == expected["k"]
    assert spec.target_expression == expected["expr"]


@pytest.mark.parametrize(
    "prompt",
    [
        "解释 y=x^2+2x+1 的图像变换",
        "求导 y=(x-2)^2+1",
        "解释 y=3sin(x)+1 的图像变化",
        "解释概率密度函数",
    ],
)
def test_heuristic_match_ignores_unsupported_prompts(prompt: str) -> None:
    skill = QuadraticTransformSkillPack()

    assert skill.heuristic_match(SkillRouteInput(prompt=prompt)) is None


@pytest.mark.parametrize(
    "prompt",
    [
        "解释 y=(x-2)^2+1 的图像变换",
        "讲一下 y=2(x+1)^2-3 是怎么从 y=x^2 变来的",
        "解释 y=-(x-1)^2 的开口和平移",
        "解释 y=x² 的图像",
    ],
)
def test_heuristic_match_detects_supported_prompts(prompt: str) -> None:
    skill = QuadraticTransformSkillPack()
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))

    assert match is not None
    assert match.skill_id == "quadratic_transform"
    assert match.domain == "math"
    assert match.capability_id == "quadratic_transform.vertex_form"
    assert match.problem_spec is not None
    assert "answer" not in json.dumps(match.problem_spec)
    assert "solution" not in json.dumps(match.problem_spec)
    assert "final_answer" not in json.dumps(match.problem_spec)


@pytest.mark.asyncio
async def test_validate_and_execute_outputs_six_math_plot_steps() -> None:
    skill = QuadraticTransformSkillPack()
    prompt = "解释 y=(x-2)^2+1 的图像变换"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))

    assert match is not None
    assert match.problem_spec is not None
    spec = skill.validate_problem_spec(match.problem_spec)
    assert spec is not None

    result = await skill.execute(
        SkillExecutionContext(run_id="test", prompt=prompt, route_match=match),
        spec,
    )

    assert result.handled is True
    assert "skill:quadratic_transform" in result.review_actions
    assert result.playbook_json is not None
    assert "algorithm_array" not in result.playbook_json

    playbook = PlaybookScript.model_validate_json(result.playbook_json)
    assert playbook.domain == TopicDomain.MATH
    assert len(playbook.steps) == 6
    assert all(step.snapshot.kind == "math_plot" for step in playbook.steps)
    assert all(step.layers for step in playbook.steps)
    assert all(step.layers[0].body.kind == "math_plot" for step in playbook.steps)

    expressions = [
        curve.expression
        for step in playbook.steps
        if step.snapshot.kind == "math_plot"
        for curve in step.snapshot.curves
    ]
    assert "x^2" in expressions
    assert "(x-2)^2+1" in expressions


def test_default_registry_routes_quadratic_transform() -> None:
    registry = build_default_skill_registry()
    manifests = {manifest.skill_id for manifest in registry.manifests()}
    route = registry.heuristic_match(
        SkillRouteInput(prompt="讲一下 y=2(x+1)^2-3 是怎么从 y=x^2 变来的")
    )

    assert {"solid_geometry", "quadratic_transform"} <= manifests
    assert "function_transform" not in manifests
    assert route is not None
    assert route.skill_id == "quadratic_transform"
    assert route.problem_spec is not None


@pytest.mark.asyncio
async def test_quadratic_transform_runs_through_pipeline_registry() -> None:
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(repo, _FailingLLM())

    await use_case.execute(
        "run-quadratic-transform",
        PipelineRequest(prompt="解释 y=(x-2)^2+1 的图像变换"),
    )

    assert repo.final_status == PipelineRunStatus.SUCCEEDED
    playbook = json.loads(repo.updates[-1]["playbook_json"])
    assert playbook["domain"] == "math"
    assert len(playbook["steps"]) == 6
    assert all(step["snapshot"]["kind"] == "math_plot" for step in playbook["steps"])
    assert all(step["layers"] for step in playbook["steps"])
