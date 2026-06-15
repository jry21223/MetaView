from __future__ import annotations

from app.domain.skills.base import SkillCapability, SkillManifest

BIOLOGY_GENETICS_MANIFEST = SkillManifest(
    skill_id="biology_genetics",
    domain="biology",
    name="Biology Genetics",
    description="Deterministic Mendelian genetics visuals for explicit one- or two-trait crosses.",
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="biology_genetics.monohybrid_ratio",
            description="Compute genotype and phenotype ratios for one-trait crosses.",
            examples=["A 对 a 显性，亲本 Aa x Aa，求基因型比例和表现型比例"],
            output_schema="BiologyGeneticsProblemSpec",
        ),
        SkillCapability(
            capability_id="biology_genetics.test_cross",
            description="Compute explicit test-cross Punnett outcomes.",
            examples=["A 对 a 显性，亲本 Aa x aa，做 test cross 并画 Punnett 表"],
            output_schema="BiologyGeneticsProblemSpec",
        ),
        SkillCapability(
            capability_id="biology_genetics.dihybrid_ratio",
            description="Compute independent-assortment two-trait phenotype ratios.",
            examples=["A 对 a 显性，B 对 b 显性，亲本 AaBb x AaBb，求表现型比例"],
            output_schema="BiologyGeneticsProblemSpec",
        ),
        SkillCapability(
            capability_id="biology_genetics.genotype_probability",
            description="Compute exact genotype probability for explicit target genotypes.",
            examples=["A 对 a 显性，亲本 Aa x Aa，求 P(aa)"],
            output_schema="BiologyGeneticsProblemSpec",
        ),
        SkillCapability(
            capability_id="biology_genetics.phenotype_probability",
            description="Compute exact phenotype probability for explicit target phenotypes.",
            examples=["A 对 a 显性，B 对 b 显性，AaBb x AaBb，求 P(A_B_)"],
            output_schema="BiologyGeneticsProblemSpec",
        ),
        SkillCapability(
            capability_id="biology_genetics.punnett_table",
            description="Build a deterministic Punnett table for explicit parent genotypes.",
            examples=["A 对 a 显性，亲本 Aa x Aa，画 Punnett 表"],
            output_schema="BiologyGeneticsProblemSpec",
        ),
    ],
    unsupported_notes=[
        "Requires explicit dominance assumptions for phenotype questions.",
        "Only one- and two-trait Mendelian crosses are supported.",
        "No linkage, epistasis, sex linkage, pedigrees, or incomplete dominance.",
    ],
)
