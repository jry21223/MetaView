from __future__ import annotations

import asyncio
import json
from collections import Counter
from pathlib import Path

import pytest

from app.domain.skills.base import SkillExecutionContext, SkillRouteInput
from app.domain.skills.conic_sections.skill_pack import ConicSectionsSkillPack
from eval.benchmark_v2 import score_benchmark_v2
from eval.conic_hidden_cases import (
    DEFAULT_CONIC_ARCHETYPE_CATALOG,
    DEFAULT_CONIC_HIDDEN_MANIFEST,
    load_conic_archetype_catalog,
    load_hidden_conic_manifest,
)

ROOT = Path(__file__).resolve().parents[3]


def test_catalog_rejects_duplicate_archetype_ids(tmp_path: Path) -> None:
    payload = json.loads(DEFAULT_CONIC_ARCHETYPE_CATALOG.read_text(encoding="utf-8"))
    payload["archetypes"].append(payload["archetypes"][0])
    duplicate_catalog = tmp_path / "duplicate-catalog.json"
    duplicate_catalog.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ValueError, match="archetype IDs must be unique"):
        load_conic_archetype_catalog(duplicate_catalog)


def test_hidden_manifest_rejects_unknown_archetypes(tmp_path: Path) -> None:
    payload = json.loads(DEFAULT_CONIC_HIDDEN_MANIFEST.read_text(encoding="utf-8"))
    payload["variants"][0]["archetypeId"] = "conic.unknown"
    unknown_manifest = tmp_path / "unknown-archetype.json"
    unknown_manifest.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ValueError, match="unknown conic archetype"):
        load_hidden_conic_manifest(unknown_manifest)


def test_hidden_manifest_rejects_shared_metadata_overrides(tmp_path: Path) -> None:
    payload = json.loads(DEFAULT_CONIC_HIDDEN_MANIFEST.read_text(encoding="utf-8"))
    payload["variants"][0]["requiredSemanticRoles"] = ["forged_role"]
    mismatched_manifest = tmp_path / "mismatched-metadata.json"
    mismatched_manifest.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ValueError, match="requiredSemanticRoles"):
        load_hidden_conic_manifest(mismatched_manifest)


def test_hidden_manifest_requires_instance_fact_aliases_from_catalog_rules() -> None:
    suite = load_hidden_conic_manifest().benchmark_suite()
    parabola = suite.by_id("conic-hidden-parabola-focus-01")

    facts = {fact.id: fact.any_of for fact in parabola.required_text_facts}
    assert facts["parabola-focus"] == ["F(2,0)", "F(2, 0)"]
    assert facts["parabola-directrix"] == ["x=-2", "x = -2"]


def test_line_ellipse_variants_keep_intersection_and_tangent_visual_evidence() -> None:
    suite = load_hidden_conic_manifest().benchmark_suite()

    secant_roles = suite.by_id("conic-hidden-line-ellipse-01").required_semantic_roles
    near_tangent_roles = suite.by_id("conic-hidden-line-ellipse-02").required_semantic_roles
    assert "intersection_point" in secant_roles
    assert "tangent_point" in near_tangent_roles


def test_wrong_parabola_instance_values_fail_required_facts() -> None:
    expectation = (
        load_hidden_conic_manifest().benchmark_suite().by_id("conic-hidden-parabola-focus-01")
    )
    payload = json.loads((ROOT / "eval" / "fixtures" / "math-parametric-circle.json").read_text())
    wrong_instance = "抛物线的焦点 F(3,0)，准线 x=-3，且 PF=PH 距离相等。"
    payload["title"] = wrong_instance
    payload["summary"] = wrong_instance
    for step in payload["steps"]:
        step["title"] = wrong_instance
        step["voiceover_text"] = wrong_instance

    card = score_benchmark_v2(
        expectation,
        json.dumps(payload, ensure_ascii=False),
        external_warning_count=0,
    )
    missing_fact_messages = {
        issue.message for issue in card.hard_failures if issue.code == "missing_required_text_fact"
    }
    assert any("parabola-focus" in message for message in missing_fact_messages)
    assert any("parabola-directrix" in message for message in missing_fact_messages)


