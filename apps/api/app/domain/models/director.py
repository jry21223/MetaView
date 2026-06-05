from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

DirectorIntent = Literal["hook", "focus", "reveal", "compare", "summary", "explain"]
DirectorShotType = Literal["wide", "medium", "close", "detail"]
DirectorCameraMotion = Literal[
    "hold",
    "push_in",
    "pull_out",
    "pan_left",
    "pan_right",
    "focus_target",
]
DirectorPacing = Literal["fast", "normal", "slow"]
DirectorSource = Literal["rule", "llm", "agent", "manual"]


class DirectorBeat(BaseModel):
    beat_id: str = Field(min_length=1)
    step_id: str = Field(min_length=1)
    start_frame: int = Field(ge=0)
    end_frame: int = Field(ge=1)
    intent: DirectorIntent
    shot_type: DirectorShotType
    camera_motion: DirectorCameraMotion
    pacing: DirectorPacing
    voiceover_text: str | None = None
    emphasis_terms: list[str] = Field(default_factory=list, max_length=6)
    focus_target: str | None = None

    @model_validator(mode="after")
    def validate_frame_range(self) -> DirectorBeat:
        if self.end_frame <= self.start_frame:
            raise ValueError("end_frame must be greater than start_frame")
        return self


class DirectorScript(BaseModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    source: DirectorSource = "rule"
    run_id: str = Field(min_length=1)
    beats: list[DirectorBeat] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_non_overlapping_beats(self) -> DirectorScript:
        ordered = sorted(self.beats, key=lambda beat: (beat.start_frame, beat.end_frame))
        for previous, current in zip(ordered, ordered[1:], strict=False):
            if current.start_frame < previous.end_frame:
                raise ValueError("director beats must not overlap")
        return self
