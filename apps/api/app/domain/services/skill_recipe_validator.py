from __future__ import annotations

from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field

from app.domain.models.coverage import CoverageDecision
from app.domain.models.skill_recipe import SkillRecipe


class SkillRecipeValidationIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1)
    path: str = Field(min_length=1)
    message: str = Field(min_length=1)


class SkillRecipeValidationReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valid: bool
    issues: list[SkillRecipeValidationIssue]


@dataclass(frozen=True)
class SkillRecipeValidationContext:
    deterministic_tool_ids: frozenset[str]
    validator_tool_ids: frozenset[str]
    required_validator_tool_ids: frozenset[str]
    fact_validator_tool_ids: frozenset[str]
    compiled_scene_snapshot_kinds: dict[str, frozenset[str]]
    compiled_scene_domains: dict[str, str]
    supported_snapshot_kinds: frozenset[str]
    available_asset_ids: frozenset[tuple[str, str]]
    asset_pack_domains: dict[str, str]
    max_scene_count: int = 14


def validate_skill_recipe(
    recipe: SkillRecipe,
    coverage: CoverageDecision,
    context: SkillRecipeValidationContext,
) -> SkillRecipeValidationReport:
    issues: list[SkillRecipeValidationIssue] = []

    def add(code: str, path: str, message: str) -> None:
        issues.append(SkillRecipeValidationIssue(code=code, path=path, message=message))

    if coverage.mode != "composable" or coverage.fallback_policy != "compose":
        add(
            "recipe.coverage_not_composable",
            "coverage.mode",
            "SkillRecipe execution requires composable coverage with compose policy.",
        )
    if recipe.domain != coverage.domain:
        add(
            "recipe.domain_mismatch",
            "domain",
            "Recipe domain must match the resolved coverage domain.",
        )
    if not set(recipe.allowed_tool_ids) <= set(coverage.available_tool_ids):
        add(
            "recipe.tool_outside_coverage",
            "allowed_tool_ids",
            "Recipe tools must be a subset of tools exposed by CoverageDecision.",
        )

    unknown_tools = sorted(set(recipe.allowed_tool_ids) - context.deterministic_tool_ids)
    if unknown_tools:
        add(
            "recipe.tool_unavailable",
            "allowed_tool_ids",
            f"Tools are missing or non-deterministic: {unknown_tools}.",
        )
    unknown_validators = sorted(set(recipe.required_validator_ids) - context.validator_tool_ids)
    if unknown_validators:
        add(
            "recipe.validator_unavailable",
            "required_validator_ids",
            f"Validators are missing or non-deterministic: {unknown_validators}.",
        )
    missing_validators = sorted(
        context.required_validator_tool_ids - set(recipe.required_validator_ids)
    )
    if missing_validators:
        add(
            "recipe.validator_required",
            "required_validator_ids",
            f"Recipe omitted canonical final validators: {missing_validators}.",
        )
    invalid_fact_validators = sorted({
        fact.validator_id
        for fact in recipe.required_facts
        if fact.validator_id not in context.fact_validator_tool_ids
    })
    if invalid_fact_validators:
        add(
            "recipe.fact_validator_invalid",
            "required_facts",
            f"Fact requirements use non-semantic validators: {invalid_fact_validators}.",
        )
    unsupported_scenes = sorted(
        set(recipe.allowed_scene_types) - set(context.compiled_scene_snapshot_kinds)
    )
    if unsupported_scenes:
        add(
            "recipe.scene_not_compilable",
            "allowed_scene_types",
            f"SceneBlueprint compiler cannot execute: {unsupported_scenes}.",
        )
    wrong_domain_scenes = sorted(
        scene_type
        for scene_type in recipe.allowed_scene_types
        if context.compiled_scene_domains.get(scene_type) not in {None, recipe.domain}
    )
    if wrong_domain_scenes:
        add(
            "recipe.scene_domain_mismatch",
            "allowed_scene_types",
            f"Scene types do not belong to domain {recipe.domain!r}: {wrong_domain_scenes}.",
        )
    unsupported_snapshots = sorted(
        set(recipe.allowed_snapshot_kinds) - context.supported_snapshot_kinds
    )
    if unsupported_snapshots:
        add(
            "recipe.snapshot_unsupported",
            "allowed_snapshot_kinds",
            f"Snapshot kinds are outside the canonical contract: {unsupported_snapshots}.",
        )
    undeclared_outputs = {
        scene_type: sorted(
            context.compiled_scene_snapshot_kinds.get(scene_type, frozenset())
            - set(recipe.allowed_snapshot_kinds)
        )
        for scene_type in recipe.allowed_scene_types
    }
    undeclared_outputs = {
        scene_type: kinds for scene_type, kinds in undeclared_outputs.items() if kinds
    }
    if undeclared_outputs:
        add(
            "recipe.scene_snapshot_mismatch",
            "allowed_snapshot_kinds",
            f"Recipe does not authorize compiled scene outputs: {undeclared_outputs}.",
        )
    if len(recipe.lesson_plan.scenes) > context.max_scene_count:
        add(
            "recipe.scene_limit_exceeded",
            "lesson_plan.scenes",
            f"Recipe exceeds the {context.max_scene_count}-scene execution limit.",
        )

    for index, requirement in enumerate(recipe.asset_requirements):
        if requirement.asset_id is None or requirement.pack_id is None:
            continue
        if (requirement.pack_id, requirement.asset_id) not in context.available_asset_ids:
            add(
                "recipe.asset_unavailable",
                f"asset_requirements.{index}",
                f"Asset {requirement.asset_id!r} is not in pack {requirement.pack_id!r}.",
            )
        pack_domain = context.asset_pack_domains.get(requirement.pack_id)
        if pack_domain not in {None, "core", recipe.domain}:
            add(
                "recipe.asset_domain_mismatch",
                f"asset_requirements.{index}",
                f"Asset pack {requirement.pack_id!r} belongs to domain {pack_domain!r}.",
            )

    return SkillRecipeValidationReport(valid=not issues, issues=issues)


__all__ = [
    "SkillRecipeValidationContext",
    "SkillRecipeValidationIssue",
    "SkillRecipeValidationReport",
    "validate_skill_recipe",
]
