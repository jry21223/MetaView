from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SkillTrigger:
    skill_id: str
    keywords: tuple[str, ...]
    output_contract: str


SOLID_GEOMETRY_TRIGGERS: tuple[SkillTrigger, ...] = (
    SkillTrigger(
        skill_id="solid_geometry",
        keywords=(
            "立体几何",
            "线面角",
            "二面角",
            "异面直线",
            "点到平面距离",
            "正四棱锥",
            "正方体",
            "长方体",
            "solid geometry",
            "line-plane angle",
            "dihedral angle",
            "skew lines",
            "point-to-plane distance",
            "cube",
            "cuboid",
            "pyramid",
        ),
        output_contract="ProblemSpec -> PlaybookScript -> DirectorScript",
    ),
)


def match_solid_geometry_prompt(prompt: str) -> bool:
    normalized = prompt.lower()
    return any(
        keyword in normalized
        for trigger in SOLID_GEOMETRY_TRIGGERS
        for keyword in trigger.keywords
    )
