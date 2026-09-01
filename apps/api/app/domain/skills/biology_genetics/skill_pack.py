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
from app.domain.skills.biology_genetics.genetics_kernel import solve_genetics_problem
from app.domain.skills.biology_genetics.manifest import BIOLOGY_GENETICS_MANIFEST
from app.domain.skills.biology_genetics.playbook_adapter import build_biology_genetics_playbook
from app.domain.skills.biology_genetics.problem_spec import BiologyGeneticsProblemSpec
from app.domain.skills.biology_genetics.spec_extractor import try_extract_biology_genetics

logger = logging.getLogger(__name__)


class BiologyGeneticsSkillPack:
    manifest = BIOLOGY_GENETICS_MANIFEST
    problem_spec_model = BiologyGeneticsProblemSpec

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        spec = try_extract_biology_genetics(request.prompt)
        if spec is None:
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.86,
            capability_id=f"biology_genetics.{spec.kind}",
            reason="Detected supported deterministic Mendelian genetics prompt.",
            problem_spec=spec.model_dump(mode="json"),
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> BiologyGeneticsProblemSpec | None:
        try:
            return BiologyGeneticsProblemSpec.model_validate(data)
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
                fallback_reason="unsupported_biology_genetics",
            )
        try:
            solution = solve_genetics_problem(spec)
            playbook = build_biology_genetics_playbook(context.run_id, solution)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Biology genetics skill failed: %s", exc)
            return SkillExecutionResult(
                handled=False,
                fallback_reason="biology_genetics_error",
            )
        return SkillExecutionResult(
            handled=True,
            playbook_json=playbook.model_dump_json(),
            review_actions=[
                "skill:biology_genetics",
                f"skill_capability:biology_genetics.{spec.kind}",
            ],
        )


def _coerce_or_extract(
    prompt: str,
    problem_spec: BaseModel | None,
) -> BiologyGeneticsProblemSpec | None:
    if problem_spec is None:
        return try_extract_biology_genetics(prompt)
    if isinstance(problem_spec, BiologyGeneticsProblemSpec):
        return problem_spec
    return BiologyGeneticsProblemSpec.model_validate(problem_spec.model_dump(mode="json"))
