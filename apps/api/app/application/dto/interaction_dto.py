from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator

from app.domain.models.director import DirectorScript
from app.domain.models.playbook import PlaybookScript


class StrictInteractionModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DerivativeInteractionEvent(StrictInteractionModel):
    adapter_id: Literal["math.derivative-tangent"]
    step_id: str = Field(min_length=1, max_length=120)
    target_id: str = Field(min_length=1, max_length=180)
    action: Literal["set-value"]
    value: FiniteFloat
    sequence: int = Field(ge=1, le=10_000)

    @model_validator(mode="after")
    def validate_semantic_target(self) -> "DerivativeInteractionEvent":
        if self.target_id != f"step:{self.step_id}:marker-x":
            raise ValueError("derivative interaction target must be the semantic marker-x id")
        return self


class BfsInteractionEvent(StrictInteractionModel):
    adapter_id: Literal["algorithm.bfs"]
    step_id: str = Field(min_length=1, max_length=120)
    target_id: str = Field(min_length=1, max_length=180)
    action: Literal["select"]
    value: str = Field(min_length=1, max_length=120)
    sequence: int = Field(ge=1, le=10_000)

    @model_validator(mode="after")
    def validate_semantic_target(self) -> "BfsInteractionEvent":
        if self.target_id != f"step:{self.step_id}:start-node":
            raise ValueError("BFS interaction target must be the semantic start-node id")
        return self


InteractionEvent = Annotated[
    DerivativeInteractionEvent | BfsInteractionEvent,
    Field(discriminator="adapter_id"),
]


def _validate_event_order(
    events: list[InteractionEvent],
    *,
    require_start_at_one: bool,
) -> None:
    sequences = [event.sequence for event in events]
    if require_start_at_one and sequences and sequences[0] != 1:
        raise ValueError("interaction event sequences must start at 1")
    if any(
        current != previous + 1
        for previous, current in zip(sequences, sequences[1:], strict=False)
    ):
        raise ValueError("interaction event sequences must be contiguous and increasing")


class InteractionFollowUpContext(StrictInteractionModel):
    manifest_version: Literal["1"]
    events: list[InteractionEvent] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def validate_event_order(self) -> "InteractionFollowUpContext":
        _validate_event_order(self.events, require_start_at_one=False)
        return self


class ApplyInteractionVersionRequest(StrictInteractionModel):
    manifest_version: Literal["1"]
    events: list[InteractionEvent] = Field(min_length=1, max_length=100)
    base_version_id: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def validate_event_order(self) -> "ApplyInteractionVersionRequest":
        _validate_event_order(self.events, require_start_at_one=True)
        return self


class ApplyInteractionVersionResponse(BaseModel):
    version_id: str
    summary: str
    playbook: PlaybookScript
    director: DirectorScript
