from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class ExportJobStatus(str, Enum):
    QUEUED = "queued"
    BUNDLING = "bundling"
    GENERATING_AUDIO = "generating_audio"
    RENDERING = "rendering"
    COMPLETED = "completed"
    FAILED = "failed"


class TtsConfig(BaseModel):
    """Caller-supplied TTS provider config (LLM provider config is unrelated).

    Used when ``with_audio=True``. The export use case falls back to the
    server-side ``METAVIEW_TTS_*`` settings when ``api_key`` is omitted, so
    the front-end no longer needs to ship a secret in the request body —
    that lines up with issue #40 (playback also runs through the server).
    """

    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None
    voice: str = "alloy"


class ExportJob(BaseModel):
    job_id: str
    run_id: str
    status: ExportJobStatus = ExportJobStatus.QUEUED
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    message: str | None = None
    output_path: str | None = None
    error: str | None = None
    with_audio: bool = False
    created_at: str
