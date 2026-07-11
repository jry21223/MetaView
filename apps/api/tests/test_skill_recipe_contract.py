from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.application.agent.runtime_tool_hub import RuntimeToolHub
from app.application.services.skill_recipe_validator import (
    build_skill_recipe_validation_context,
)
from app.domain.models.coverage import CoverageDecision
from app.domain.models.lesson_plan import LessonPlan
from app.domain.models.skill_recipe import SkillRecipe
from app.domain.services.scene_blueprint_compiler import (
    COMPILE_SUPPORTED_SCENE_TYPES,
    COMPILED_SCENE_CAPABILITIES,
)
from app.domain.services.scene_blueprint_schema import scene_blueprint_schema
from app.domain.services.skill_recipe_validator import (
    SkillRecipeValidationContext,
    validate_skill_recipe,
)

ROOT = Path(__file__).resolve().parents[3]
RECIPE_SCHEMA = ROOT / "apps" / "web" / "public" / "schemas" / "skill-recipe.schema.json"
PLAN_PATH = ROOT / "eval" / "benchmark_v2" / "lesson_plans" / "algorithm-bfs-tree.json"


def _recipe_payload() -> dict[str, object]:
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    fact_ids = sorted({fact for scene in plan["scenes"] for fact in scene["required_fact_ids"]})
    return {
        "schema_version": "1.0.0",
        "recipe_id": "recipe-bfs-001",
        "domain": "algorithm",
        "lesson_plan": plan,
        "required_facts": [
            {
                "fact_id": fact_id,
                "description": f"Verify {fact_id} for the BFS explanation.",
                "validator_id": "playbook.self_check",
            }
            for fact_id in fact_ids
        ],
        "allowed_tool_ids": [
            "playbook.schema.validate",
            "playbook.self_check",
            "scene_blueprint.compile",
        ],
        "required_validator_ids": [
            "playbook.schema.validate",
            "playbook.self_check",
        ],
        "allowed_scene_types": ["bfs_graph"],
        "allowed_snapshot_kinds": ["graph_scene"],
        "asset_requirements": [
            {
                "semantic_role": "node",
                "asset_id": "bfs-graph-contract",
                "pack_id": "algorithm-code-basic",
                "required": True,
            }
        ],
        "quality_expectations": [
            {"dimension": "knowledge_correctness", "minimum_score": 0.9},
            {"dimension": "visual_structure", "minimum_score": 0.85},
            {"dimension": "code_sync", "minimum_score": 0.8},
        ],
    }


def _coverage(recipe: SkillRecipe) -> CoverageDecision:
    return CoverageDecision(
        mode="composable",
        domain=recipe.domain,
        confidence=0.9,
        matched_skill_ids=[],
        available_tool_ids=recipe.allowed_tool_ids,
        missing_capabilities=[],
        fallback_policy="compose",
        reason="Controlled tools cover this request.",
    )


def test_public_skill_recipe_schema_is_generated_from_domain_contract() -> None:
    stored_schema = json.loads(RECIPE_SCHEMA.read_text(encoding="utf-8"))
    assert stored_schema == SkillRecipe.model_json_schema()


def test_skill_recipe_is_transient_data_only_contract() -> None:
    recipe = SkillRecipe.model_validate(_recipe_payload())
    serialized = recipe.model_dump(mode="json")

    assert recipe.lesson_plan == LessonPlan.model_validate(serialized["lesson_plan"])
    assert not ({"code", "path", "svg", "coordinates", "frame", "layers"} & _keys(serialized))


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        (lambda value: value.update(domain="physics"), "domain"),
        (lambda value: value["required_facts"].pop(), "cover LessonPlan facts"),
        (
            lambda value: value["required_facts"][0].update(validator_id="geometry.assert_monotonic"),
            "validator_id",
        ),
        (lambda value: value["allowed_scene_types"].clear(), "at least 1"),
        (
            lambda value: value["asset_requirements"][0].pop("pack_id"),
            "pack_id",
        ),
        (
            lambda value: value.update(shell_command="rm -rf /"),
            "Extra inputs",
        ),
    ],
)
def test_skill_recipe_rejects_invalid_or_unsafe_contracts(mutation, message: str) -> None:
    payload = copy.deepcopy(_recipe_payload())
    mutation(payload)

    with pytest.raises(ValidationError, match=message):
        SkillRecipe.model_validate(payload)


def test_recipe_validator_accepts_only_discovered_deterministic_capabilities() -> None:
    recipe = SkillRecipe.model_validate(_recipe_payload())
    context = build_skill_recipe_validation_context(RuntimeToolHub())

    report = validate_skill_recipe(recipe, _coverage(recipe), context)

    assert report.valid is True
    assert report.issues == []


@pytest.mark.parametrize(
    ("field", "value", "expected_code"),
    [
        ("allowed_tool_ids", ["playbook.self_check", "unknown.execute"], "recipe.tool_unavailable"),
        ("allowed_scene_types", ["graph_scene"], "recipe.scene_not_compilable"),
        ("allowed_snapshot_kinds", ["imaginary_scene"], "recipe.snapshot_unsupported"),
    ],
)
def test_recipe_validator_blocks_unavailable_runtime_capabilities(
    field: str,
    value: list[str],
    expected_code: str,
) -> None:
    payload = _recipe_payload()
    payload[field] = value
    if field == "allowed_tool_ids":
        payload["required_validator_ids"] = ["playbook.self_check"]
        for fact in payload["required_facts"]:
            fact["validator_id"] = "playbook.self_check"
    if field == "allowed_scene_types":
        for scene in payload["lesson_plan"]["scenes"]:
            scene["preferred_scene_type"] = "graph_scene"
    recipe = SkillRecipe.model_validate(payload)
    coverage = _coverage(recipe)
    context = build_skill_recipe_validation_context(RuntimeToolHub())

    report = validate_skill_recipe(recipe, coverage, context)

    assert report.valid is False
    assert expected_code in {issue.code for issue in report.issues}


