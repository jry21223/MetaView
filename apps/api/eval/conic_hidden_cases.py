from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from eval.benchmark_v2 import (
    MANDATORY_HARD_FAILS,
    BenchmarkV2Suite,
    CodeSyncExpectation,
    ConclusionExpectation,
    GoldCaseExpectation,
    TextFactExpectation,
)

DEFAULT_CONIC_HIDDEN_MANIFEST = (
    Path(__file__).parents[3] / "eval" / "hidden-cases" / "conic-sections" / "variants.json"
)


class HiddenExpectedFact(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(min_length=1)
    any_of: list[str] = Field(alias="anyOf", min_length=1)


class HiddenConicVariant(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    case_id: str = Field(alias="caseId", min_length=1)
    archetype_id: str = Field(alias="archetypeId", pattern=r"^conic\.")
    title: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    parameters: dict[str, Any]
    expected_facts: list[HiddenExpectedFact] = Field(alias="expectedFacts", min_length=1)
    required_semantic_roles: list[str] = Field(alias="requiredSemanticRoles", min_length=1)
    required_state_fields: list[str] = Field(alias="requiredStateFields", min_length=1)
    conclusion_aliases: list[list[str]] = Field(alias="conclusionAliases", min_length=1)
    forbidden_aliases: list[str] = Field(alias="forbiddenAliases", default_factory=list)


class HiddenConicManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    schema_version: Literal["1.0.0"] = Field(alias="schemaVersion")
    subject: Literal["high_school_math"]
    domain: Literal["conic_sections"]
    visibility: Literal["hidden_eval"]
    variants: list[HiddenConicVariant] = Field(min_length=12)

    @model_validator(mode="after")
    def validate_pack_shape(self) -> "HiddenConicManifest":
        case_ids = [item.case_id for item in self.variants]
        if len(case_ids) != len(set(case_ids)):
            raise ValueError("hidden conic case IDs must be unique")
        counts = Counter(item.archetype_id for item in self.variants)
        if len(counts) != 6 or any(count < 2 for count in counts.values()):
            raise ValueError("V1 requires six archetypes with at least two variants each")
        return self

    def prompts(self) -> list[dict[str, str]]:
        return [
            {
                "id": item.case_id,
                "domain": "math",
                "prompt": item.prompt,
                "note": f"hidden_eval archetype={item.archetype_id}",
            }
            for item in self.variants
        ]

    def benchmark_suite(self) -> BenchmarkV2Suite:
        return BenchmarkV2Suite(
            schema_version="2.0.0",
            cases=[_expectation(item) for item in self.variants],
        )


def load_hidden_conic_manifest(
    path: Path = DEFAULT_CONIC_HIDDEN_MANIFEST,
) -> HiddenConicManifest:
    return HiddenConicManifest.model_validate_json(path.read_text(encoding="utf-8"))


def _expectation(variant: HiddenConicVariant) -> GoldCaseExpectation:
    return GoldCaseExpectation(
        id=variant.case_id,
        expected_domains=["math"],
        required_snapshot_kinds=["math_scene"],
        forbidden_snapshot_kinds=["algorithm_array", "narration_card"],
        required_scene_types=[variant.archetype_id],
        required_semantic_roles=variant.required_semantic_roles,
        required_asset_ids=[],
        required_text_facts=[
            TextFactExpectation(id=item.id, any_of=item.any_of)
            for item in variant.expected_facts
        ],
        forbidden_text_facts=(
            [TextFactExpectation(id="forbidden_conclusion", any_of=variant.forbidden_aliases)]
            if variant.forbidden_aliases
            else []
        ),
        required_state_fields=variant.required_state_fields,
        required_state_values={},
        expected_conclusion=ConclusionExpectation(
            statement=f"Expected conclusion for {variant.archetype_id}",
            all_of=variant.conclusion_aliases,
            none_of=variant.forbidden_aliases,
        ),
        code_sync=CodeSyncExpectation(required=False),
        maximum_warning_count=0,
        hard_fail_conditions=sorted(MANDATORY_HARD_FAILS),
    )