def test_hidden_manifest_rejects_unknown_catalog_fact_ids(tmp_path: Path) -> None:
    payload = json.loads(DEFAULT_CONIC_HIDDEN_MANIFEST.read_text(encoding="utf-8"))
    payload["variants"][0]["factEvidence"] = {"forged-fact": ["looks plausible"]}
    forged_manifest = tmp_path / "forged-fact.json"
    forged_manifest.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ValueError, match="unknown conic fact IDs"):
        load_hidden_conic_manifest(forged_manifest)


def test_hidden_manifest_has_two_variants_per_archetype_and_never_enters_web_source() -> None:
    catalog = load_conic_archetype_catalog()
    manifest = load_hidden_conic_manifest()
    assert len(manifest.variants) == 12
    assert Counter(item.archetype_id for item in manifest.variants) == Counter(
        {item.archetype_id: 2 for item in catalog.archetypes}
    )

    hidden_markers = {
        *(item.case_id for item in manifest.variants),
        *(item.prompt for item in manifest.variants),
    }
    web_files = list((ROOT / "apps" / "web" / "src").rglob("*"))
    web_dist = ROOT / "apps" / "web" / "dist"
    if web_dist.exists():
        web_files.extend(web_dist.rglob("*"))
    for source in web_files:
        if source.suffix in {".ts", ".tsx", ".js", ".mjs", ".css", ".html", ".json"}:
            source_payload = source.read_text(encoding="utf-8")
            assert "eval/hidden-cases" not in source_payload
            assert not any(marker in source_payload for marker in hidden_markers)


def test_hidden_manifest_derives_prompts_and_gold_expectations_without_playbooks() -> None:
    catalog = load_conic_archetype_catalog()
    manifest = load_hidden_conic_manifest()
    prompts = manifest.prompts()
    suite = manifest.benchmark_suite()
    assert [item["id"] for item in prompts] == [item.case_id for item in manifest.variants]
    assert [item.id for item in suite.cases] == [item.case_id for item in manifest.variants]
    payload = (ROOT / "eval" / "hidden-cases" / "conic-sections" / "variants.json").read_text(
        encoding="utf-8"
    )
    assert "buildPublicPlaybook" not in payload
    assert "steps" not in payload
    raw_manifest = json.loads(payload)
    assert all(
        set(item)
        == {
            "caseId",
            "archetypeId",
            "prompt",
            "parameters",
            "factEvidence",
            "conclusionAliases",
            "forbiddenAliases",
        }
        for item in raw_manifest["variants"]
    )

    for variant, expectation in zip(manifest.variants, suite.cases, strict=True):
        archetype = catalog.by_id(variant.archetype_id)
        assert [(fact.id, fact.any_of) for fact in expectation.required_text_facts] == [
            (fact_id, aliases) for fact_id, aliases in variant.fact_evidence.items()
        ]
        assert set(variant.fact_evidence) <= {fact.id for fact in archetype.expected_facts}


def test_hidden_expectations_embed_archetype_math_rules_without_case_id_dispatch() -> None:
    manifest = load_hidden_conic_manifest()
    suite = manifest.benchmark_suite()

    for variant in manifest.variants:
        deterministic = suite.by_id(variant.case_id).deterministic_validation
        assert deterministic is not None
        assert deterministic.validator == variant.archetype_id
        assert deterministic.parameters == variant.parameters
        assert "invalid_deterministic_math" in suite.by_id(variant.case_id).hard_fail_conditions


