from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

LessonArc = Literal[
    "intuition_to_abstraction",
    "problem_to_solution",
    "state_transition",
    "comparison",
    "derivation",
]
SceneStrategy = Literal[
    "intuition",
    "demonstration",
    "derivation",
    "comparison",
    "state_transition",
    "summary",
]
NonBlankString = Annotated[str, Field(min_length=1)]


class SceneIntent(BaseModel):
    """One pedagogical decision, without renderer or layout details."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    scene_id: NonBlankString
    teaching_goal: NonBlankString
    strategy: SceneStrategy
    required_fact_ids: list[NonBlankString]
    required_visual_roles: list[NonBlankString]
    preferred_scene_type: NonBlankString | None
    narration_goal: NonBlankString


class LessonPlan(BaseModel):
    """Renderer-independent teaching plan shared by every generation path."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    schema_version: Literal["1.0.0"]
    domain: NonBlankString
    title: NonBlankString
    learning_objectives: list[NonBlankString] = Field(min_length=1)
    prerequisites: list[NonBlankString]
    misconceptions: list[NonBlankString]
    expected_conclusion: NonBlankString
    lesson_arc: LessonArc
    scenes: list[SceneIntent] = Field(min_length=1)

    @model_validator(mode="after")
    def require_unique_scene_ids(self) -> "LessonPlan":
        scene_ids = [scene.scene_id for scene in self.scenes]
        if len(scene_ids) != len(set(scene_ids)):
            raise ValueError("scene_id values must be unique within a LessonPlan")
        return self


__all__ = ["LessonArc", "LessonPlan", "SceneIntent", "SceneStrategy"]
