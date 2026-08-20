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
            match for skill in self.all() if (match := skill.heuristic_match(request)) is not None
        ]
        if not matches:
            return None
        return max(matches, key=lambda match: match.confidence)


def build_default_skill_registry() -> SkillRegistry:
    from app.domain.skills.algorithm_graph_core.skill_pack import AlgorithmGraphCoreSkillPack
    from app.domain.skills.biology_genetics.skill_pack import BiologyGeneticsSkillPack
    from app.domain.skills.calculus_core.skill_pack import CalculusCoreSkillPack
    from app.domain.skills.chemistry_stoichiometry.skill_pack import ChemistryStoichiometrySkillPack
    from app.domain.skills.conic_sections.skill_pack import ConicSectionsSkillPack
    from app.domain.skills.elementary_algebra.skill_pack import ElementaryAlgebraSkillPack
    from app.domain.skills.geography_climate.skill_pack import GeographyClimateSkillPack
    from app.domain.skills.geography_earth.skill_pack import GeographyEarthSkillPack
    from app.domain.skills.linear_algebra.skill_pack import LinearAlgebraSkillPack
    from app.domain.skills.physics_mechanics.skill_pack import PhysicsMechanicsSkillPack
    from app.domain.skills.probability_statistics_core.skill_pack import (
        ProbabilityStatisticsCoreSkillPack,
    )
    from app.domain.skills.quadratic_transform.skill_pack import QuadraticTransformSkillPack
    from app.domain.skills.solid_geometry.skill_pack import SolidGeometrySkillPack

    return SkillRegistry(
        [
            SolidGeometrySkillPack(),
            QuadraticTransformSkillPack(),
            ElementaryAlgebraSkillPack(),
            LinearAlgebraSkillPack(),
            CalculusCoreSkillPack(),
            ConicSectionsSkillPack(),
            PhysicsMechanicsSkillPack(),
            ChemistryStoichiometrySkillPack(),
            AlgorithmGraphCoreSkillPack(),
            BiologyGeneticsSkillPack(),
            ProbabilityStatisticsCoreSkillPack(),
            GeographyEarthSkillPack(),
            GeographyClimateSkillPack(),
        ]
    )


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
