from __future__ import annotations

from app.domain.skills.base import SkillCapability, SkillManifest

LINEAR_ALGEBRA_MANIFEST = SkillManifest(
    skill_id="linear_algebra",
    domain="math",
    name="Linear Algebra",
    description="Deterministic matrix and linear-system explanations.",
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="linear_algebra.eigen_basic",
            description="Explain basic eigenvalue computation for explicit small matrices.",
            examples=["求 A=[[1,2],[3,4]] 的特征值"],
            output_schema="LinearAlgebraProblemSpec",
        ),
        SkillCapability(
            capability_id="linear_algebra.rref",
            description="Show row-reduction / RREF for explicit matrices.",
            examples=["对 [[1,2,3],[3,4,7]] 做高斯消元"],
            output_schema="LinearAlgebraProblemSpec",
        ),
        SkillCapability(
            capability_id="linear_algebra.solve_system",
            description="Convert a linear equation system to an augmented matrix and solve.",
            examples=["解方程组 x+2y=3, 3x-y=5"],
            output_schema="LinearAlgebraProblemSpec",
        ),
    ],
    unsupported_notes=["V1 supports small explicit numeric/symbolic matrices only."],
)
