from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator

from app.domain.models.coverage import CoverageDecision
from app.domain.models.director import DirectorScript
from app.domain.models.lesson_plan import LessonPlan
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import PlaybookScript
from app.domain.models.quality_report import QualityReport
from app.domain.models.review import CirReviewReport, PlaybookReviewVerdict
from app.domain.models.run_span import RunTelemetrySummary


class PipelineRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    domain: str | None = None
    source_code: str | None = None
    language: str | None = None
    source_filename: str | None = Field(default=None, max_length=255)
    source_size_bytes: int | None = Field(default=None, ge=0, le=256 * 1024)
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

    @field_validator(
        "provider_api_key",
        "provider_base_url",
        "provider_model",
        "router_model",
        "domain",
        "language",
        "source_filename",
        mode="before",
    )
    @classmethod
    def normalize_optional_string(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_source_metadata(self):
        metadata = (self.language, self.source_filename, self.source_size_bytes)
        if self.source_code is None and any(value is not None for value in metadata):
            raise ValueError("source metadata requires source_code")
        if self.source_code is not None and len(self.source_code.encode("utf-8")) > 256 * 1024:
            raise ValueError("source_code cannot exceed 256 KB")
        return self


class PipelineRunResponse(BaseModel):
    run_id: str
    status: PipelineRunStatus
    prompt: str = ""
    playbook: PlaybookScript | None = None
    director: DirectorScript | None = None
    error: str | None = None
    created_at: str
    review: CirReviewReport | PlaybookReviewVerdict | None = None
    quality_report: QualityReport | None = None
    lesson_plan: LessonPlan | None = None
    coverage_decision: CoverageDecision | None = None
    telemetry: RunTelemetrySummary | None = None
