from __future__ import annotations

import json

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase, _resolve_route
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.topic import TopicDomain
from app.domain.services.domain_router import SkillMode
from tests.coverage_test_utils import ComposableCoverageResolver


def _cir_json(domain: str, title: str = "Router Test") -> str:
    return json.dumps({
        "version": "0.1.0",
        "title": title,
        "domain": domain,
        "summary": "A short valid CIR fixture.",
        "steps": [
            {
                "id": "step_01",
                "title": "Show the first idea",
                "narration": "This fixture is enough to exercise prompt routing.",
                "visual_kind": "array",
                "tokens": [
                    {"id": "t0", "label": "A", "value": "A", "emphasis": "primary"},
                    {"id": "t1", "label": "B", "value": "B", "emphasis": "secondary"},
                ],
                "annotations": [],
            }
        ],
    })


VALID_GENERIC_CIR_JSON = _cir_json("geography", "Generic Route")
VALID_PHYSICS_CIR_JSON = _cir_json("physics", "Physics Route")


class CapturingLLM:
    def __init__(self, returning: str) -> None:
        self._returning = returning
        self.last_system = ""
        self.last_user = ""

    async def complete(self, system: str, user: str) -> str:
        self.last_system = system
        self.last_user = user
        return self._returning


class RecordingRepo:
    def __init__(self) -> None:
        self.updates: list[dict] = []

    async def update(
        self,
        run_id: str,
        *,
        status: PipelineRunStatus,
        playbook_json: str | None = None,
        error: str | None = None,
        review_json: str | None = None,
    ) -> None:
        self.updates.append({
            "run_id": run_id,
            "status": status,
            "playbook_json": playbook_json,
            "error": error,
            "review_json": review_json,
        })


@pytest.mark.asyncio
async def test_unknown_prompt_is_rejected_before_generic_generation() -> None:
    llm = CapturingLLM(returning=VALID_GENERIC_CIR_JSON)
    repo = RecordingRepo()
    use_case = RunPipelineUseCase(repo, llm, max_repair_attempts=0)

    await use_case.execute("run-1", PipelineRequest(prompt="some unrelated vague idea"))

    assert llm.last_system == ""
    assert repo.updates[-1]["status"] == PipelineRunStatus.FAILED
    assert "no reliably resolved domain" in (repo.updates[-1]["error"] or "")


@pytest.mark.asyncio
async def test_physics_prompt_uses_specialized_physics_prompt() -> None:
    llm = CapturingLLM(returning=VALID_PHYSICS_CIR_JSON)
    repo = RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        llm,
        max_repair_attempts=0,
        coverage_resolver=ComposableCoverageResolver(default_domain="physics"),
    )

    await use_case.execute("run-1", PipelineRequest(prompt="斜面小球受力分析"))

    assert "Skill mode: specialized" in llm.last_system
    assert "VISUAL + PEDAGOGY RULES for physics" in llm.last_system


def test_skill_mode_override_generic_forces_generic_even_for_physics() -> None:
    request = PipelineRequest(
        prompt="斜面小球受力分析",
        skill_mode_override="generic",
    )
    route = _resolve_route(request)
    assert route.skill_mode == SkillMode.GENERIC
    assert route.domain is None


def test_skill_mode_override_specialized_keeps_matched_domain() -> None:
    request = PipelineRequest(
        prompt="斜面小球受力分析",
        skill_mode_override="specialized",
    )
    route = _resolve_route(request)
    assert route.skill_mode == SkillMode.SPECIALIZED
    assert route.domain == TopicDomain.PHYSICS
