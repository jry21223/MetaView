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
from app.domain.skills.solid_geometry.geometry_kernel import solve_solid_geometry
from app.domain.skills.solid_geometry.manifest import SOLID_GEOMETRY_MANIFEST
from app.domain.skills.solid_geometry.playbook_adapter import (
    build_solid_geometry_playbook,
    validate_solution_playbook_consistency,
)
from app.domain.skills.solid_geometry.problem_spec import SolidGeometryProblemSpec
from app.domain.skills.solid_geometry.spec_extractor import extract_solid_geometry_spec
from app.domain.skills.solid_geometry.triggers import match_solid_geometry_prompt

logger = logging.getLogger(__name__)

_SUPPORTED_QUERY_KINDS = frozenset({"line_plane_angle", "volume"})


class SolidGeometrySkillPack:
    manifest = SOLID_GEOMETRY_MANIFEST

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        spec = extract_solid_geometry_spec(request.prompt)
        if spec is not None:
            return SkillRouteMatch(
                skill_id=self.manifest.skill_id,
                domain=self.manifest.domain,
                confidence=0.82,
                capability_id=f"{spec.body}.{spec.query.kind}",
                reason="solid geometry heuristic extractor produced a valid spec",
                problem_spec=spec.model_dump(mode="json"),
            )
        if not match_solid_geometry_prompt(request.prompt):
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.56,
            capability_id="solid_geometry.unsupported",
            reason="solid geometry trigger matched but no supported ProblemSpec was extracted",
            needs_refinement=True,
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> SolidGeometryProblemSpec | None:
        try:
            return SolidGeometryProblemSpec.model_validate(data)
        except Exception:  # noqa: BLE001 - invalid router specs should fall back.
            return None

    async def execute(
        self,
        context: SkillExecutionContext,
        problem_spec: BaseModel | None,
    ) -> SkillExecutionResult:
        if problem_spec is None:
            return SkillExecutionResult(
                handled=False,
                fallback_reason="solid_geometry_missing_problem_spec",
            )
        spec = _coerce_spec(problem_spec)
        if spec.query.kind not in _SUPPORTED_QUERY_KINDS:
            return SkillExecutionResult(
                handled=False,
                fallback_reason="unsupported_deterministic_capability",
            )
        try:
            solution = solve_solid_geometry(spec)
            playbook = build_solid_geometry_playbook(
                solution,
                run_id=context.run_id,
                prompt=context.prompt,
            )
            validate_solution_playbook_consistency(solution, playbook)
        except AssertionError:
            raise
        except ValueError as exc:
            logger.warning("Solid geometry kernel rejected routed spec: %s", exc)
            return SkillExecutionResult(
                handled=False,
                fallback_reason="solid_geometry_kernel_value_error",
            )
        return SkillExecutionResult(
            handled=True,
            playbook_json=playbook.model_dump_json(),
            review_actions=[
                "skill:solid_geometry",
                f"skill_capability:{spec.body}.{spec.query.kind}",
            ],
        )


def _coerce_spec(problem_spec: BaseModel) -> SolidGeometryProblemSpec:
    if isinstance(problem_spec, SolidGeometryProblemSpec):
        return problem_spec
    return SolidGeometryProblemSpec.model_validate(problem_spec.model_dump(mode="json"))
