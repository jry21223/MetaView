from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.domain.models.director import DirectorScript
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import PlaybookScript
from app.domain.models.review import CirReviewReport, PlaybookReviewVerdict


class PipelineRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    domain: str | None = None
    source_code: str | None = None
    language: str = "python"
    skill_mode_override: str | None = None
    # Per-request provider override (takes precedence over env-var config)
    provider_api_key: str | None = None
    provider_base_url: str | None = None
    provider_model: str | None = None
    # Per-request router override. This lets the self-hosted Settings page pick
    # a small/cheap router model independently from the generation model.
    router_mode: str | None = None
    router_model: str | None = None
    router_min_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    router_timeout_s: float | None = Field(default=None, ge=1.0, le=60.0)

    @field_validator("skill_mode_override", mode="before")
    @classmethod
    def normalize_skill_mode_override(cls, value):
        if value is None:
            return None
        normalized = str(value).strip().lower()
        if not normalized:
            return None
        if normalized not in {"auto", "specialized", "generic"}:
            raise ValueError("skill_mode_override must be auto, specialized, or generic")
        return normalized

    @field_validator("router_mode", mode="before")
    @classmethod
    def normalize_router_mode(cls, value):
        if value is None:
            return None
        normalized = str(value).strip().lower()
        if not normalized:
            return None
        if normalized not in {"off", "heuristic", "llm", "hybrid"}:
            raise ValueError("router_mode must be off, heuristic, llm, or hybrid")
        return normalized

    @field_validator("provider_api_key", "provider_base_url", "provider_model", "router_model", mode="before")
    @classmethod
    def normalize_optional_string(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None


class PipelineRunResponse(BaseModel):
    run_id: str
    status: PipelineRunStatus
    prompt: str = ""
    playbook: PlaybookScript | None = None
    director: DirectorScript | None = None
    error: str | None = None
    created_at: str
    review: CirReviewReport | PlaybookReviewVerdict | None = None
