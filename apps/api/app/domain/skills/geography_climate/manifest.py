from __future__ import annotations

from app.domain.skills.base import SkillCapability, SkillManifest

GEOGRAPHY_CLIMATE_MANIFEST = SkillManifest(
    skill_id="geography_climate",
    domain="geography",
    name="Geography Climate",
    description="Deterministic climate-normal summaries from checked-in offline teaching fixtures.",
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="geography_climate.station_normals_summary",
            description=(
                "Summarize monthly temperature and precipitation normals "
                "for fixture stations."
            ),
            examples=["离线教学站点 EDU_TEMPERATE 的气候常年值摘要"],
            output_schema="GeographyClimateProblemSpec",
        ),
        SkillCapability(
            capability_id="geography_climate.annual_temperature_mean",
            description="Compute annual mean temperature from monthly normals.",
            examples=["EDU_TEMPERATE 的年均温是多少"],
            output_schema="GeographyClimateProblemSpec",
        ),
        SkillCapability(
            capability_id="geography_climate.annual_precipitation_total",
            description="Compute annual precipitation total from monthly normals.",
            examples=["EDU_TEMPERATE 的年降水总量是多少"],
            output_schema="GeographyClimateProblemSpec",
        ),
        SkillCapability(
            capability_id="geography_climate.warmest_coldest_month",
            description="Identify warmest and coldest months from monthly temperature normals.",
            examples=["EDU_TEMPERATE 最热和最冷月份"],
            output_schema="GeographyClimateProblemSpec",
        ),
        SkillCapability(
            capability_id="geography_climate.wettest_driest_month",
            description="Identify wettest and driest months from monthly precipitation normals.",
            examples=["EDU_TEMPERATE 最湿和最干月份"],
            output_schema="GeographyClimateProblemSpec",
        ),
        SkillCapability(
            capability_id="geography_climate.station_comparison",
            description="Compare two fixture stations by annual temperature and precipitation.",
            examples=["比较 EDU_TEMPERATE 和 EDU_ARID 的年均温和年降水"],
            output_schema="GeographyClimateProblemSpec",
        ),
        SkillCapability(
            capability_id="geography_climate.anomaly_from_normal",
            description="Compute observed minus normal anomaly for an explicit month and value.",
            examples=["EDU_TEMPERATE 7月观测气温 28C，求距平"],
            output_schema="GeographyClimateProblemSpec",
        ),
    ],
    unsupported_notes=[
        "Fixture stations are offline educational normals, not live NOAA downloads.",
        "No arbitrary maps, spatial interpolation, or trend analysis.",
        "Unknown stations or missing month/unit data must fall back.",
    ],
)
