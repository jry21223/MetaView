from __future__ import annotations

from app.domain.skills.base import SkillCapability, SkillManifest

PROBABILITY_STATISTICS_CORE_MANIFEST = SkillManifest(
    skill_id="probability_statistics_core",
    domain="math",
    name="Probability Statistics Core",
    description=(
        "Deterministic probability rules, descriptive statistics, binomial, "
        "and z-score visuals."
    ),
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="probability_statistics_core.descriptive_statistics",
            description="Compute descriptive statistics for explicit numeric datasets.",
            examples=["总体数据 [2,4,4,4,5,5,7,9]，求均值、中位数、众数和极差"],
            output_schema="ProbabilityStatisticsProblemSpec",
        ),
        SkillCapability(
            capability_id="probability_statistics_core.probability_union",
            description="Apply P(A union B)=P(A)+P(B)-P(A intersection B).",
            examples=["P(A)=0.6, P(B)=0.5, P(A∩B)=0.2，求 P(A∪B)"],
            output_schema="ProbabilityStatisticsProblemSpec",
        ),
        SkillCapability(
            capability_id="probability_statistics_core.conditional_probability",
            description="Apply conditional probability for explicit event probabilities.",
            examples=["P(A∩B)=0.2, P(B)=0.5，求 P(A|B)"],
            output_schema="ProbabilityStatisticsProblemSpec",
        ),
        SkillCapability(
            capability_id="probability_statistics_core.contingency_table",
            description="Summarize small 2D contingency tables with totals.",
            examples=["列联表 [[30,10],[20,40]]，求行列合计"],
            output_schema="ProbabilityStatisticsProblemSpec",
        ),
        SkillCapability(
            capability_id="probability_statistics_core.binomial_probability",
            description="Compute exact binomial point probabilities.",
            examples=["二项分布 n=5, p=0.2, k=2，求概率"],
            output_schema="ProbabilityStatisticsProblemSpec",
        ),
        SkillCapability(
            capability_id="probability_statistics_core.z_score_normal_cdf",
            description="Compute z-score and standard normal CDF using math.erf.",
            examples=["正态分布 x=85, μ=70, σ=10，求 z-score 和 P(X≤85)"],
            output_schema="ProbabilityStatisticsProblemSpec",
        ),
    ],
    unsupported_notes=[
        "No hypothesis tests, regression, Bayesian networks, or unsupported distributions.",
        "Variance and standard deviation require explicit sample/population wording.",
        "Independence assumptions must be explicit for rules that require them.",
    ],
)
