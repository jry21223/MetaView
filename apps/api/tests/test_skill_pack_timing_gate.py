from __future__ import annotations

from typing import Any

import pytest

from app.domain.models.playbook import PlaybookScript
from app.domain.services.playbook_quality import quality_gate_playbook
from app.domain.skills.algorithm_graph_core.skill_pack import AlgorithmGraphCoreSkillPack
from app.domain.skills.base import SkillExecutionContext, SkillRouteInput
from app.domain.skills.biology_genetics.skill_pack import BiologyGeneticsSkillPack
from app.domain.skills.calculus_core.skill_pack import CalculusCoreSkillPack
from app.domain.skills.chemistry_stoichiometry.skill_pack import ChemistryStoichiometrySkillPack
from app.domain.skills.conic_sections.skill_pack import ConicSectionsSkillPack
from app.domain.skills.elementary_algebra.skill_pack import ElementaryAlgebraSkillPack
from app.domain.skills.geography_climate.skill_pack import GeographyClimateSkillPack
from app.domain.skills.linear_algebra.skill_pack import LinearAlgebraSkillPack
from app.domain.skills.physics_mechanics.skill_pack import PhysicsMechanicsSkillPack
from app.domain.skills.probability_statistics_core.skill_pack import (
    ProbabilityStatisticsCoreSkillPack,
)
from app.domain.skills.quadratic_transform.skill_pack import QuadraticTransformSkillPack
from app.domain.skills.solid_geometry.skill_pack import SolidGeometrySkillPack

_TIMELINE_CODES = {
    "timeline.voiceover_too_short",
    "timeline.non_monotonic",
    "timeline.exceeds_total_frames",
}


def _skill_cases() -> list[tuple[Any, str]]:
    return [
        (AlgorithmGraphCoreSkillPack(), "用 BFS 遍历图 A-B, A-C, B-D, C-D，从 A 开始"),
        (BiologyGeneticsSkillPack(), "A 对 a 显性，亲本 Aa x Aa，求基因型比例、表现型比例和 P(aa)"),
        (CalculusCoreSkillPack(), "求 y=x^2 的导数"),
        (ChemistryStoichiometrySkillPack(), "配平方程式：H2 + O2 -> H2O"),
        (ConicSectionsSkillPack(), "请讲解椭圆的焦点定义，长半轴 a=6，短半轴 b=4，并验证距离之和。"),
        (ElementaryAlgebraSkillPack(), "解方程 2x + 3 = 7"),
        (GeographyClimateSkillPack(), "离线教学站点 EDU_TEMPERATE 的气候常年值摘要"),
        (LinearAlgebraSkillPack(), "解线性方程组 2x+y=5, x-y=1"),
        (PhysicsMechanicsSkillPack(), "小球从静止开始做匀加速直线运动，加速度 2m/s²，求 5 秒后的速度和位移"),
        (
            ProbabilityStatisticsCoreSkillPack(),
            "总体数据 [2,4,4,4,5,5,7,9]，求均值、中位数、众数和极差",
        ),
        (QuadraticTransformSkillPack(), "把 y=x^2 平移到顶点 (2,3)，a=2，求目标函数"),
        (SolidGeometrySkillPack(), "正四棱锥 S-ABCD，底面边长为 2，高为 3，求 SA 与底面 ABCD 所成的角"),
    ]


@pytest.mark.parametrize(
    ("skill", "prompt"),
    [pytest.param(skill, prompt, id=skill.__class__.__name__) for skill, prompt in _skill_cases()],
)
async def test_skill_pack_playbooks_pass_canonical_timeline_gate(skill: Any, prompt: str) -> None:
    match = skill.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None
    spec = skill.validate_problem_spec(match.problem_spec or {})
    assert spec is not None

    result = await skill.execute(
        SkillExecutionContext(run_id="timing-gate", prompt=prompt, route_match=match),
        spec,
    )
    assert result.handled is True

    playbook = PlaybookScript.model_validate_json(result.playbook_json)
    report = quality_gate_playbook(playbook, prompt, generator_path="skill_pack")

    timeline_issues = [issue for issue in report.issues if issue.code in _TIMELINE_CODES]
    assert not timeline_issues, [
        f"{issue.code} at {issue.path}: {issue.message}" for issue in timeline_issues
    ]
