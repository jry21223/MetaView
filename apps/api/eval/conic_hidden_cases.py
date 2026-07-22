from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, field_validator, model_validator

from eval.benchmark_v2 import (
    MANDATORY_HARD_FAILS,
    BenchmarkV2Suite,
    CodeSyncExpectation,
    ConclusionExpectation,
    DeterministicValidationExpectation,
    GoldCaseExpectation,
    TextFactExpectation,
)
from eval.conic_math_validation import validate_conic_parameters

DEFAULT_CONIC_HIDDEN_MANIFEST = (
    Path(__file__).parents[3] / "eval" / "hidden-cases" / "conic-sections" / "variants.json"
)
DEFAULT_CONIC_ARCHETYPE_CATALOG = Path(__file__).parents[3] / "contracts" / "conic-archetypes.json"


class ConicExpectedFactRule(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(min_length=1)
    description: str = Field(min_length=1)
    any_of: list[str] = Field(alias="anyOf", min_length=1)
    tolerance: float | None = Field(default=None, gt=0)


class ConicVisualInvariant(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(min_length=1)
    description: str = Field(min_length=1)
    required_semantic_roles: list[str] = Field(alias="requiredSemanticRoles", min_length=1)
    required_state_fields: list[str] = Field(alias="requiredStateFields", min_length=1)


class ConicPedagogicalRubric(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    objective: str = Field(min_length=1)
    required_phases: list[str] = Field(alias="requiredPhases", min_length=1)
    minimum_steps: int = Field(alias="minimumSteps", ge=1)


class ConicArchetypeMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    archetype_id: str = Field(alias="archetypeId", pattern=r"^conic\.")
    public_case_id: str = Field(alias="publicCaseId", min_length=1)
    required_capabilities: list[str] = Field(alias="requiredCapabilities", min_length=1)
    expected_facts: list[ConicExpectedFactRule] = Field(alias="expectedFacts", min_length=1)
    visual_invariants: list[ConicVisualInvariant] = Field(alias="visualInvariants", min_length=1)
    pedagogical_rubric: ConicPedagogicalRubric = Field(alias="pedagogicalRubric")

    @model_validator(mode="after")
    def validate_fact_ids(self) -> "ConicArchetypeMetadata":
        fact_ids = [fact.id for fact in self.expected_facts]
        if len(fact_ids) != len(set(fact_ids)):
            raise ValueError("fact rule IDs must be unique within an archetype")
        return self


class ConicArchetypeCatalog(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    schema_version: Literal["1.0.0"] = Field(alias="schemaVersion")
    subject: Literal["high_school_math"]
    domain: Literal["conic_sections"]
    archetypes: list[ConicArchetypeMetadata] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_ids(self) -> "ConicArchetypeCatalog":
        archetype_ids = [item.archetype_id for item in self.archetypes]
        if len(archetype_ids) != len(set(archetype_ids)):
            raise ValueError("conic archetype IDs must be unique")
        public_case_ids = [item.public_case_id for item in self.archetypes]
        if len(public_case_ids) != len(set(public_case_ids)):
            raise ValueError("conic public case IDs must be unique")
        return self

    def by_id(self, archetype_id: str) -> ConicArchetypeMetadata:
        for archetype in self.archetypes:
            if archetype.archetype_id == archetype_id:
                return archetype
        raise KeyError(f"Unknown conic archetype: {archetype_id}")


class HiddenConicVariant(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    case_id: str = Field(alias="caseId", min_length=1)
    archetype_id: str = Field(alias="archetypeId", pattern=r"^conic\.")
    prompt: str = Field(min_length=1)
    parameters: dict[str, Any]
    fact_evidence: dict[str, list[str]] = Field(alias="factEvidence", min_length=1)
    conclusion_aliases: list[list[str]] = Field(alias="conclusionAliases", min_length=1)
    forbidden_aliases: list[str] = Field(alias="forbiddenAliases", default_factory=list)

    @field_validator("fact_evidence")
    @classmethod
    def validate_fact_evidence(cls, value: dict[str, list[str]]) -> dict[str, list[str]]:
        if any(
            not fact_id.strip() or not aliases or any(not alias.strip() for alias in aliases)
            for fact_id, aliases in value.items()
        ):
            raise ValueError("fact evidence requires non-blank IDs and aliases")
        return value


class HiddenConicManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    schema_version: Literal["1.0.0"] = Field(alias="schemaVersion")
    subject: Literal["high_school_math"]
    domain: Literal["conic_sections"]
    visibility: Literal["hidden_eval"]
    variants: list[HiddenConicVariant] = Field(min_length=12)
    _catalog: ConicArchetypeCatalog | None = PrivateAttr(default=None)

    @model_validator(mode="after")
    def validate_pack_shape(self) -> "HiddenConicManifest":
        case_ids = [item.case_id for item in self.variants]
        if len(case_ids) != len(set(case_ids)):
            raise ValueError("hidden conic case IDs must be unique")
        return self

    def bind_catalog(self, catalog: ConicArchetypeCatalog) -> "HiddenConicManifest":
        counts = Counter(item.archetype_id for item in self.variants)
        known_ids = {item.archetype_id for item in catalog.archetypes}
        unknown_ids = set(counts) - known_ids
        if unknown_ids:
            raise ValueError(f"unknown conic archetype: {sorted(unknown_ids)}")
        missing_ids = known_ids - set(counts)
        if missing_ids:
            raise ValueError(f"hidden conic variants missing archetypes: {sorted(missing_ids)}")
        if any(count < 2 for count in counts.values()):
            raise ValueError("each conic archetype requires at least two hidden variants")
        for variant in self.variants:
            archetype = catalog.by_id(variant.archetype_id)
            known_fact_ids = {fact.id for fact in archetype.expected_facts}
            unknown_fact_ids = set(variant.fact_evidence) - known_fact_ids
            if unknown_fact_ids:
                raise ValueError(
                    f"unknown conic fact IDs for {variant.case_id}: {sorted(unknown_fact_ids)}"
                )
            validate_conic_parameters(variant.archetype_id, variant.parameters)
        self._catalog = catalog
        return self

    def archetype_for(self, variant: HiddenConicVariant) -> ConicArchetypeMetadata:
        if self._catalog is None:
            raise RuntimeError("hidden conic manifest is not bound to its archetype catalog")
        return self._catalog.by_id(variant.archetype_id)

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
            cases=[_expectation(item, self.archetype_for(item)) for item in self.variants],
        )


def load_conic_archetype_catalog(
    path: Path = DEFAULT_CONIC_ARCHETYPE_CATALOG,
) -> ConicArchetypeCatalog:
    return ConicArchetypeCatalog.model_validate_json(path.read_text(encoding="utf-8"))


def load_hidden_conic_manifest(
    path: Path = DEFAULT_CONIC_HIDDEN_MANIFEST,
    *,
    catalog_path: Path = DEFAULT_CONIC_ARCHETYPE_CATALOG,
) -> HiddenConicManifest:
    catalog = load_conic_archetype_catalog(catalog_path)
    manifest = HiddenConicManifest.model_validate_json(path.read_text(encoding="utf-8"))
    return manifest.bind_catalog(catalog)


def _expectation(
    variant: HiddenConicVariant,
    archetype: ConicArchetypeMetadata,
) -> GoldCaseExpectation:
    semantic_roles = list(
        dict.fromkeys(
            role
            for invariant in archetype.visual_invariants
            for role in invariant.required_semantic_roles
        )
    )
    state_fields = list(
        dict.fromkeys(
            field
            for invariant in archetype.visual_invariants
            for field in invariant.required_state_fields
        )
    )
    return GoldCaseExpectation(
        id=variant.case_id,
        expected_domains=["math"],
        required_snapshot_kinds=["math_scene"],
        forbidden_snapshot_kinds=["algorithm_array", "narration_card"],
        required_scene_types=[variant.archetype_id],
        required_semantic_roles=semantic_roles,
        required_asset_ids=[],
        required_text_facts=[
            TextFactExpectation(id=fact_id, any_of=aliases)
            for fact_id, aliases in variant.fact_evidence.items()
        ],
        forbidden_text_facts=(
            [TextFactExpectation(id="forbidden_conclusion", any_of=variant.forbidden_aliases)]
            if variant.forbidden_aliases
            else []
        ),
        required_state_fields=state_fields,
        required_state_values={},
        expected_conclusion=ConclusionExpectation(
            statement=f"Expected conclusion for {variant.archetype_id}",
            all_of=variant.conclusion_aliases,
            none_of=variant.forbidden_aliases,
        ),
        code_sync=CodeSyncExpectation(required=False),
        deterministic_validation=DeterministicValidationExpectation(
            validator=variant.archetype_id,
            parameters=variant.parameters,
        ),
        maximum_warning_count=0,
        hard_fail_conditions=sorted({*MANDATORY_HARD_FAILS, "invalid_deterministic_math"}),
    )
