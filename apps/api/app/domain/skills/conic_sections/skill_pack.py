from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.domain.skills.base import (
    SkillExecutionContext,
    SkillExecutionResult,
    SkillRouteInput,
    SkillRouteMatch,
)
from app.domain.skills.conic_sections.manifest import CONIC_SECTIONS_MANIFEST
from app.domain.skills.conic_sections.playbook_adapter import build_ellipse_focus_playbook
from app.domain.skills.conic_sections.problem_spec import ConicEllipseFocusProblemSpec
from app.domain.skills.conic_sections.spec_extractor import try_extract_ellipse_focus_definition


class ConicSectionsSkillPack:
    manifest = CONIC_SECTIONS_MANIFEST
    problem_spec_model = ConicEllipseFocusProblemSpec

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        spec = try_extract_ellipse_focus_definition(request.prompt)
        if spec is None:
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.94,
            capability_id="conic.ellipse.focus_definition",
            reason="Detected a supported standard-ellipse focal-definition lesson.",
            problem_spec=spec.model_dump(mode="json"),
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> ConicEllipseFocusProblemSpec | None:
        try:
            return ConicEllipseFocusProblemSpec.model_validate(data)
        except Exception:  # noqa: BLE001 - invalid route evidence must not execute.
            return None

    async def execute(
        self,
        context: SkillExecutionContext,
        problem_spec: BaseModel | None,
    ) -> SkillExecutionResult:
        spec = (
            _coerce(problem_spec)
            if problem_spec is not None
            else try_extract_ellipse_focus_definition(context.prompt)
        )
        if spec is None:
            return SkillExecutionResult(
                handled=False,
                fallback_reason="unsupported_conic_archetype",
            )
        playbook = build_ellipse_focus_playbook(context.run_id, spec)
        return SkillExecutionResult(
            handled=True,
            playbook_json=playbook.model_dump_json(),
            review_actions=[
                "skill:conic_sections",
                "skill_capability:conic.ellipse.focus_definition",
                "math_fact:focal_distance_sum",
            ],
        )


def _coerce(problem_spec: BaseModel) -> ConicEllipseFocusProblemSpec:
    if isinstance(problem_spec, ConicEllipseFocusProblemSpec):
        return problem_spec
    return ConicEllipseFocusProblemSpec.model_validate(problem_spec.model_dump(mode="json"))
