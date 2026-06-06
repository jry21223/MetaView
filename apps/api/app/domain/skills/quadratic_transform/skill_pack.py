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
from app.domain.skills.quadratic_transform.manifest import QUADRATIC_TRANSFORM_MANIFEST
from app.domain.skills.quadratic_transform.playbook_adapter import (
    build_quadratic_transform_playbook,
)
from app.domain.skills.quadratic_transform.problem_spec import QuadraticTransformProblemSpec
from app.domain.skills.quadratic_transform.spec_extractor import (
    try_extract_quadratic_transform,
)

logger = logging.getLogger(__name__)


class QuadraticTransformSkillPack:
    manifest = QUADRATIC_TRANSFORM_MANIFEST

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        spec = try_extract_quadratic_transform(request.prompt)
        if spec is None:
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.88,
            capability_id="quadratic_transform.vertex_form",
            reason="Detected supported quadratic vertex-form graph transformation.",
            problem_spec=spec.model_dump(mode="json"),
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> QuadraticTransformProblemSpec | None:
        try:
            return QuadraticTransformProblemSpec.model_validate(data)
        except Exception:  # noqa: BLE001 - invalid router specs should fall back.
            return None

    async def execute(
        self,
        context: SkillExecutionContext,
        problem_spec: BaseModel | None,
    ) -> SkillExecutionResult:
        if problem_spec is None:
            spec = try_extract_quadratic_transform(context.prompt)
            if spec is None:
                return SkillExecutionResult(
                    handled=False,
                    fallback_reason="unsupported_quadratic_transform_form",
                )
        else:
            spec = _coerce_spec(problem_spec)

        try:
            playbook = build_quadratic_transform_playbook(context.run_id, spec)
        except ValueError as exc:
            logger.warning("Quadratic transform skill rejected spec: %s", exc)
            return SkillExecutionResult(
                handled=False,
                fallback_reason="quadratic_transform_value_error",
            )

        return SkillExecutionResult(
            handled=True,
            playbook_json=playbook.model_dump_json(),
            review_actions=[
                "skill:quadratic_transform",
                "skill_capability:quadratic_transform.vertex_form",
            ],
        )


def _coerce_spec(problem_spec: BaseModel) -> QuadraticTransformProblemSpec:
    if isinstance(problem_spec, QuadraticTransformProblemSpec):
        return problem_spec
    return QuadraticTransformProblemSpec.model_validate(problem_spec.model_dump(mode="json"))
