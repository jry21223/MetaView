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
from app.domain.skills.calculus_core.manifest import CALCULUS_CORE_MANIFEST
from app.domain.skills.calculus_core.playbook_adapter import build_calculus_core_playbook
from app.domain.skills.calculus_core.problem_spec import CalculusCoreProblemSpec
from app.domain.skills.calculus_core.spec_extractor import try_extract_calculus_core

logger = logging.getLogger(__name__)


class CalculusCoreSkillPack:
    manifest = CALCULUS_CORE_MANIFEST
    problem_spec_model = CalculusCoreProblemSpec

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        spec = try_extract_calculus_core(request.prompt)
        if spec is None:
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.87,
            capability_id=f"calculus_core.{spec.task}",
            reason="Detected supported deterministic single-variable calculus prompt.",
            problem_spec=spec.model_dump(mode="json"),
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> CalculusCoreProblemSpec | None:
        try:
            return CalculusCoreProblemSpec.model_validate(data)
        except Exception:  # noqa: BLE001
            return None

    async def execute(
        self,
        context: SkillExecutionContext,
        problem_spec: BaseModel | None,
    ) -> SkillExecutionResult:
        spec = _coerce_or_extract(context.prompt, problem_spec)
        if spec is None:
            return SkillExecutionResult(handled=False, fallback_reason="unsupported_calculus_core")
        try:
            playbook = build_calculus_core_playbook(context.run_id, spec)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Calculus core skill failed: %s", exc)
            return SkillExecutionResult(handled=False, fallback_reason="calculus_core_error")
        return SkillExecutionResult(
            handled=True,
            playbook_json=playbook.model_dump_json(),
            review_actions=[
                "skill:calculus_core",
                f"skill_capability:calculus_core.{spec.task}",
            ],
        )


def _coerce_or_extract(
    prompt: str, problem_spec: BaseModel | None
) -> CalculusCoreProblemSpec | None:
    if problem_spec is None:
        return try_extract_calculus_core(prompt)
    if isinstance(problem_spec, CalculusCoreProblemSpec):
        return problem_spec
    return CalculusCoreProblemSpec.model_validate(problem_spec.model_dump(mode="json"))
