from __future__ import annotations

from app.domain.skills.base import SkillCapability, SkillManifest

GEOGRAPHY_EARTH_MANIFEST = SkillManifest(
    skill_id="geography_earth",
    domain="geography",
    name="Geography Earth",
    description="Deterministic asset-backed earth-system visual scenes.",
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="geography_earth.east_asia_monsoon",
            description=(
                "East Asia monsoon map with land/ocean contrast, "
                "wind flow, and pressure centers."
            ),
            examples=[
                "讲解东亚夏季风的海陆热力差异",
                "画出东亚季风的风向、水汽和高低压中心",
            ],
            output_schema="GeographyEarthProblemSpec",
        )
    ],
    unsupported_notes=[
        "Only the east_asia_monsoon scene blueprint is supported in V1.",
        "No live map tiles, GIS service calls, or third-party screenshot assets.",
    ],
)
