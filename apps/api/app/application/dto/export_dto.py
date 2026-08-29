from __future__ import annotations

from pydantic import BaseModel

from app.domain.models.export_job import (
    ExportAssetReport,
    ExportJobStatus,
    ExportOptions,
    TtsConfig,
)


class ExportRequest(BaseModel):
    """Export a generated run, or a frozen public template case.

    Exactly one of ``run_id`` / ``template_case_id`` is required; the router
    rejects requests that set both or neither.
    """

    run_id: str | None = None
    #: Public Gold-template case id (e.g. "integral-area"). Resolved against
    #: the frozen playbook directory, never against client-supplied content.
    template_case_id: str | None = None
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
