from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel

from app.domain.skills.base import (
    SkillExecutionContext,
    SkillExecutionResult,
    SkillRouteInput,
    SkillRouteMatch,
)
from app.domain.skills.geography_climate.climate_kernel import solve_climate_problem
from app.domain.skills.geography_climate.manifest import GEOGRAPHY_CLIMATE_MANIFEST
from app.domain.skills.geography_climate.playbook_adapter import build_geography_climate_playbook
from app.domain.skills.geography_climate.problem_spec import GeographyClimateProblemSpec
from app.domain.skills.geography_climate.spec_extractor import try_extract_geography_climate

logger = logging.getLogger(__name__)


class GeographyClimateSkillPack:
    manifest = GEOGRAPHY_CLIMATE_MANIFEST

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        spec = try_extract_geography_climate(request.prompt)
        if spec is None:
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.86,
            capability_id=f"geography_climate.{spec.kind}",
            reason="Detected supported deterministic offline climate-normal prompt.",
            problem_spec=spec.model_dump(mode="json"),
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> GeographyClimateProblemSpec | None:
        try:
            return GeographyClimateProblemSpec.model_validate(data)
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
                fallback_reason="unsupported_geography_climate",
            )
        try:
            solution = solve_climate_problem(spec)
            playbook = build_geography_climate_playbook(context.run_id, solution)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Geography climate skill failed: %s", exc)
            return SkillExecutionResult(
                handled=False,
                fallback_reason="geography_climate_error",
            )
        return SkillExecutionResult(
            handled=True,
            playbook_json=playbook.model_dump_json(),
            review_actions=[
                "skill:geography_climate",
                f"skill_capability:geography_climate.{spec.kind}",
            ],
        )


def _coerce_or_extract(
    prompt: str,
    problem_spec: BaseModel | None,
) -> GeographyClimateProblemSpec | None:
    if problem_spec is None:
        return try_extract_geography_climate(prompt)
    if isinstance(problem_spec, GeographyClimateProblemSpec):
        return problem_spec
    return GeographyClimateProblemSpec.model_validate(problem_spec.model_dump(mode="json"))
