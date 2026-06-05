from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from app.domain.models.route_decision import RouteDecision
from app.domain.skills.base import SkillRouteInput, SkillRouteMatch
from app.domain.skills.registry import build_default_skill_registry, get_skill_manifests


def test_route_decision_validates_supported_solid_geometry_spec() -> None:
    route = RouteDecision(
        destination="deterministic_skill",
        domain="math",
        skill_id="solid_geometry",
        confidence=0.94,
        matched_capability="regular_quad_pyramid.line_plane_angle",
        problem_spec={
            "body": "regular_quad_pyramid",
            "dimensions": {"base": "2", "height": "3"},
            "query": {
                "kind": "line_plane_angle",
                "line": {"through": ["S", "A"]},
                "plane": {"through": ["A", "B", "C"]},
            },
        },
    )

    assert route.destination == "deterministic_skill"
    assert route.problem_spec is not None


def test_route_decision_rejects_router_final_answer_fields() -> None:
    with pytest.raises(ValidationError):
        RouteDecision(
            destination="deterministic_skill",
            domain="math",
            skill_id="solid_geometry",
            confidence=0.94,
            problem_spec={
                "body": "regular_quad_pyramid",
                "dimensions": {"base": "2", "height": "3"},
                "query": {"kind": "volume"},
                "answer_latex": "\\theta=1",
            },
        )


def test_skill_route_match_rejects_router_final_answer_fields() -> None:
    with pytest.raises(ValidationError):
        SkillRouteMatch(
            skill_id="solid_geometry",
            domain="math",
            confidence=0.94,
            problem_spec={
                "body": "regular_quad_pyramid",
                "dimensions": {"base": "2", "height": "3"},
                "query": {"kind": "volume"},
                "answer_latex": "\\theta=1",
            },
        )


def test_skill_manifests_are_serializable() -> None:
    payload = [manifest.model_dump(mode="json") for manifest in get_skill_manifests()]

    assert payload[0]["skill_id"] == "solid_geometry"
    assert "regular_quad_pyramid.line_plane_angle" in json.dumps(payload, ensure_ascii=False)


def test_registry_heuristic_uses_spec_extractor_as_skill_fallback() -> None:
    route = build_default_skill_registry().heuristic_match(
        SkillRouteInput(
            prompt="正四棱锥 S-ABCD，底面边长为 2，高为 3，求 SA 与底面 ABCD 的线面角"
        )
    )

    assert route is not None
    assert route.skill_id == "solid_geometry"
    assert route.problem_spec is not None


def test_registry_heuristic_keeps_unsupported_geometry_out_of_kernel() -> None:
    route = build_default_skill_registry().heuristic_match(
        SkillRouteInput(prompt="正四棱锥 S-ABCD，求二面角 S-AB-C")
    )

    assert route is not None
    assert route.skill_id == "solid_geometry"
    assert route.problem_spec is None
    assert route.needs_refinement is True
