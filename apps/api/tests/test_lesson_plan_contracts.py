from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from typing import Any

import pytest
import yaml
from pydantic import ValidationError

from app.application.services.lesson_planner import build_rule_based_lesson_plan
from app.domain.models import LessonPlan, SceneIntent
from eval.benchmark_v2 import load_benchmark_v2_suite

ROOT = Path(__file__).resolve().parents[3]
LESSON_PLAN_DIR = ROOT / "eval" / "benchmark_v2" / "lesson_plans"
LESSON_PLAN_SCHEMA = ROOT / "apps" / "web" / "public" / "schemas" / "lesson-plan.schema.json"
STARTER_PROMPTS = ROOT / "eval" / "prompts" / "starter.yaml"
WEB_PIPELINE_TYPES = ROOT / "apps" / "web" / "src" / "entities" / "pipeline" / "types.ts"

LESSON_PLAN_FIELDS = {
    "schema_version",
    "domain",
    "title",
    "learning_objectives",
    "prerequisites",
    "misconceptions",
    "expected_conclusion",
    "lesson_arc",
    "scenes",
}
SCENE_INTENT_FIELDS = {
    "scene_id",
    "teaching_goal",
    "strategy",
    "required_fact_ids",
    "required_visual_roles",
    "preferred_scene_type",
    "narration_goal",
}
FORBIDDEN_RENDERER_FIELDS = {
    "animation_hint",
    "asset_id",
    "asset_path",
    "body",
    "camera",
    "end_frame",
    "frame",
    "height",
    "layers",
    "layout",
    "path",
    "renderer",
    "snapshot",
    "start_frame",
    "svg",
    "total_frames",
    "width",
    "x",
    "y",
    "z",
}


@pytest.fixture(scope="module")
def raw_plans() -> dict[str, dict[str, Any]]:
    return {
        path.stem: json.loads(path.read_text(encoding="utf-8"))
        for path in sorted(LESSON_PLAN_DIR.glob("*.json"))
    }


@pytest.fixture(scope="module")
def plans(raw_plans: dict[str, dict[str, Any]]) -> dict[str, LessonPlan]:
    return {case_id: LessonPlan.model_validate(payload) for case_id, payload in raw_plans.items()}


def test_lesson_plan_models_are_public_domain_contracts() -> None:
    assert LessonPlan.__module__ == "app.domain.models.lesson_plan"
    assert SceneIntent.__module__ == "app.domain.models.lesson_plan"


def test_public_lesson_plan_schema_is_generated_from_domain_contract() -> None:
    stored_schema = json.loads(LESSON_PLAN_SCHEMA.read_text(encoding="utf-8"))

    assert stored_schema == LessonPlan.model_json_schema()


def test_web_lesson_plan_types_match_canonical_schema() -> None:
    source = WEB_PIPELINE_TYPES.read_text(encoding="utf-8")
    schema = LessonPlan.model_json_schema()
    scene_schema = schema["$defs"]["SceneIntent"]

    assert _typescript_union(source, "LessonArc") == set(
        schema["properties"]["lesson_arc"]["enum"]
    )
    assert _typescript_union(source, "SceneTeachingStrategy") == set(
        scene_schema["properties"]["strategy"]["enum"]
    )
    assert _typescript_interface_fields(source, "LessonPlan") == set(
        schema["properties"]
    )
    assert _typescript_interface_fields(source, "SceneIntent") == set(
        scene_schema["properties"]
    )
    assert _typescript_interface_contract(source, "LessonPlan") == {
        "schema_version": (False, '"1.0.0"'),
        "domain": (False, "string"),
        "title": (False, "string"),
        "learning_objectives": (False, "string[]"),
        "prerequisites": (False, "string[]"),
        "misconceptions": (False, "string[]"),
        "expected_conclusion": (False, "string"),
        "lesson_arc": (False, "LessonArc"),
        "scenes": (False, "SceneIntent[]"),
    }
    assert _typescript_interface_contract(source, "SceneIntent") == {
        "scene_id": (False, "string"),
        "teaching_goal": (False, "string"),
        "strategy": (False, "SceneTeachingStrategy"),
        "required_fact_ids": (False, "string[]"),
        "required_visual_roles": (False, "string[]"),
        "preferred_scene_type": (False, "string|null"),
        "narration_goal": (False, "string"),
    }


def test_gold_lesson_plan_files_match_benchmark_cases(
    plans: dict[str, LessonPlan],
) -> None:
    suite = load_benchmark_v2_suite()

    assert set(plans) == {case.id for case in suite.cases}


def test_gold_lesson_plans_cover_benchmark_semantics(
    plans: dict[str, LessonPlan],
) -> None:
    suite = load_benchmark_v2_suite()
    for expectation in suite.cases:
        _assert_plan_covers_expectation(plans[expectation.id], expectation)


def test_production_rule_planner_covers_gold_benchmark_semantics() -> None:
    raw = yaml.safe_load(STARTER_PROMPTS.read_text(encoding="utf-8"))
    prompts = {item["id"]: item for item in raw["prompts"]}

    for expectation in load_benchmark_v2_suite().cases:
        item = prompts[expectation.id]
        plan = build_rule_based_lesson_plan(
            prompt=item["prompt"],
            domain=item["domain"],
        )
        _assert_plan_covers_expectation(plan, expectation)


def test_gold_lesson_plans_only_use_contract_fields(
    raw_plans: dict[str, dict[str, Any]],
) -> None:
    for payload in raw_plans.values():
        assert set(payload) == LESSON_PLAN_FIELDS
        assert payload["scenes"]
        assert all(set(scene) == SCENE_INTENT_FIELDS for scene in payload["scenes"])
        assert not (_collect_keys(payload) & FORBIDDEN_RENDERER_FIELDS)


