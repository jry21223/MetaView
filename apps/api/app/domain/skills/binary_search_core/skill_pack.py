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
from app.domain.skills.binary_search_core.manifest import BINARY_SEARCH_CORE_MANIFEST
from app.domain.skills.binary_search_core.playbook_adapter import build_binary_search_playbook
from app.domain.skills.binary_search_core.problem_spec import BinarySearchProblemSpec
from app.domain.skills.binary_search_core.search_kernel import solve_binary_search
from app.domain.skills.binary_search_core.spec_extractor import try_extract_binary_search

logger = logging.getLogger(__name__)


class BinarySearchCoreSkillPack:
    manifest = BINARY_SEARCH_CORE_MANIFEST

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        if request.source_code and request.source_code.strip():
            return None
        spec = try_extract_binary_search(request.prompt)
        if spec is None:
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.97,
            capability_id="binary_search_core.trace",
            reason="Detected a supported deterministic binary-search trace.",
            problem_spec=spec.model_dump(mode="json"),
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> BinarySearchProblemSpec | None:
        try:
            return BinarySearchProblemSpec.model_validate(data)
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
                fallback_reason="unsupported_binary_search_core",
            )
        try:
            solution = solve_binary_search(spec)
            playbook = build_binary_search_playbook(context.run_id, solution)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Binary-search skill failed: %s", exc)
            return SkillExecutionResult(
                handled=False,
                fallback_reason="binary_search_core_error",
            )
        return SkillExecutionResult(
            handled=True,
            playbook_json=playbook.model_dump_json(),
            review_actions=[
                "skill:binary_search_core",
                "skill_capability:binary_search_core.trace",
            ],
        )


def _coerce_or_extract(
    prompt: str,
    problem_spec: BaseModel | None,
) -> BinarySearchProblemSpec | None:
    if problem_spec is None:
        return try_extract_binary_search(prompt)
    if isinstance(problem_spec, BinarySearchProblemSpec):
        return problem_spec
    return BinarySearchProblemSpec.model_validate(problem_spec.model_dump(mode="json"))
