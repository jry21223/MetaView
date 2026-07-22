from app.domain.skills.base import SkillCapability, SkillManifest

CONIC_SECTIONS_MANIFEST = SkillManifest(
    skill_id="conic_sections",
    domain="math",
    name="High-school conic sections",
    description=(
        "Routes high-school conic-section lessons and provides a deterministic "
        "ellipse focus-definition capability without embedding benchmark answers."
    ),
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="conic.ellipse.focus_definition",
            description="Explain and verify the focal-distance definition of a standard ellipse.",
            supported=True,
            examples=[
                "椭圆 a=6,b=4，解释焦点定义",
                "演示椭圆上动点到两焦点距离之和为什么等于 2a",
            ],
            output_schema="ConicEllipseFocusProblemSpec",
        ),
    ],
    unsupported_notes=[
        "Other conic archetypes remain composable/generic until their deterministic adapters land.",
        "The skill contains no public frozen Playbook and no hidden-case answer table.",
        "Area extrema and arbitrary rotated conics remain experimental.",
    ],
)
