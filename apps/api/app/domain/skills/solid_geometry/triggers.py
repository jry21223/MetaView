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
        keywords=("solid geometry", "tetrahedron", "prism", "pyramid", "line_be"),
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
