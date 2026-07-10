from __future__ import annotations

from collections.abc import Awaitable, Callable

from app.application.dto.pipeline_dto import PipelineRequest
from app.domain.models.lesson_plan import LessonPlan
from app.domain.skills.base import SkillRouteMatch


class AgentPipeline:
    """Agent-mode orchestration boundary.

    This first migration keeps persistence/reviewer details in the existing
    use case while moving agent-mode routing and deterministic direct execution
    behind a single pipeline entrypoint.
    """

    def __init__(
        self,
        *,
        route_request: Callable[[PipelineRequest], Awaitable[SkillRouteMatch | None]],
        try_execute_skill: Callable[
            [str, PipelineRequest, SkillRouteMatch, LessonPlan],
            Awaitable[bool],
        ],
        fail_skill_consistency: Callable[[str, SkillRouteMatch, str], Awaitable[None]],
        build_route_context: Callable[[PipelineRequest, SkillRouteMatch | None], object],
        prepare_lesson_plan: Callable[
            [str, PipelineRequest, object], Awaitable[LessonPlan]
        ],
        execute_agent: Callable[
            [str, PipelineRequest, object, LessonPlan], Awaitable[None]
        ],
    ) -> None:
        self._route_request = route_request
        self._try_execute_skill = try_execute_skill
        self._fail_skill_consistency = fail_skill_consistency
        self._build_route_context = build_route_context
        self._prepare_lesson_plan = prepare_lesson_plan
        self._execute_agent = execute_agent

    async def execute(self, run_id: str, request: PipelineRequest) -> None:
        route_match = await self._route_request(request)
        route_context = self._build_route_context(request, route_match)
        lesson_plan = await self._prepare_lesson_plan(run_id, request, route_context)
        if route_match is not None:
            try:
                handled = await self._try_execute_skill(
                    run_id, request, route_match, lesson_plan
                )
            except AssertionError as exc:
                await self._fail_skill_consistency(run_id, route_match, str(exc))
                return
            if handled:
                return

        await self._execute_agent(run_id, request, route_context, lesson_plan)
