"""Every SkillPack manifest example must route back to its own skill.

Issue #282: constant per-skill confidences let a greedy extractor steal
another skill's documented example (an eigenvalue prompt claimed by the
statistics pack; a Dijkstra prompt claimed as a linear system and then
rejected as unsupported). This suite turns the invariant into data-driven
regression coverage over all manifests.
"""

from __future__ import annotations

import pytest

from app.domain.skills.base import SkillRouteInput
from app.domain.skills.registry import build_default_skill_registry

_REGISTRY = build_default_skill_registry()

_CASES = [
    pytest.param(skill.manifest.skill_id, example, id=f"{capability.capability_id}:{example}")
    for skill in _REGISTRY.all()
    for capability in skill.manifest.capabilities
    for example in capability.examples
]


@pytest.mark.parametrize(("skill_id", "example"), _CASES)
def test_manifest_example_routes_to_its_own_skill(skill_id: str, example: str) -> None:
    match = _REGISTRY.heuristic_match(
        SkillRouteInput(prompt=example, source_code=None, language=None)
    )

    assert match is not None, f"no skill claimed the manifest example {example!r}"
    assert match.skill_id == skill_id, (
        f"{example!r} routed to {match.skill_id!r} instead of {skill_id!r} "
        f"(confidence {match.confidence})"
    )


def test_eigen_prompt_not_claimed_by_statistics() -> None:
    match = _REGISTRY.heuristic_match(
        SkillRouteInput(prompt="求 A=[[1,2],[3,4]] 的特征值", source_code=None, language=None)
    )

    assert match is not None
    assert match.skill_id == "linear_algebra"
    assert match.capability_id == "linear_algebra.eigen_basic"


def test_dijkstra_prompt_not_claimed_as_linear_system() -> None:
    match = _REGISTRY.heuristic_match(
        SkillRouteInput(
            prompt="解释 Dijkstra：A->B=2, B->C=1，求 A 到 C 最短路",
            source_code=None,
            language=None,
        )
    )

    assert match is not None
    assert match.skill_id == "algorithm_graph_core"
