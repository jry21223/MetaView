from __future__ import annotations

# Canonical final-candidate validators shared by coverage and SkillRecipe.
# Geometry assertions remain executable tools, but do not replace schema and semantic gates.
PLAYBOOK_VALIDATOR_TOOL_IDS: tuple[str, ...] = (
    "playbook.schema.validate",
    "playbook.self_check",
)
PLAYBOOK_VALIDATOR_TOOL_ID_SET = frozenset(PLAYBOOK_VALIDATOR_TOOL_IDS)

# Fact claims require the semantic self-check. Schema validation alone cannot verify knowledge.
FACT_VALIDATOR_TOOL_IDS: tuple[str, ...] = ("playbook.self_check",)
FACT_VALIDATOR_TOOL_ID_SET = frozenset(FACT_VALIDATOR_TOOL_IDS)
