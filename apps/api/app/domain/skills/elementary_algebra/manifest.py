from __future__ import annotations

from app.domain.skills.base import SkillCapability, SkillManifest

ELEMENTARY_ALGEBRA_MANIFEST = SkillManifest(
    skill_id="elementary_algebra",
    domain="math",
    name="Elementary Algebra",
    description=(
        "Deterministic algebra explanations for single-variable equations, "
        "basic inequalities, and simple factoring."
    ),
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="elementary_algebra.equation_1var",
            description="Solve and explain supported one-variable equations.",
            examples=["解方程 2x+3=11", "求 x^2-5x+6=0 的解"],
            output_schema="ElementaryAlgebraProblemSpec",
        ),
        SkillCapability(
            capability_id="elementary_algebra.inequality_1var",
            description="Solve supported one-variable polynomial inequalities.",
            examples=["解不等式 2x-1>5"],
            output_schema="ElementaryAlgebraProblemSpec",
        ),
        SkillCapability(
            capability_id="elementary_algebra.factor_expression",
            description="Factor simple polynomial expressions.",
            examples=["因式分解 x^2-5x+6"],
            output_schema="ElementaryAlgebraProblemSpec",
        ),
    ],
    unsupported_notes=[
        "V1 handles deterministic single-variable algebra only.",
        "Graph transformations in vertex form stay routed to quadratic_transform.",
    ],
)
