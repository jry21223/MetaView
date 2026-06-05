from __future__ import annotations

from typing import Protocol

from app.domain.skills.base import SkillManifest, SkillRouteInput, SkillRouteMatch


class IRouterProvider(Protocol):
    async def route(
        self,
        *,
        request: SkillRouteInput,
        manifests: list[SkillManifest],
    ) -> SkillRouteMatch | None: ...