def test_correct_ellipse_narration_with_wrong_focus_coordinates_hard_fails() -> None:
    expectation, payload = _ellipse_skill_output()
    for step in payload["steps"]:
        snapshot = step["snapshot"]
        for point in snapshot["points"]:
            if point.get("semantic_role") == "focus":
                point["x"] += 0.75

    card = score_benchmark_v2(
        expectation,
        json.dumps(payload, ensure_ascii=False),
        external_warning_count=0,
    )

    assert "invalid_deterministic_math" in {issue.code for issue in card.hard_failures}
    assert any("focus" in issue.message.lower() for issue in card.hard_failures)


def test_correct_ellipse_narration_with_only_one_focus_hard_fails() -> None:
    expectation, payload = _ellipse_skill_output()
    for step in payload["steps"]:
        snapshot = step["snapshot"]
        focuses = [
            point for point in snapshot["points"] if point.get("semantic_role") == "focus"
        ]
        if len(focuses) >= 2:
            snapshot["points"].remove(focuses[1])

    card = score_benchmark_v2(
        expectation,
        json.dumps(payload, ensure_ascii=False),
        external_warning_count=0,
    )

    assert not card.passed
    assert "invalid_deterministic_math" in {issue.code for issue in card.hard_failures}
    assert any("two distinct expected foci" in issue.message for issue in card.hard_failures)


def test_correct_ellipse_narration_with_only_one_focal_segment_hard_fails() -> None:
    expectation, payload = _ellipse_skill_output()
    for step in payload["steps"]:
        snapshot = step["snapshot"]
        segments = [
            segment
            for segment in snapshot["segments"]
            if segment.get("semantic_role") == "focal_distance"
        ]
        if len(segments) >= 2:
            snapshot["segments"].remove(segments[1])

    card = score_benchmark_v2(
        expectation,
        json.dumps(payload, ensure_ascii=False),
        external_warning_count=0,
    )

    assert not card.passed
    assert "invalid_deterministic_math" in {issue.code for issue in card.hard_failures}
    assert any("both focal-distance segments" in issue.message for issue in card.hard_failures)


def test_correct_ellipse_narration_with_wrong_curve_equation_hard_fails() -> None:
    expectation, payload = _ellipse_skill_output()
    for step in payload["steps"]:
        curve = step["snapshot"]["curves"][0]
        curve["expression_x"] = "5*cos(t)"

    card = score_benchmark_v2(
        expectation,
        json.dumps(payload, ensure_ascii=False),
        external_warning_count=0,
    )

    assert "invalid_deterministic_math" in {issue.code for issue in card.hard_failures}
    assert any("curve" in issue.message.lower() for issue in card.hard_failures)


def test_supported_hidden_variant_passes_gold_v2_from_skill_output() -> None:
    manifest = load_hidden_conic_manifest()
    variant = manifest.variants[0]
    skill = ConicSectionsSkillPack()
    match = skill.heuristic_match(SkillRouteInput(prompt=variant.prompt))
    assert match is not None and match.problem_spec is not None
    result = asyncio.run(
        skill.execute(
            SkillExecutionContext(
                run_id="hidden-conic-gold",
                prompt=variant.prompt,
                route_match=match,
            ),
            skill.validate_problem_spec(match.problem_spec),
        )
    )
    assert result.playbook_json is not None
    card = score_benchmark_v2(
        manifest.benchmark_suite().by_id(variant.case_id),
        result.playbook_json,
        external_warning_count=0,
    )
    assert card.passed, card.to_dict()


def _ellipse_skill_output() -> tuple[object, dict[str, object]]:
    manifest = load_hidden_conic_manifest()
    variant = manifest.variants[0]
    skill = ConicSectionsSkillPack()
    match = skill.heuristic_match(SkillRouteInput(prompt=variant.prompt))
    assert match is not None and match.problem_spec is not None
    result = asyncio.run(
        skill.execute(
            SkillExecutionContext(
                run_id="hidden-conic-negative",
                prompt=variant.prompt,
                route_match=match,
            ),
            skill.validate_problem_spec(match.problem_spec),
        )
    )
    assert result.playbook_json is not None
    expectation = manifest.benchmark_suite().by_id(variant.case_id)
    return expectation, json.loads(result.playbook_json)
