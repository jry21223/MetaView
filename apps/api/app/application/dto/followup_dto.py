from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.domain.models.director import DirectorScript
from app.domain.models.playbook import PlaybookScript


class FollowUpChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class FollowUpRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    messages: list[FollowUpChatMessage] = Field(default_factory=list, max_length=12)
    base_version_id: str | None = Field(default=None, max_length=80)
    provider_api_key: str | None = Field(default=None, max_length=4096)
    provider_base_url: str | None = Field(default=None, max_length=512)
    provider_model: str | None = Field(default=None, max_length=128)


class FollowUpResponse(BaseModel):
    reply: str
    change_summary: str
    version_id: str
    playbook: PlaybookScript
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