def test_recipe_validator_blocks_asset_and_scene_limit_failures() -> None:
    recipe = SkillRecipe.model_validate(_recipe_payload())
    context = build_skill_recipe_validation_context(RuntimeToolHub())
    context = SkillRecipeValidationContext(
        deterministic_tool_ids=context.deterministic_tool_ids,
        validator_tool_ids=context.validator_tool_ids,
        required_validator_tool_ids=context.required_validator_tool_ids,
        fact_validator_tool_ids=context.fact_validator_tool_ids,
        compiled_scene_snapshot_kinds=context.compiled_scene_snapshot_kinds,
        compiled_scene_domains=context.compiled_scene_domains,
        supported_snapshot_kinds=context.supported_snapshot_kinds,
        available_asset_ids=frozenset(),
        asset_pack_domains=context.asset_pack_domains,
        max_scene_count=2,
    )

    report = validate_skill_recipe(recipe, _coverage(recipe), context)

    assert {issue.code for issue in report.issues} == {
        "recipe.asset_unavailable",
        "recipe.scene_limit_exceeded",
    }


def test_compiler_capability_set_is_a_subset_of_scene_blueprint_schema() -> None:
    schema_types = set(scene_blueprint_schema()["properties"]["sceneType"]["enum"])
    assert COMPILE_SUPPORTED_SCENE_TYPES <= schema_types
    assert "graph_scene" in schema_types
    assert "graph_scene" not in COMPILE_SUPPORTED_SCENE_TYPES


def test_recipe_validator_rejects_non_validator_tool_for_fact_validation() -> None:
    payload = _recipe_payload()
    payload["allowed_tool_ids"] = ["scene_blueprint.compile"]
    payload["required_validator_ids"] = ["scene_blueprint.compile"]
    for fact in payload["required_facts"]:
        fact["validator_id"] = "scene_blueprint.compile"
    recipe = SkillRecipe.model_validate(payload)

    report = validate_skill_recipe(
        recipe,
        _coverage(recipe),
        build_skill_recipe_validation_context(RuntimeToolHub()),
    )

    assert "recipe.validator_unavailable" in {issue.code for issue in report.issues}


def test_required_semantic_asset_cannot_bypass_manifest_resolution() -> None:
    payload = _recipe_payload()
    payload["asset_requirements"] = [
        {"semantic_role": "does_not_exist", "required": True}
    ]

    with pytest.raises(ValidationError, match="required asset"):
        SkillRecipe.model_validate(payload)


def test_recipe_validator_requires_declared_snapshot_for_each_scene() -> None:
    payload = _recipe_payload()
    payload["allowed_snapshot_kinds"] = ["math_plot"]
    recipe = SkillRecipe.model_validate(payload)

    report = validate_skill_recipe(
        recipe,
        _coverage(recipe),
        build_skill_recipe_validation_context(RuntimeToolHub()),
    )

    assert "recipe.scene_snapshot_mismatch" in {issue.code for issue in report.issues}


def test_recipe_validator_rejects_scene_and_asset_from_another_domain() -> None:
    payload = _recipe_payload()
    payload["domain"] = "math"
    payload["lesson_plan"]["domain"] = "math"
    recipe = SkillRecipe.model_validate(payload)

    report = validate_skill_recipe(
        recipe,
        _coverage(recipe),
        build_skill_recipe_validation_context(RuntimeToolHub()),
    )

    assert {"recipe.scene_domain_mismatch", "recipe.asset_domain_mismatch"} <= {
        issue.code for issue in report.issues
    }


def test_recipe_validator_requires_schema_and_semantic_final_gates() -> None:
    payload = _recipe_payload()
    payload["allowed_tool_ids"] = ["playbook.schema.validate", "scene_blueprint.compile"]
    payload["required_validator_ids"] = ["playbook.schema.validate"]
    for fact in payload["required_facts"]:
        fact["validator_id"] = "playbook.schema.validate"
    recipe = SkillRecipe.model_validate(payload)

    report = validate_skill_recipe(
        recipe,
        _coverage(recipe),
        build_skill_recipe_validation_context(RuntimeToolHub()),
    )

    assert {"recipe.validator_required", "recipe.fact_validator_invalid"} <= {
        issue.code for issue in report.issues
    }


def test_all_compiler_capabilities_match_actual_snapshot_kind_and_domain() -> None:
    from app.domain.services.scene_blueprint_compiler import compile_scene_blueprint_to_playbook

    for scene_type, capability in COMPILED_SCENE_CAPABILITIES.items():
        playbook = compile_scene_blueprint_to_playbook({
            "id": scene_type,
            "subject": capability.domain,
            "sceneType": scene_type,
            "title": scene_type,
            "visualIntent": ["contract_check"],
        })
        actual_kinds = {str(step.snapshot.kind) for step in playbook.steps}
        assert playbook.domain == capability.domain
        assert actual_kinds == set(capability.snapshot_kinds)


def _keys(value: object) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {key for child in value.values() for key in _keys(child)}
    if isinstance(value, list):
        return {key for child in value for key in _keys(child)}
    return set()
