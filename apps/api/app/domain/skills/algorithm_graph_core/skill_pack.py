from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel

from app.domain.skills.algorithm_graph_core.graph_kernel import solve_graph_problem
from app.domain.skills.algorithm_graph_core.manifest import ALGORITHM_GRAPH_CORE_MANIFEST
from app.domain.skills.algorithm_graph_core.playbook_adapter import build_algorithm_graph_playbook
from app.domain.skills.algorithm_graph_core.problem_spec import AlgorithmGraphProblemSpec
from app.domain.skills.algorithm_graph_core.spec_extractor import try_extract_algorithm_graph
from app.domain.skills.base import (
    SkillExecutionContext,
    SkillExecutionResult,
    SkillRouteInput,
    SkillRouteMatch,
)

logger = logging.getLogger(__name__)


class AlgorithmGraphCoreSkillPack:
    manifest = ALGORITHM_GRAPH_CORE_MANIFEST

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        spec = try_extract_algorithm_graph(request.prompt)
        if spec is None:
            return None
        return SkillRouteMatch(
            skill_id=self.manifest.skill_id,
            domain=self.manifest.domain,
            confidence=0.86,
            capability_id=f"algorithm_graph_core.{spec.kind}",
            reason="Detected supported deterministic graph algorithm prompt.",
            problem_spec=spec.model_dump(mode="json"),
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> AlgorithmGraphProblemSpec | None:
        try:
            return AlgorithmGraphProblemSpec.model_validate(data)
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
                fallback_reason="unsupported_algorithm_graph_core",
            )
        try:
            solution = solve_graph_problem(spec)
            playbook = build_algorithm_graph_playbook(context.run_id, solution)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Graph algorithm skill failed: %s", exc)
            return SkillExecutionResult(
                handled=False,
                fallback_reason="algorithm_graph_core_error",
            )
        return SkillExecutionResult(
            handled=True,
            playbook_json=playbook.model_dump_json(),
            review_actions=[
                "skill:algorithm_graph_core",
                f"skill_capability:algorithm_graph_core.{spec.kind}",
            ],
        )


def _coerce_or_extract(
    prompt: str,
    problem_spec: BaseModel | None,
) -> AlgorithmGraphProblemSpec | None:
    if problem_spec is None:
        return try_extract_algorithm_graph(prompt)
    if isinstance(problem_spec, AlgorithmGraphProblemSpec):
        return problem_spec
    return AlgorithmGraphProblemSpec.model_validate(problem_spec.model_dump(mode="json"))

