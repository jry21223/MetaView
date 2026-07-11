from __future__ import annotations

from typing import Protocol

from app.domain.models.lesson_plan import LessonPlan
from app.domain.models.route_decision import RouteDecision


class ILessonPlanner(Protocol):
    async def plan(
        self,
        *,
        prompt: str,
        domain: str | None = None,
        title: str | None = None,
        route_decision: RouteDecision | None = None,
        source_code: str | None = None,
        language: str | None = None,
    ) -> LessonPlan: ...
