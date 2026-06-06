from __future__ import annotations

from app.domain.skills.base import SkillCapability, SkillManifest

CALCULUS_CORE_MANIFEST = SkillManifest(
    skill_id="calculus_core",
    domain="math",
    name="Calculus Core",
    description="Deterministic single-variable calculus explanations.",
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="calculus_core.derivative",
            description="Compute and explain single-variable derivatives.",
            examples=["求 d/dx (x^2 sin x)"],
            output_schema="CalculusCoreProblemSpec",
        ),
        SkillCapability(
            capability_id="calculus_core.integral_area",
            description="Compute and visualize definite integrals as area.",
            examples=["解释 int_0^1 x^2 dx 的面积"],
            output_schema="CalculusCoreProblemSpec",
        ),
        SkillCapability(
            capability_id="calculus_core.limit_1var",
            description="Compute supported one-variable limits.",
            examples=["求 lim x->0 sin(x)/x"],
            output_schema="CalculusCoreProblemSpec",
        ),
    ],
    unsupported_notes=["V1 intentionally excludes multivariable limits."],
)
