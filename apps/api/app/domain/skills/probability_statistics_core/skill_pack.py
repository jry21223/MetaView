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
from app.domain.skills.probability_statistics_core.manifest import (
    PROBABILITY_STATISTICS_CORE_MANIFEST,
)
from app.domain.skills.probability_statistics_core.playbook_adapter import (
    build_probability_statistics_playbook,
)
from app.domain.skills.probability_statistics_core.problem_spec import (
    ProbabilityStatisticsProblemSpec,
)
from app.domain.skills.probability_statistics_core.spec_extractor import (
    try_extract_probability_statistics,
)
from app.domain.skills.probability_statistics_core.statistics_kernel import (
    solve_probability_statistics,
)

logger = logging.getLogger(__name__)


class ProbabilityStatisticsCoreSkillPack:
    manifest = PROBABILITY_STATISTICS_CORE_MANIFEST

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        spec = try_extract_probability_statistics(request.prompt)
        if spec is None:
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.9,
            capability_id=f"probability_statistics_core.{spec.kind}",
            reason="Detected supported deterministic probability/statistics prompt.",
            problem_spec=spec.model_dump(mode="json"),
        )

    def validate_problem_spec(
        self,
        data: dict[str, Any],
    ) -> ProbabilityStatisticsProblemSpec | None:
        try:
            return ProbabilityStatisticsProblemSpec.model_validate(data)
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
                fallback_reason="unsupported_probability_statistics_core",
            )
        try:
            solution = solve_probability_statistics(spec)
            playbook = build_probability_statistics_playbook(context.run_id, solution)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Probability/statistics skill failed: %s", exc)
            return SkillExecutionResult(
                handled=False,
                fallback_reason="probability_statistics_core_error",
            )
        return SkillExecutionResult(
            handled=True,
            playbook_json=playbook.model_dump_json(),
            review_actions=[
                "skill:probability_statistics_core",
                f"skill_capability:probability_statistics_core.{spec.kind}",
            ],
        )


def _coerce_or_extract(
    prompt: str,
    problem_spec: BaseModel | None,
) -> ProbabilityStatisticsProblemSpec | None:
    if problem_spec is None:
        return try_extract_probability_statistics(prompt)
    if isinstance(problem_spec, ProbabilityStatisticsProblemSpec):
        return problem_spec
    return ProbabilityStatisticsProblemSpec.model_validate(problem_spec.model_dump(mode="json"))
