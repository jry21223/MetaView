from __future__ import annotations

import asyncio
from collections import Counter
from pathlib import Path

from app.domain.skills.base import SkillExecutionContext, SkillRouteInput
from app.domain.skills.conic_sections.skill_pack import ConicSectionsSkillPack
from eval.benchmark_v2 import score_benchmark_v2
from eval.conic_hidden_cases import load_hidden_conic_manifest

ROOT = Path(__file__).resolve().parents[3]


def test_hidden_manifest_has_two_variants_per_archetype_and_never_enters_web_source() -> None:
    manifest = load_hidden_conic_manifest()
    assert len(manifest.variants) == 12
    assert Counter(item.archetype_id for item in manifest.variants) == {
        "conic.ellipse.focus-definition": 2,
        "conic.parabola.focus-directrix": 2,
        "conic.hyperbola.asymptotes": 2,
        "conic.line-ellipse.position": 2,
        "conic.ellipse.chord-midpoint-locus": 2,
        "conic.pole-polar.circle": 2,
    }
    for source in (ROOT / "apps" / "web" / "src").rglob("*"):
        if source.suffix in {".ts", ".tsx", ".js", ".mjs", ".css"}:
            assert "eval/hidden-cases" not in source.read_text(encoding="utf-8")


def test_hidden_manifest_derives_prompts_and_gold_expectations_without_playbooks() -> None:
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
