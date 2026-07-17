from __future__ import annotations

import json
from typing import Any

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.skills.base import SkillRouteMatch
from app.domain.skills.solid_geometry import skill_pack as solid_skill_pack_mod


class _RecordingRepo:
    def __init__(self) -> None:
        self.updates: list[dict[str, Any]] = []

    async def update(self, run_id: str, **kwargs: Any) -> None:
        self.updates.append({"run_id": run_id, **kwargs})


class _Router:
    model_name = "router-test"

    def __init__(self, route: SkillRouteMatch) -> None:
        self._route = route

    async def route(self, **_: Any) -> SkillRouteMatch:
        return self._route


class _LLM:
    def __init__(self, response: str) -> None:
        self.calls = 0
        self.response = response

    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        self.calls += 1
        return self.response


class _FailingLLM:
    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        raise AssertionError("LLM must not compute deterministic solid geometry answers")


def _math_formula_cir() -> str:
    return json.dumps({
        "version": "0.1.0",
        "title": "几何解释",
        "domain": "math",
        "summary": "Use a generic visual explanation.",
        "steps": [
            {
                "id": "step_01",
                "title": "先识别要求",
                "narration": "这一步只解释题目类型，不调用尚未支持的确定性二面角求解器。",
                "visual_kind": "formula",
                "tokens": [],
                "plot": {"formula_latex": "\\\\angle(S-AB-C)"},
                "annotations": ["二面角当前走 generic CIR。"],
            }
        ],
    })


def _model_spec_route(prompt_capability: str = "regular_quad_pyramid.line_plane_angle") -> SkillRouteMatch:
    return SkillRouteMatch(
        skill_id="solid_geometry",
        domain="math",
        confidence=0.95,
        capability_id=prompt_capability,
        problem_spec={
            "body": "regular_quad_pyramid",
            "dimensions": {"base": "2", "height": "3"},
            "query": {
                "kind": "line_plane_angle",
                "line": {"through": ["S", "A"]},
                "plane": {"through": ["A", "B", "C"]},
            },
        },
    )


@pytest.mark.asyncio
async def test_router_spec_must_match_heuristic_before_driving_geometry_kernel() -> None:
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _FailingLLM(),
        router_provider=_Router(_model_spec_route()),
    )

    await use_case.execute(
        "run-model-spec",
        PipelineRequest(
            prompt=(
                "正四棱锥 S-ABCD，底面边长为 2，高为 3，"
                "求 SA 与底面 ABCD 的线面角"
            )
        ),
    )

    last = repo.updates[-1]
    assert last["status"] == PipelineRunStatus.SUCCEEDED
    playbook = json.loads(last["playbook_json"])
    assert playbook["steps"][0]["snapshot"]["kind"] == "solid_geometry_scene"
    assert playbook["steps"][-1]["snapshot"]["formula_latex"]
    review = json.loads(last["review_json"])
    assert "router:spec_source:heuristic_verified" in review["actions"]
    assert "router:skill_pack" in review["actions"]
    assert "skill:solid_geometry" in review["actions"]


@pytest.mark.asyncio
async def test_unsupported_routed_geometry_is_rejected_without_calling_kernel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _boom(_spec: Any) -> Any:
        raise AssertionError("unsupported query kind must not reach solve_solid_geometry")

    monkeypatch.setattr(solid_skill_pack_mod, "solve_solid_geometry", _boom)
    route = SkillRouteMatch(
        skill_id="solid_geometry",
        domain="math",
        confidence=0.95,
        capability_id="solid_geometry.dihedral_angle",
        problem_spec={
            "body": "regular_quad_pyramid",
            "dimensions": {"base": "2", "height": "3"},
            "query": {
                "kind": "dihedral_angle",
                "line": {"through": ["S", "A"]},
                "plane": {"through": ["A", "B", "C"]},
            },
        },
    )
    llm = _LLM(_math_formula_cir())
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(repo, llm, router_provider=_Router(route))

    await use_case.execute("run-unsupported", PipelineRequest(prompt="正四棱锥 S-ABCD，求二面角 S-AB-C"))

    assert llm.calls == 0
    assert repo.updates[-1]["status"] == PipelineRunStatus.FAILED
    review = json.loads(repo.updates[-1]["review_json"])
    assert review["issues"][0]["code"] == "capability.unsupported"
    assert "coverage:mode:unsupported" in review["actions"]
