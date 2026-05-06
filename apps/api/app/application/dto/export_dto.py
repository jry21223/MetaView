from __future__ import annotations

from pydantic import BaseModel

from app.domain.models.export_job import ExportJobStatus, TtsConfig


class ExportRequest(BaseModel):
    run_id: str
    with_audio: bool = False
    tts: TtsConfig | None = None


class ExportJobResponse(BaseModel):
    job_id: str
    run_id: str
    status: ExportJobStatus
    progress: float
    message: str | None = None
    output_url: str | None = None
    error: str | None = None
    with_audio: bool
    created_at: str
