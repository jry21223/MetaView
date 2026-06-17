from __future__ import annotations

from collections.abc import Awaitable, Callable

from app.application.dto.pipeline_dto import PipelineRequest
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
            [str, PipelineRequest, SkillRouteMatch],
            Awaitable[bool],
        ],
        fail_skill_consistency: Callable[[str, SkillRouteMatch, str], Awaitable[None]],
        build_route_context: Callable[[PipelineRequest, SkillRouteMatch | None], object],
        execute_agent: Callable[[str, PipelineRequest, object], Awaitable[None]],
    ) -> None:
        self._route_request = route_request
        self._try_execute_skill = try_execute_skill
        self._fail_skill_consistency = fail_skill_consistency
        self._build_route_context = build_route_context
        self._execute_agent = execute_agent

    async def execute(self, run_id: str, request: PipelineRequest) -> None:
        route_match = await self._route_request(request)
        if route_match is not None:
            try:
                handled = await self._try_execute_skill(run_id, request, route_match)
            except AssertionError as exc:
                await self._fail_skill_consistency(run_id, route_match, str(exc))
                return
            if handled:
                return

        route_context = self._build_route_context(request, route_match)
        await self._execute_agent(run_id, request, route_context)
