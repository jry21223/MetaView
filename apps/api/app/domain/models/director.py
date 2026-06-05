from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

DirectorIntent = Literal["hook", "focus", "reveal", "summary", "explain"]
DirectorShotType = Literal["wide", "medium", "close"]
DirectorCameraMotion = Literal["hold", "push_in", "pull_out", "pan_left", "pan_right"]
DirectorPacing = Literal["fast", "normal", "slow"]


class DirectorBeat(BaseModel):
    beat_id: str = Field(min_length=1)
    step_id: str = Field(min_length=1)
    start_frame: int = Field(ge=0)
    end_frame: int = Field(ge=1)
    intent: DirectorIntent
    shot_type: DirectorShotType
    camera_motion: DirectorCameraMotion
    pacing: DirectorPacing
    voiceover_text: str = ""
    emphasis_terms: list[str] = Field(default_factory=list, max_length=6)

    @model_validator(mode="after")
    def validate_frame_range(self) -> DirectorBeat:
        if self.end_frame <= self.start_frame:
            raise ValueError("end_frame must be greater than start_frame")
        return self


class DirectorScript(BaseModel):
    schema_version: str = "1.0.0"
    source: str = Field(default="rule", min_length=1)
    run_id: str = Field(min_length=1)
    beats: list[DirectorBeat] = Field(default_factory=list)
