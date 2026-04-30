from __future__ import annotations

from pydantic import BaseModel, Field

from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import PlaybookScript


class PipelineRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    domain: str | None = None
    source_code: str | None = None
    language: str = "python"
    # Per-request provider override (takes precedence over env-var config)
    provider_api_key: str | None = None
    provider_base_url: str | None = None
    provider_model: str | None = None


class PipelineRunResponse(BaseModel):
    run_id: str
    status: PipelineRunStatus
    playbook: PlaybookScript | None = None
    error: str | None = None
    created_at: str
