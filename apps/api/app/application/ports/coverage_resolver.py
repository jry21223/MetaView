from __future__ import annotations

from typing import Protocol

from app.domain.models.coverage import CoverageDecision
from app.domain.skills.base import SkillRouteMatch


class ICoverageResolver(Protocol):
    """Resolve one request into a canonical, read-only capability boundary."""

    def resolve(
        self,
        *,
        prompt: str,
        source_code: str | None = None,
        language: str | None = None,
        explicit_domain: str | None = None,
        skill_mode_override: str | None = None,
        route_match: SkillRouteMatch | None = None,
    ) -> CoverageDecision: ...


__all__ = ["ICoverageResolver"]
