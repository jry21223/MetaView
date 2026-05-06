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

    Required when ``with_audio=True``. Backend uses an OpenAI-compatible TTS
    endpoint (POST {base_url}/audio/speech). Voice/model defaults match the
    OpenAI ``tts-1`` API.
    """

    api_key: str = Field(min_length=1)
    base_url: str = "https://api.openai.com/v1"
    model: str = "tts-1"
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