def test_lesson_plan_rejects_extra_renderer_fields(
    raw_plans: dict[str, dict[str, Any]],
) -> None:
    payload = copy.deepcopy(raw_plans["math-derivative-tangent"])
    payload["scenes"][0]["asset_id"] = "must-not-enter-lesson-plan"

    with pytest.raises(ValidationError, match="asset_id"):
        LessonPlan.model_validate(payload)


def test_lesson_plan_requires_unique_scene_ids(
    raw_plans: dict[str, dict[str, Any]],
) -> None:
    payload = copy.deepcopy(raw_plans["algorithm-bfs-tree"])
    payload["scenes"][1]["scene_id"] = payload["scenes"][0]["scene_id"]

    with pytest.raises(ValidationError, match="scene_id values must be unique"):
        LessonPlan.model_validate(payload)


def test_lesson_plan_allows_honest_empty_legacy_lists(
    raw_plans: dict[str, dict[str, Any]],
) -> None:
    payload = copy.deepcopy(raw_plans["math-derivative-tangent"])
    payload["prerequisites"] = []
    payload["misconceptions"] = []
    payload["scenes"][0]["required_fact_ids"] = []
    payload["scenes"][0]["required_visual_roles"] = []

    plan = LessonPlan.model_validate(payload)

    assert plan.prerequisites == []
    assert plan.misconceptions == []
    assert plan.scenes[0].required_fact_ids == []
    assert plan.scenes[0].required_visual_roles == []


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("domain",), " "),
        (("title",), " "),
        (("learning_objectives",), []),
        (("learning_objectives", 0), " "),
        (("expected_conclusion",), " "),
        (("scenes",), []),
        (("scenes", 0, "scene_id"), " "),
        (("scenes", 0, "teaching_goal"), " "),
        (("scenes", 0, "required_fact_ids"), [" "]),
        (("scenes", 0, "required_visual_roles"), [" "]),
        (("scenes", 0, "preferred_scene_type"), " "),
        (("scenes", 0, "narration_goal"), " "),
    ],
)
def test_lesson_plan_rejects_blank_or_missing_semantics(
    raw_plans: dict[str, dict[str, Any]],
    path: tuple[str | int, ...],
    value: Any,
) -> None:
    payload = copy.deepcopy(raw_plans["math-derivative-tangent"])
    _set_path(payload, path, value)

    with pytest.raises(ValidationError):
        LessonPlan.model_validate(payload)


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("schema_version",), "2.0.0"),
        (("lesson_arc",), "cinematic"),
        (("scenes", 0, "strategy"), "camera_pan"),
    ],
)
def test_lesson_plan_rejects_unknown_versions_and_enums(
    raw_plans: dict[str, dict[str, Any]],
    path: tuple[str | int, ...],
    value: Any,
) -> None:
    payload = copy.deepcopy(raw_plans["math-derivative-tangent"])
    _set_path(payload, path, value)

    with pytest.raises(ValidationError):
        LessonPlan.model_validate(payload)


def _collect_keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {
            nested_key for child in value.values() for nested_key in _collect_keys(child)
        }
    if isinstance(value, list):
        return {nested_key for child in value for nested_key in _collect_keys(child)}
    return set()


def _assert_plan_covers_expectation(plan: LessonPlan, expectation: Any) -> None:
    fact_ids = {
        fact_id for scene in plan.scenes for fact_id in scene.required_fact_ids
    }
    visual_roles = {
        role for scene in plan.scenes for role in scene.required_visual_roles
    }
    scene_types = {
        scene.preferred_scene_type
        for scene in plan.scenes
        if scene.preferred_scene_type is not None
    }

    assert plan.domain in expectation.expected_domains
    assert {fact.id for fact in expectation.required_text_facts} <= fact_ids
    assert set(expectation.required_semantic_roles) <= visual_roles
    assert set(expectation.required_scene_types) <= scene_types

    normalized_conclusion = plan.expected_conclusion.casefold()
    for aliases in expectation.expected_conclusion.all_of:
        assert any(alias.casefold() in normalized_conclusion for alias in aliases)
    assert not any(
        alias.casefold() in normalized_conclusion
        for alias in expectation.expected_conclusion.none_of
    )


def _set_path(payload: Any, path: tuple[str | int, ...], value: Any) -> None:
    target = payload
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value


def _typescript_union(source: str, name: str) -> set[str]:
    match = re.search(rf"export type {name}\s*=\s*(.*?);", source, flags=re.DOTALL)
    assert match is not None
    return set(re.findall(r'"([^"]+)"', match.group(1)))


def _typescript_interface_fields(source: str, name: str) -> set[str]:
    match = re.search(
        rf"export interface {name}\s*\{{(.*?)\n\}}",
        source,
        flags=re.DOTALL,
    )
    assert match is not None
    return set(re.findall(r"^\s{2}([a-z_]+)\??:", match.group(1), flags=re.MULTILINE))


def _typescript_interface_contract(
    source: str,
    name: str,
) -> dict[str, tuple[bool, str]]:
    match = re.search(
        rf"export interface {name}\s*\{{(.*?)\n\}}",
        source,
        flags=re.DOTALL,
    )
    assert match is not None
    properties = re.findall(
        r"^\s{2}([a-z_]+)(\??):\s*([^;]+);",
        match.group(1),
        flags=re.MULTILINE,
    )
    return {
        field: (optional == "?", re.sub(r"\s+", "", type_text))
        for field, optional, type_text in properties
    }
