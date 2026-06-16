from __future__ import annotations

from app.domain.skills.base import SkillCapability, SkillManifest

CHEMISTRY_STOICHIOMETRY_MANIFEST = SkillManifest(
    skill_id="chemistry_stoichiometry",
    domain="chemistry",
    name="Chemistry Stoichiometry",
    description="Deterministic balancing, molar mass, limiting reagent, and concentration visuals.",
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="chemistry_stoichiometry.balance_equation",
            description="Balance small chemical equations by atom conservation.",
            examples=["配平 Fe + O2 -> Fe2O3", "配平 H2 + O2 -> H2O"],
            output_schema="ChemistryStoichiometryProblemSpec",
        ),
        SkillCapability(
            capability_id="chemistry_stoichiometry.molar_mass",
            description="Compute molar mass for simple formulas.",
            examples=["求 H2O 的摩尔质量", "求 NaCl 的摩尔质量"],
            output_schema="ChemistryStoichiometryProblemSpec",
        ),
        SkillCapability(
            capability_id="chemistry_stoichiometry.limiting_reagent",
            description="Identify limiting reagent and theoretical yield for a simple reaction.",
            examples=["10g H2 与 80g O2 反应生成水，判断限量反应物并求理论产量"],
            output_schema="ChemistryStoichiometryProblemSpec",
        ),
        SkillCapability(
            capability_id="chemistry_stoichiometry.solution_concentration",
            description="Compute c=n/V for explicit mole and volume values.",
            examples=["0.5mol NaOH 溶于 1L 水，求物质的量浓度"],
            output_schema="ChemistryStoichiometryProblemSpec",
        ),
    ],
    unsupported_notes=[
        "Only common elements and simple formulas are supported in V1.",
        "No complex organic structures, redox half-reactions, electrochemistry, or external data.",
        "Unsupported elements or unsafe parses must fall back.",
    ],
)

