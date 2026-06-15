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
from app.domain.skills.chemistry_stoichiometry.manifest import (
    CHEMISTRY_STOICHIOMETRY_MANIFEST,
)
from app.domain.skills.chemistry_stoichiometry.playbook_adapter import (
    build_chemistry_stoichiometry_playbook,
)
from app.domain.skills.chemistry_stoichiometry.problem_spec import (
    ChemistryStoichiometryProblemSpec,
)
from app.domain.skills.chemistry_stoichiometry.spec_extractor import (
    try_extract_chemistry_stoichiometry,
)
from app.domain.skills.chemistry_stoichiometry.stoichiometry_kernel import (
    solve_stoichiometry,
)

logger = logging.getLogger(__name__)


class ChemistryStoichiometrySkillPack:
    manifest = CHEMISTRY_STOICHIOMETRY_MANIFEST

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        spec = try_extract_chemistry_stoichiometry(request.prompt)
        if spec is None:
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.86,
            capability_id=f"chemistry_stoichiometry.{spec.kind}",
            reason="Detected supported deterministic stoichiometry prompt.",
            problem_spec=spec.model_dump(mode="json"),
        )

    def validate_problem_spec(
        self,
        data: dict[str, Any],
    ) -> ChemistryStoichiometryProblemSpec | None:
        try:
            return ChemistryStoichiometryProblemSpec.model_validate(data)
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
                fallback_reason="unsupported_chemistry_stoichiometry",
            )
        try:
            solution = solve_stoichiometry(spec)
            playbook = build_chemistry_stoichiometry_playbook(context.run_id, solution)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Chemistry stoichiometry skill failed: %s", exc)
            return SkillExecutionResult(
                handled=False,
                fallback_reason="chemistry_stoichiometry_error",
            )
        return SkillExecutionResult(
            handled=True,
            playbook_json=playbook.model_dump_json(),
            review_actions=[
                "skill:chemistry_stoichiometry",
                f"skill_capability:chemistry_stoichiometry.{spec.kind}",
            ],
        )


def _coerce_or_extract(
    prompt: str,
    problem_spec: BaseModel | None,
) -> ChemistryStoichiometryProblemSpec | None:
    if problem_spec is None:
        return try_extract_chemistry_stoichiometry(prompt)
    if isinstance(problem_spec, ChemistryStoichiometryProblemSpec):
        return problem_spec
    return ChemistryStoichiometryProblemSpec.model_validate(problem_spec.model_dump(mode="json"))
