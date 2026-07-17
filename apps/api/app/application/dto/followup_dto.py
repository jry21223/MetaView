from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator

from app.domain.models.director import DirectorScript
from app.domain.models.playbook import PlaybookScript


class FollowUpChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class DerivativeInteractionEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

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


class BfsInteractionEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

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


class InteractionFollowUpContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    manifest_version: Literal["1"]
    events: list[InteractionEvent] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def validate_event_order(self) -> "InteractionFollowUpContext":
        sequences = [event.sequence for event in self.events]
        if any(
            current != previous + 1
            for previous, current in zip(sequences, sequences[1:], strict=False)
        ):
            raise ValueError("interaction event sequences must be contiguous and increasing")
        return self


class FollowUpRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=2000)
    messages: list[FollowUpChatMessage] = Field(default_factory=list, max_length=12)
    intent: Literal["conversation", "explain_interaction"] = "conversation"
    interaction_context: InteractionFollowUpContext | None = None
    base_version_id: str | None = Field(default=None, max_length=80)
    provider_api_key: str | None = Field(default=None, max_length=4096)
    provider_base_url: str | None = Field(default=None, max_length=512)
    provider_model: str | None = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def validate_interaction_intent(self) -> "FollowUpRequest":
        if self.intent == "explain_interaction" and self.interaction_context is None:
            raise ValueError("explain_interaction requires interaction_context")
        if self.intent == "conversation" and self.interaction_context is not None:
            raise ValueError("interaction_context is only accepted for explicit explanation")
        return self


class FollowUpResponse(BaseModel):
    kind: Literal["reply", "patch"]
    reply: str
    change_summary: str
    version_id: str | None
    playbook: PlaybookScript | None = None
    director: DirectorScript | None = None


class RunFollowUpRecord(BaseModel):
    followup_id: str
    run_id: str
    user_message: str
    assistant_reply: str
    change_summary: str
    patch_json: str
    version_id: str | None
    created_at: str


class RunVersionRecord(BaseModel):
    version_id: str
    short_id: str
    run_id: str
    version_number: int
    parent_version_id: str | None
    source: str
    summary: str
    followup_id: str | None
    created_at: str
    is_head: bool


class RunFollowUpsResponse(BaseModel):
    followups: list[RunFollowUpRecord]
    versions: list[RunVersionRecord]


class RestoreVersionResponse(BaseModel):
    version_id: str
    playbook: PlaybookScript
    director: DirectorScript | None = None
