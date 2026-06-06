from __future__ import annotations

from app.domain.skills.base import SkillCapability, SkillManifest

QUADRATIC_TRANSFORM_MANIFEST = SkillManifest(
    skill_id="quadratic_transform",
    domain="math",
    name="Quadratic Transform",
    description=(
        "Deterministic visual explanations for quadratic graph transformations "
        "in vertex form y=a(x-h)^2+k."
    ),
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="quadratic_transform.vertex_form",
            description=(
                "Explain graph transformations from y=x^2 to vertex-form "
                "quadratics y=a(x-h)^2+k."
            ),
            supported=True,
            examples=[
                "解释 y=(x-2)^2+1 的图像变换",
                "讲一下 y=2(x+1)^2-3 是怎么从 y=x^2 变来的",
                "解释 y=-(x-1)^2 的开口和平移",
            ],
            output_schema="QuadraticTransformProblemSpec",
        ),
    ],
    unsupported_notes=[
        "V1 only supports vertex-form quadratics.",
        "Expanded forms such as y=x^2+2x+1 should fall back to the generic pipeline.",
    ],
)
