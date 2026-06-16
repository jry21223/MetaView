from __future__ import annotations

from app.domain.skills.base import SkillCapability, SkillManifest

PHYSICS_MECHANICS_MANIFEST = SkillManifest(
    skill_id="physics_mechanics",
    domain="physics",
    name="Physics Mechanics",
    description="Deterministic mechanics visual explanations for small numeric word problems.",
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="physics_mechanics.uniform_acceleration_1d",
            description="One-dimensional constant-acceleration kinematics.",
            examples=[
                "小球从静止开始做匀加速直线运动，加速度 2m/s²，求 5 秒后的速度和位移",
                "初速度 3m/s，加速度 2m/s²，运动 4 秒，求末速度和位移",
            ],
            output_schema="PhysicsMechanicsProblemSpec",
        ),
        SkillCapability(
            capability_id="physics_mechanics.projectile_motion",
            description="Horizontal and angled projectile motion without air resistance.",
            examples=[
                "一个物体以 10m/s 水平抛出，高度 20m，求落地时间和水平位移",
                "以 20m/s、30° 斜向上抛出，求最大高度和射程",
            ],
            output_schema="PhysicsMechanicsProblemSpec",
        ),
        SkillCapability(
            capability_id="physics_mechanics.newton_second_law",
            description="Single-body F=ma acceleration.",
            examples=["质量 2kg 的物体受到 10N 水平拉力，忽略摩擦，求加速度"],
            output_schema="PhysicsMechanicsProblemSpec",
        ),
        SkillCapability(
            capability_id="physics_mechanics.incline_force",
            description="Frictionless incline acceleration and weight decomposition.",
            examples=["斜面倾角 30°，物体质量 1kg，忽略摩擦，求沿斜面下滑的加速度"],
            output_schema="PhysicsMechanicsProblemSpec",
        ),
    ],
    unsupported_notes=[
        "No friction coefficient solving in V1.",
        "No air resistance, springs, collisions, pulleys, or multi-body systems.",
        "Prompts must include explicit numeric values and units.",
    ],
)
