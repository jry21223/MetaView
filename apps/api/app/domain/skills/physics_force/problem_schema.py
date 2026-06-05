from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ForceVectorSpec(BaseModel):
    label: str = Field(min_length=1)
    target: str = Field(min_length=1)
    magnitude: float | None = None
    angle_degrees: float | None = None


class PhysicsForceProblemSpec(BaseModel):
    problem_type: Literal["physics_force"] = "physics_force"
    body_id: str = Field(min_length=1)
    forces: list[ForceVectorSpec] = Field(default_factory=list)
    director_focus_targets: list[str] = Field(default_factory=list)
