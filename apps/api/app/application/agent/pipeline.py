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
        prepare_route_context: Callable[
            [str, PipelineRequest, SkillRouteMatch | None],
            Awaitable[object | None],
        ],
        can_execute_skill: Callable[[object], bool],
        try_execute_skill: Callable[
            [str, PipelineRequest, SkillRouteMatch, object, LessonPlan],
            Awaitable[bool],
        ],
        fail_skill_consistency: Callable[
            [str, SkillRouteMatch, object, str], Awaitable[None]
        ],
        prepare_lesson_plan: Callable[
            [str, PipelineRequest, object], Awaitable[LessonPlan]
        ],
        execute_agent: Callable[
            [str, PipelineRequest, object, LessonPlan], Awaitable[None]
        ],
    ) -> None:
        self._route_request = route_request
        self._prepare_route_context = prepare_route_context
        self._can_execute_skill = can_execute_skill
        self._try_execute_skill = try_execute_skill
        self._fail_skill_consistency = fail_skill_consistency
        self._prepare_lesson_plan = prepare_lesson_plan
        self._execute_agent = execute_agent

    async def execute(self, run_id: str, request: PipelineRequest) -> None:
        route_match = await self._route_request(request)
        route_context = await self._prepare_route_context(run_id, request, route_match)
        if route_context is None:
            return
        lesson_plan = await self._prepare_lesson_plan(run_id, request, route_context)
        if route_match is not None and self._can_execute_skill(route_context):
            try:
                handled = await self._try_execute_skill(
                    run_id, request, route_match, route_context, lesson_plan
                )
            except AssertionError as exc:
                await self._fail_skill_consistency(
                    run_id, route_match, route_context, str(exc)
                )
                return
            if handled:
                return

        await self._execute_agent(run_id, request, route_context, lesson_plan)
