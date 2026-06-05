from __future__ import annotations

from app.domain.skills.base import SkillCapability, SkillManifest

SOLID_GEOMETRY_MANIFEST = SkillManifest(
    skill_id="solid_geometry",
    domain="math",
    name="Solid Geometry",
    description=(
        "Deterministic solid geometry skill using coordinate systems and vectors."
    ),
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="cube.line_plane_angle",
            description="Cube line-plane angle with explicit side length and point labels.",
            supported=True,
            examples=[
                "正方体 ABCD-A1B1C1D1，棱长 2，求 A1B 与平面 ABCD 的夹角",
            ],
            output_schema="SolidGeometryProblemSpec",
        ),
        SkillCapability(
            capability_id="regular_quad_pyramid.line_plane_angle",
            description="Regular square pyramid line-plane angle with base side and height.",
            supported=True,
            examples=[
                "正四棱锥 S-ABCD，底面边长为 2，高为 3，求 SA 与底面 ABCD 的线面角",
            ],
            output_schema="SolidGeometryProblemSpec",
        ),
        SkillCapability(
            capability_id="cuboid.volume",
            description="Cuboid volume with length, width, height.",
            supported=True,
            examples=[
                "长方体长 2 宽 3 高 4，求体积",
            ],
            output_schema="SolidGeometryProblemSpec",
        ),
        SkillCapability(
            capability_id="solid_geometry.dihedral_angle",
            description="Dihedral angle.",
            supported=False,
        ),
        SkillCapability(
            capability_id="solid_geometry.point_plane_distance",
            description="Point-to-plane distance.",
            supported=False,
        ),
    ],
    unsupported_notes=[
        "Do not solve final answers in the router.",
        "Unsupported geometry query kinds should fall back or fail controlled.",
    ],
)
