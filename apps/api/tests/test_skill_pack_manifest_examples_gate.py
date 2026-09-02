from __future__ import annotations

import pytest

from app.application.services.lesson_planner import build_rule_based_lesson_plan
from app.domain.models.playbook import PlaybookScript
from app.domain.models.review import PlaybookIssueSeverity
from app.domain.models.route_decision import RouteDecision
from app.domain.services.playbook_quality import quality_gate_playbook
from app.domain.skills.base import SkillExecutionContext, SkillRouteInput
from app.domain.skills.registry import build_default_skill_registry

# Every capability example a SkillPack advertises in its manifest must come
# out of that pack and pass the canonical gate the pipeline applies to it —
# the same LessonPlan, the same specialized coverage. The 2026-09 e2e run found
# 7/25 of these failing (#282–#286) and a later sweep found 5 more (末步不陈述
# 答案 in elementary_algebra / solid_geometry / contingency_table, missing
# gravity + parabolic facts in physics projectile); this keeps the whole set
# green instead of one pack at a time.


def _manifest_examples() -> list[pytest.param]:
    registry = build_default_skill_registry()
    cases: list[pytest.param] = []
    for manifest in registry.manifests():
        for capability in manifest.capabilities:
            if not capability.supported:
                continue
            for example in capability.examples:
                cases.append(
                    pytest.param(
                        manifest.skill_id,
                        example,
                        id=f"{capability.capability_id}:{example[:24]}",
                    )
                )
    return cases


@pytest.mark.parametrize(("skill_id", "prompt"), _manifest_examples())
@pytest.mark.asyncio
async def test_manifest_example_passes_canonical_gate(skill_id: str, prompt: str) -> None:
    registry = build_default_skill_registry()
    skill = registry.get(skill_id)
    assert skill is not None

    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None, f"{skill_id} does not match its own example: {prompt}"
    spec = skill.validate_problem_spec(match.problem_spec or {})
    assert spec is not None

    result = await skill.execute(
        SkillExecutionContext(run_id="manifest-examples-gate", prompt=prompt, route_match=match),
        spec,
    )
    assert result.handled is True, result.fallback_reason
    playbook = PlaybookScript.model_validate_json(result.playbook_json)

    lesson_plan = build_rule_based_lesson_plan(
        prompt=prompt,
        domain=skill.manifest.domain,
        route_decision=RouteDecision(
            destination="deterministic_skill",
            domain=skill.manifest.domain,
            skill_id=skill_id,
            confidence=match.confidence,
            reason=match.reason,
            matched_capability=match.capability_id,
            problem_spec=match.problem_spec,
        ),
    )
    report = quality_gate_playbook(
        playbook,
        prompt,
        generator_path="skill_pack",
        coverage_mode="specialized",
        lesson_plan=lesson_plan,
    )

    errors = [issue for issue in report.issues if issue.severity == PlaybookIssueSeverity.ERROR]
    assert not errors, [f"{issue.code} at {issue.path}: {issue.message}" for issue in errors]
