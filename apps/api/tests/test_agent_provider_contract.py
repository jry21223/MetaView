from __future__ import annotations

import pytest

from app.application.agent.types import (
    AgentConstraints,
    AgentRequest,
    AgentResult,
    ToolManifest,
)
from app.domain.models.coverage import CoverageDecision
from app.domain.models.lesson_plan import LessonPlan, SceneIntent


@pytest.mark.asyncio
async def test_agent_provider_run_contract_uses_wide_request_shape() -> None:
    class _Provider:
        async def run(self, request: AgentRequest) -> AgentResult:
            assert request.run_id == "run-contract"
            assert request.route_decision["destination"] == "generic_cir"
            assert request.coverage_decision is not None
            assert request.coverage_decision.mode == "experimental"
            assert request.lesson_plan is not None
            assert request.lesson_plan.title == "Line lesson plan"
            assert request.available_tools[0].name == "playbook.schema.validate"
            return AgentResult(
                playbook={"title": "ok"},
                provider="test",
                tool_events=[],
                runtime_events=[],
                review=None,
                artifacts={},
            )

    lesson_plan = LessonPlan(
        schema_version="1.0.0",
        domain="math",
        title="Line lesson plan",
        learning_objectives=["Explain the line y=x."],
        prerequisites=["Know x and y coordinates."],
        misconceptions=["The line contains only the origin."],
        expected_conclusion="Every point on y=x has equal coordinates.",
        lesson_arc="intuition_to_abstraction",
        scenes=[
            SceneIntent(
                scene_id="line",
                teaching_goal="Plot representative points on y=x.",
                strategy="demonstration",
                required_fact_ids=["line_identity"],
                required_visual_roles=["axis", "line"],
                preferred_scene_type="line_graph",
                narration_goal="Connect equal coordinates to the diagonal line.",
            )
        ],
    )
    request = AgentRequest(
        run_id="run-contract",
        prompt="explain y=x",
        source_code=None,
        language=None,
        route_decision={"destination": "generic_cir"},
        coverage_decision=CoverageDecision(
            mode="experimental",
            domain="math",
            confidence=0.6,
            matched_skill_ids=[],
            available_tool_ids=["playbook.schema.validate"],
            missing_capabilities=["validator:line_graph"],
            fallback_policy="limited_visual",
            reason="Only a limited visual path is available.",
        ),
        lesson_plan=lesson_plan,
        provider_config={"model": "test-model"},
        playbook_schema={"type": "object"},
        constraints=AgentConstraints(max_self_repair_attempts=2),
        available_tools=[
            ToolManifest(
                name="playbook.schema.validate",
                description="Validate PlaybookScript.",
                args_schema={"type": "object"},
                domain="playbook",
                deterministic=True,
            )
        ],
    )

    result = await _Provider().run(request)

    assert result.provider == "test"
    assert result.playbook["title"] == "ok"
