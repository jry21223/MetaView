from __future__ import annotations

import copy
import json
import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.domain.models.coverage import (
    CoverageDecision,
    CoverageFallbackPolicy,
    CoverageMode,
)

ROOT = Path(__file__).resolve().parents[3]
COVERAGE_SCHEMA = (
    ROOT / "apps" / "web" / "public" / "schemas" / "coverage-decision.schema.json"
)
WEB_PIPELINE_TYPES = ROOT / "apps" / "web" / "src" / "entities" / "pipeline" / "types.ts"


def _decision_payload() -> dict[str, object]:
    return {
        "mode": "specialized",
        "domain": "physics",
        "confidence": 0.86,
        "matched_skill_ids": ["physics_mechanics"],
        "available_tool_ids": ["skill.physics_mechanics.solve"],
        "missing_capabilities": [],
        "fallback_policy": "use_skill",
        "reason": "A deterministic SkillPack covers the request.",
    }


def test_coverage_types_and_model_are_public_domain_contracts() -> None:
    mode: CoverageMode = "composable"
    policy: CoverageFallbackPolicy = "compose"

    assert mode == "composable"
    assert policy == "compose"
    assert CoverageDecision.__module__ == "app.domain.models.coverage"


def test_public_coverage_schema_is_generated_from_domain_contract() -> None:
    stored_schema = json.loads(COVERAGE_SCHEMA.read_text(encoding="utf-8"))

    assert stored_schema == CoverageDecision.model_json_schema()


def test_web_coverage_contract_matches_canonical_schema() -> None:
    schema = CoverageDecision.model_json_schema()
    source = WEB_PIPELINE_TYPES.read_text(encoding="utf-8")

    mode_block = re.search(r"export type CoverageMode\s*=(.*?);", source, re.DOTALL)
    fallback_block = re.search(
        r"export type CoverageFallbackPolicy\s*=(.*?);", source, re.DOTALL
    )
    interface_block = re.search(
        r"export interface CoverageDecision\s*\{(.*?)\}", source, re.DOTALL
    )
    assert mode_block is not None
    assert fallback_block is not None
    assert interface_block is not None

    def literals(value: str) -> set[str]:
        return set(re.findall(r'"([a-z_]+)"', value))

    assert literals(mode_block.group(1)) == set(schema["properties"]["mode"]["enum"])
    assert literals(fallback_block.group(1)) == set(
        schema["properties"]["fallback_policy"]["enum"]
    )
    interface_fields = set(re.findall(r"^\s*([a-z_]+):", interface_block.group(1), re.MULTILINE))
    assert interface_fields == set(schema["required"])


@pytest.mark.parametrize(
    ("mode", "fallback_policy", "missing"),
    [
        ("experimental", "limited_visual", ["capability:controlled_composition:math"]),
        ("experimental", "text_only", ["scene_type:recursion_stack"]),
        ("unsupported", "reject", ["capability:domain_resolution"]),
    ],
)
def test_coverage_decision_accepts_controlled_non_specialized_modes(
    mode: str,
    fallback_policy: str,
    missing: list[str],
) -> None:
    payload = _decision_payload()
    payload.update({
        "mode": mode,
        "matched_skill_ids": [],
        "missing_capabilities": missing,
        "fallback_policy": fallback_policy,
    })

    decision = CoverageDecision.model_validate(payload)

    assert decision.mode == mode
    assert decision.fallback_policy == fallback_policy


def test_coverage_decision_accepts_composable_with_discovered_tools() -> None:
    payload = _decision_payload()
    payload.update({
        "mode": "composable",
        "matched_skill_ids": [],
        "fallback_policy": "compose",
    })

    decision = CoverageDecision.model_validate(payload)

    assert decision.mode == "composable"


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("fallback_policy", "compose", "specialized coverage must use"),
        ("matched_skill_ids", [], "requires a matched SkillPack"),
        (
            "missing_capabilities",
            ["tool:skill.physics_mechanics.solve"],
            "cannot have missing capabilities",
        ),
    ],
)
def test_specialized_coverage_enforces_its_semantics(
    field: str,
    value: object,
    message: str,
) -> None:
    payload = _decision_payload()
    payload[field] = value

    with pytest.raises(ValidationError, match=message):
        CoverageDecision.model_validate(payload)


def test_coverage_decision_rejects_duplicate_capability_evidence() -> None:
    payload = _decision_payload()
    payload["available_tool_ids"] = [
        "playbook.self_check",
        "playbook.self_check",
    ]

    with pytest.raises(ValidationError, match="available_tool_ids values must be unique"):
        CoverageDecision.model_validate(payload)


def test_coverage_decision_rejects_extra_fields() -> None:
    payload = copy.deepcopy(_decision_payload())
    payload["renderer"] = "must-not-enter-coverage"

    with pytest.raises(ValidationError, match="renderer"):
        CoverageDecision.model_validate(payload)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("router_min_confidence", -0.01),
        ("router_min_confidence", 1.01),
        ("router_refine_confidence", -0.01),
        ("router_refine_confidence", 1.01),
    ],
)
def test_global_router_confidence_settings_stay_in_probability_bounds(
    field: str,
    value: float,
) -> None:
    with pytest.raises(ValidationError):
        Settings(**{field: value})
