from __future__ import annotations

import json

from app.application.ports.llm_provider import ILLMProvider
from app.domain.services.router_prompt import build_router_prompt
from app.domain.skills.base import SkillManifest, SkillRouteInput, SkillRouteMatch


class LLMRouterProvider:
    def __init__(self, llm: ILLMProvider, *, model_name: str | None = None) -> None:
        self._llm = llm
        self.model_name = model_name

    async def route(
        self,
        *,
        request: SkillRouteInput,
        manifests: list[SkillManifest],
    ) -> SkillRouteMatch | None:
        system, user = build_router_prompt(request=request, manifests=manifests)
        raw = await self._llm.complete(system, user)
        data = json.loads(_strip_markdown_fences(raw))
        if data is None:
            return None
        return SkillRouteMatch.model_validate(data)


def _strip_markdown_fences(text: str) -> str:
    text = text.strip()
    if not text.startswith("```"):
        return text
    lines = text.splitlines()[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()
