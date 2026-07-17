from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.models.lesson_plan import LessonPlan
from app.domain.models.quality_report import QualityScoreDimension

NonBlankString = Annotated[str, Field(min_length=1)]


class FactRequirement(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    fact_id: NonBlankString
    description: NonBlankString
    validator_id: NonBlankString


class AssetRequirement(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    semantic_role: NonBlankString
    asset_id: NonBlankString | None = None
    pack_id: NonBlankString | None = None
    required: bool = True

    @model_validator(mode="after")
    def require_pack_for_explicit_asset(self) -> "AssetRequirement":
        if self.required and (self.asset_id is None or self.pack_id is None):
            raise ValueError("required asset needs an explicit pack_id and asset_id")
        if self.asset_id is not None and self.pack_id is None:
            raise ValueError("explicit asset_id requires an auditable pack_id")
        if self.pack_id is not None and self.asset_id is None:
            raise ValueError("pack_id cannot be selected without an asset_id")
        return self


class QualityExpectation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dimension: QualityScoreDimension
    minimum_score: float = Field(ge=0.0, le=1.0)
    blocking: bool = True


class SkillRecipe(BaseModel):
    """Transient, data-only execution recipe for composable coverage."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    schema_version: Literal["1.0.0"]
    recipe_id: NonBlankString
    domain: NonBlankString
    lesson_plan: LessonPlan
    required_facts: list[FactRequirement]
    allowed_tool_ids: list[NonBlankString] = Field(min_length=1)
    required_validator_ids: list[NonBlankString] = Field(min_length=1)
    allowed_scene_types: list[NonBlankString] = Field(min_length=1)
    allowed_snapshot_kinds: list[NonBlankString] = Field(min_length=1)
    asset_requirements: list[AssetRequirement]
    quality_expectations: list[QualityExpectation] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_recipe_contract(self) -> "SkillRecipe":
        if self.domain != self.lesson_plan.domain:
            raise ValueError("recipe domain must match lesson_plan.domain")

        unique_lists = {
            "allowed_tool_ids": self.allowed_tool_ids,
            "required_validator_ids": self.required_validator_ids,
            "allowed_scene_types": self.allowed_scene_types,
            "allowed_snapshot_kinds": self.allowed_snapshot_kinds,
        }
        for field_name, values in unique_lists.items():
            if len(values) != len(set(values)):
                raise ValueError(f"{field_name} values must be unique")

        fact_ids = [fact.fact_id for fact in self.required_facts]
        if len(fact_ids) != len(set(fact_ids)):
            raise ValueError("required_facts fact_id values must be unique")
        planned_fact_ids = {
            fact_id
            for scene in self.lesson_plan.scenes
            for fact_id in scene.required_fact_ids
        }
        if not planned_fact_ids <= set(fact_ids):
            missing = sorted(planned_fact_ids - set(fact_ids))
            raise ValueError(f"required_facts must cover LessonPlan facts: {missing}")

        required_validators = set(self.required_validator_ids)
        if not required_validators <= set(self.allowed_tool_ids):
            raise ValueError("required validators must also be allowed tools")
        if any(fact.validator_id not in required_validators for fact in self.required_facts):
            raise ValueError("every fact validator_id must be required by the recipe")

        preferred_scene_types = {
            scene.preferred_scene_type
            for scene in self.lesson_plan.scenes
            if scene.preferred_scene_type is not None
        }
        if not preferred_scene_types <= set(self.allowed_scene_types):
            raise ValueError("allowed_scene_types must cover LessonPlan scene preferences")

        roles = [asset.semantic_role for asset in self.asset_requirements]
        if len(roles) != len(set(roles)):
            raise ValueError("asset requirement semantic_role values must be unique")
        dimensions = [expectation.dimension for expectation in self.quality_expectations]
        if len(dimensions) != len(set(dimensions)):
            raise ValueError("quality expectation dimensions must be unique")
        return self


__all__ = [
    "AssetRequirement",
    "FactRequirement",
    "QualityExpectation",
    "SkillRecipe",
]
