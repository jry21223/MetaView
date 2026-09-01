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
from app.domain.skills.physics_mechanics.manifest import PHYSICS_MECHANICS_MANIFEST
from app.domain.skills.physics_mechanics.mechanics_kernel import solve_mechanics
from app.domain.skills.physics_mechanics.playbook_adapter import build_physics_mechanics_playbook
from app.domain.skills.physics_mechanics.problem_spec import PhysicsMechanicsProblemSpec
from app.domain.skills.physics_mechanics.spec_extractor import try_extract_physics_mechanics

logger = logging.getLogger(__name__)


class PhysicsMechanicsSkillPack:
    manifest = PHYSICS_MECHANICS_MANIFEST
    problem_spec_model = PhysicsMechanicsProblemSpec

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        spec = try_extract_physics_mechanics(request.prompt)
        if spec is None:
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.86,
            capability_id=f"physics_mechanics.{spec.kind}",
            reason="Detected supported deterministic mechanics prompt.",
            problem_spec=spec.model_dump(mode="json"),
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> PhysicsMechanicsProblemSpec | None:
        try:
            return PhysicsMechanicsProblemSpec.model_validate(data)
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
                fallback_reason="unsupported_physics_mechanics",
            )
        try:
            solution = solve_mechanics(spec)
            playbook = build_physics_mechanics_playbook(context.run_id, solution)
        except Exception as exc:  # noqa: BLE001 - deterministic skill failures should fall back.
            logger.warning("Physics mechanics skill failed: %s", exc)
            return SkillExecutionResult(
                handled=False,
                fallback_reason="physics_mechanics_error",
            )
        return SkillExecutionResult(
            handled=True,
            playbook_json=playbook.model_dump_json(),
            review_actions=[
                "skill:physics_mechanics",
                f"skill_capability:physics_mechanics.{spec.kind}",
            ],
        )


def _coerce_or_extract(
    prompt: str,
    problem_spec: BaseModel | None,
) -> PhysicsMechanicsProblemSpec | None:
    if problem_spec is None:
        return try_extract_physics_mechanics(prompt)
    if isinstance(problem_spec, PhysicsMechanicsProblemSpec):
        return problem_spec
    return PhysicsMechanicsProblemSpec.model_validate(problem_spec.model_dump(mode="json"))

