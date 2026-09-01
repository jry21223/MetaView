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
from app.domain.skills.linear_algebra.manifest import LINEAR_ALGEBRA_MANIFEST
from app.domain.skills.linear_algebra.playbook_adapter import build_linear_algebra_playbook
from app.domain.skills.linear_algebra.problem_spec import LinearAlgebraProblemSpec
from app.domain.skills.linear_algebra.spec_extractor import try_extract_linear_algebra

logger = logging.getLogger(__name__)


class LinearAlgebraSkillPack:
    manifest = LINEAR_ALGEBRA_MANIFEST
    problem_spec_model = LinearAlgebraProblemSpec

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        spec = try_extract_linear_algebra(request.prompt)
        if spec is None:
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.87,
            capability_id=f"linear_algebra.{spec.task}",
            reason="Detected supported deterministic linear algebra prompt.",
            problem_spec=spec.model_dump(mode="json"),
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> LinearAlgebraProblemSpec | None:
        try:
            return LinearAlgebraProblemSpec.model_validate(data)
        except Exception:  # noqa: BLE001
            return None

    async def execute(
        self,
        context: SkillExecutionContext,
        problem_spec: BaseModel | None,
    ) -> SkillExecutionResult:
        spec = _coerce_or_extract(context.prompt, problem_spec)
        if spec is None:
            return SkillExecutionResult(handled=False, fallback_reason="unsupported_linear_algebra")
        try:
            playbook = build_linear_algebra_playbook(context.run_id, spec)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Linear algebra skill failed: %s", exc)
            return SkillExecutionResult(handled=False, fallback_reason="linear_algebra_error")
        return SkillExecutionResult(
            handled=True,
            playbook_json=playbook.model_dump_json(),
            review_actions=[
                "skill:linear_algebra",
                f"skill_capability:linear_algebra.{spec.task}",
            ],
        )


def _coerce_or_extract(
    prompt: str, problem_spec: BaseModel | None
) -> LinearAlgebraProblemSpec | None:
    if problem_spec is None:
        return try_extract_linear_algebra(prompt)
    if isinstance(problem_spec, LinearAlgebraProblemSpec):
        return problem_spec
    return LinearAlgebraProblemSpec.model_validate(problem_spec.model_dump(mode="json"))
