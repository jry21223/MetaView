from __future__ import annotations

from app.domain.skills.base import (
    SkillManifest,
    SkillPack,
    SkillRouteInput,
    SkillRouteMatch,
)


class SkillRegistry:
    def __init__(self, skills: list[SkillPack]) -> None:
        self._skills = {skill.manifest.skill_id: skill for skill in skills}

    def all(self) -> list[SkillPack]:
        return list(self._skills.values())

    def manifests(self) -> list[SkillManifest]:
        return [skill.manifest for skill in self._skills.values()]

    def get(self, skill_id: str) -> SkillPack | None:
        return self._skills.get(skill_id)

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        matches = [
            match
            for skill in self.all()
            if (match := skill.heuristic_match(request)) is not None
        ]
        if not matches:
            return None
        return max(matches, key=lambda match: match.confidence)


def build_default_skill_registry() -> SkillRegistry:
    from app.domain.skills.quadratic_transform.skill_pack import QuadraticTransformSkillPack
    from app.domain.skills.solid_geometry.skill_pack import SolidGeometrySkillPack

    return SkillRegistry([
        SolidGeometrySkillPack(),
        QuadraticTransformSkillPack(),
    ])


def get_skill_manifests() -> list[SkillManifest]:
    return build_default_skill_registry().manifests()


__all__ = [
    "SkillManifest",
    "SkillPack",
    "SkillRegistry",
    "SkillRouteInput",
    "SkillRouteMatch",
    "build_default_skill_registry",
    "get_skill_manifests",
]
