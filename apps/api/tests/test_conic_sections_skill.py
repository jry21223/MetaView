from __future__ import annotations

import pytest

from app.application.services.coverage_resolver import DefaultCoverageResolver
from app.domain.models.playbook import MathSceneSnapshot, PlaybookScript
from app.domain.services.playbook_quality import quality_gate_playbook
from app.domain.skills.base import SkillExecutionContext, SkillRouteInput
from app.domain.skills.conic_sections.skill_pack import ConicSectionsSkillPack
from app.domain.skills.registry import build_default_skill_registry


def test_registry_routes_supported_ellipse_focus_definition() -> None:
    registry = build_default_skill_registry()
    match = registry.heuristic_match(
        SkillRouteInput(
            prompt="已知椭圆长半轴 a=6，短半轴 b=4，解释焦点定义和距离之和。"
        )
    )

    assert match is not None
    assert match.skill_id == "conic_sections"
    assert match.capability_id == "conic.ellipse.focus_definition"
    decision = DefaultCoverageResolver(skill_registry=registry).resolve(
        prompt="已知椭圆长半轴 a=6，短半轴 b=4，解释焦点定义和距离之和。",
        explicit_domain="math",
        route_match=match,
    )
    assert decision.mode == "specialized"
    assert decision.fallback_policy == "use_skill"


@pytest.mark.asyncio
async def test_skill_builds_a_valid_non_template_playbook() -> None:
    skill = ConicSectionsSkillPack()
    prompt = "请讲解椭圆的焦点定义，长半轴 a=6，短半轴 b=4，并验证距离之和。"
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None and match.problem_spec is not None

    result = await skill.execute(
        SkillExecutionContext(run_id="hidden-conic-test", prompt=prompt, route_match=match),
        skill.validate_problem_spec(match.problem_spec),
    )

    assert result.handled is True
    assert result.playbook_json is not None
    assert '"math_scene"' in result.playbook_json
    assert '"semantic_role":"conic_curve"' in result.playbook_json
    assert '"semantic_role":"focal_distance"' in result.playbook_json
    assert "PF1+PF2=12" in result.playbook_json
    assert "template" not in " ".join(result.review_actions).lower()
    report = quality_gate_playbook(
        PlaybookScript.model_validate_json(result.playbook_json),
        prompt,
        generator_path="skill_pack",
        coverage_mode="specialized",
    )
    assert report.status == "clean"
    assert report.issues == []


def test_unadapted_conic_topic_remains_experimental_instead_of_fake_specialized() -> None:
    registry = build_default_skill_registry()
    prompt = "研究双曲线与渐近线，并讨论面积最值。"
    assert registry.heuristic_match(SkillRouteInput(prompt=prompt)) is None
    decision = DefaultCoverageResolver(skill_registry=registry).resolve(
        prompt=prompt,
        explicit_domain="math",
    )
    assert decision.mode == "experimental"
    assert decision.fallback_policy == "text_only"


def test_math_scene_accepts_the_compatible_fixed_camera_hint() -> None:
    snapshot = MathSceneSnapshot(camera_mode="fixed")
    assert snapshot.kind == "math_scene"
    assert snapshot.camera_mode == "fixed"
