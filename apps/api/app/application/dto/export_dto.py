from __future__ import annotations

from pydantic import BaseModel

from app.domain.models.export_job import (
    ExportAssetReport,
    ExportJobStatus,
    ExportOptions,
    TtsConfig,
)


class ExportRequest(BaseModel):
    run_id: str
    version_id: str | None = None
    with_audio: bool = False
    tts: TtsConfig | None = None
    options: ExportOptions | None = None
    asset_report: ExportAssetReport | None = None


class ExportJobResponse(BaseModel):
    job_id: str
    run_id: str
    status: ExportJobStatus
    progress: float
    message: str | None = None
    output_url: str | None = None
    asset_report_url: str | None = None
    asset_report_warning: str | None = None
    error: str | None = None
    with_audio: bool
    created_at: str
