from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel

from app.domain.services.scene_blueprint_compiler import compile_scene_blueprint_to_playbook
from app.domain.skills.base import (
    SkillExecutionContext,
    SkillExecutionResult,
    SkillRouteInput,
    SkillRouteMatch,
)
from app.domain.skills.geography_earth.manifest import GEOGRAPHY_EARTH_MANIFEST
from app.domain.skills.geography_earth.problem_spec import GeographyEarthProblemSpec

logger = logging.getLogger(__name__)

_MONSOON_TERMS = ("东亚季风", "夏季风", "冬季风", "季风", "monsoon")
_EAST_ASIA_TERMS = ("东亚", "中国", "西太平洋", "western pacific", "east asia")


class GeographyEarthSkillPack:
    manifest = GEOGRAPHY_EARTH_MANIFEST

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        spec = try_extract_geography_earth(request.prompt)
        if spec is None:
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.9,
            capability_id=f"geography_earth.{spec.kind}",
            reason="Detected supported deterministic earth-system visual scene.",
            problem_spec=spec.model_dump(mode="json"),
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> GeographyEarthProblemSpec | None:
        try:
            return GeographyEarthProblemSpec.model_validate(data)
        except Exception:  # noqa: BLE001
            return None

    async def execute(
        self,
        context: SkillExecutionContext,
        problem_spec: BaseModel | None,
    ) -> SkillExecutionResult:
        spec = _coerce_or_extract(context.prompt, problem_spec)
        if spec is None:
            return SkillExecutionResult(
                handled=False,
                fallback_reason="unsupported_geography_earth",
            )
        try:
            playbook = compile_scene_blueprint_to_playbook(
                {
                    "id": spec.scene_type,
                    "subject": "geography",
                    "sceneType": spec.scene_type,
                    "title": "东亚季风",
                    "caption": "海陆热力差异驱动东亚季风、水汽输送和高低压配置。",
                    "packId": spec.pack_id,
                    "visualIntent": spec.visual_intent,
                    "emphasisPoints": spec.emphasis_points,
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Geography earth skill failed: %s", exc)
            return SkillExecutionResult(
                handled=False,
                fallback_reason="geography_earth_error",
            )
        return SkillExecutionResult(
            handled=True,
            playbook_json=playbook.model_dump_json(),
            review_actions=[
                "skill:geography_earth",
                f"skill_capability:geography_earth.{spec.kind}",
                "scene_blueprint:east_asia_monsoon",
            ],
        )


def try_extract_geography_earth(prompt: str) -> GeographyEarthProblemSpec | None:
    text = prompt.strip().lower()
    if not any(term.lower() in text for term in _MONSOON_TERMS):
        return None
    if not any(term.lower() in text for term in _EAST_ASIA_TERMS):
        return None
    return GeographyEarthProblemSpec(kind="east_asia_monsoon")


def _coerce_or_extract(
    prompt: str,
    problem_spec: BaseModel | None,
) -> GeographyEarthProblemSpec | None:
    if problem_spec is None:
        return try_extract_geography_earth(prompt)
    if isinstance(problem_spec, GeographyEarthProblemSpec):
        return problem_spec
    return GeographyEarthProblemSpec.model_validate(problem_spec.model_dump(mode="json"))
