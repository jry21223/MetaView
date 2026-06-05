from __future__ import annotations

import pytest

from app.domain.services.router_prompt import build_router_prompt
from app.domain.skills.base import SkillRouteInput, SkillRouteMatch
from app.domain.skills.registry import get_skill_manifests
from app.infrastructure.router.llm_router_provider import LLMRouterProvider


class _RouterLLM:
    def __init__(self, response: str) -> None:
        self.response = response
        self.last_system = ""
        self.last_user = ""

    async def complete(self, system: str, user: str) -> str:
        self.last_system = system
        self.last_user = user
        return self.response


def test_router_prompt_contains_manifest_and_route_rules() -> None:
    request = SkillRouteInput(prompt="正方体棱长 2，求 A1B 与平面 ABCD 的夹角")
    system, user = build_router_prompt(
        request=request,
        manifests=get_skill_manifests(),
    )

    assert "never solve the final answer" in system
    assert "Do not assume the only skill is solid_geometry. The skill list is dynamic." in system
    assert "SkillRouteMatch JSON schema" in user
    assert "solid_geometry" in user
    assert "cube.line_plane_angle" in user


@pytest.mark.asyncio
async def test_llm_router_provider_parses_skill_route_match_json() -> None:
    llm = _RouterLLM(
        """```json
{"skill_id":"solid_geometry","domain":"math","confidence":0.8,"reason":"supported","capability_id":"cube.line_plane_angle"}
```"""
    )
    provider = LLMRouterProvider(llm, model_name="router-test")

    route = await provider.route(
        request=SkillRouteInput(prompt="正方体棱长 2，求 A1B 与平面 ABCD 的夹角"),
        manifests=get_skill_manifests(),
    )

    assert isinstance(route, SkillRouteMatch)
    assert route.skill_id == "solid_geometry"
    assert llm.last_system


@pytest.mark.asyncio
async def test_llm_router_provider_parses_null_fallback() -> None:
    provider = LLMRouterProvider(_RouterLLM("null"), model_name="router-test")

    route = await provider.route(
        request=SkillRouteInput(prompt="解释概率密度函数"),
        manifests=get_skill_manifests(),
    )

    assert route is None


@pytest.mark.asyncio
async def test_llm_router_provider_invalid_json_raises_for_pipeline_fallback() -> None:
    provider = LLMRouterProvider(_RouterLLM("not json"))

    with pytest.raises(ValueError):
        await provider.route(
            request=SkillRouteInput(prompt="x"),
            manifests=get_skill_manifests(),
        )
