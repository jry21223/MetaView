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
from app.domain.skills.elementary_algebra.manifest import ELEMENTARY_ALGEBRA_MANIFEST
from app.domain.skills.elementary_algebra.playbook_adapter import (
    build_elementary_algebra_playbook,
)
from app.domain.skills.elementary_algebra.problem_spec import ElementaryAlgebraProblemSpec
from app.domain.skills.elementary_algebra.spec_extractor import try_extract_elementary_algebra

logger = logging.getLogger(__name__)

_TASK_CAPABILITY_IDS = {
    "linear_equation": "elementary_algebra.equation_1var",
    "quadratic_equation": "elementary_algebra.equation_1var",
    "inequality": "elementary_algebra.inequality_1var",
    "factor_expression": "elementary_algebra.factor_expression",
}


class ElementaryAlgebraSkillPack:
    manifest = ELEMENTARY_ALGEBRA_MANIFEST

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        spec = try_extract_elementary_algebra(request.prompt)
        if spec is None:
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.86,
            capability_id=_TASK_CAPABILITY_IDS[spec.task],
            reason="Detected supported deterministic elementary algebra prompt.",
            problem_spec=spec.model_dump(mode="json"),
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> ElementaryAlgebraProblemSpec | None:
        try:
            return ElementaryAlgebraProblemSpec.model_validate(data)
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
                handled=False, fallback_reason="unsupported_elementary_algebra"
            )
        try:
            playbook = build_elementary_algebra_playbook(context.run_id, spec)
        except Exception as exc:  # noqa: BLE001 - skill failures should fall back.
            logger.warning("Elementary algebra skill failed: %s", exc)
            return SkillExecutionResult(handled=False, fallback_reason="elementary_algebra_error")
        return SkillExecutionResult(
            handled=True,
            playbook_json=playbook.model_dump_json(),
            review_actions=[
                "skill:elementary_algebra",
                f"skill_capability:{_TASK_CAPABILITY_IDS[spec.task]}",
            ],
        )


def _coerce_or_extract(
    prompt: str,
    problem_spec: BaseModel | None,
) -> ElementaryAlgebraProblemSpec | None:
    if problem_spec is None:
        return try_extract_elementary_algebra(prompt)
    if isinstance(problem_spec, ElementaryAlgebraProblemSpec):
        return problem_spec
    return ElementaryAlgebraProblemSpec.model_validate(problem_spec.model_dump(mode="json"))
