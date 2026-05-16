"""TTS proxy router — issue #40.

Routes ``POST /tts/speech`` through the server-side OpenAI key so the player
never stores secrets in ``localStorage`` and the front-end never makes a
cross-origin request to the upstream TTS provider.
"""

from __future__ import annotations

from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from starlette.requests import Request

from app.config import Settings, get_settings
from app.presentation.rate_limit import write_limit

router = APIRouter(prefix="/tts", tags=["tts"])


class TtsSpeechRequest(BaseModel):
    """Audio synthesis request body."""

    text: str = Field(min_length=1, max_length=8000)
    voice: str | None = Field(default=None, max_length=64)
    rate: float = Field(default=1.0, ge=0.25, le=4.0)
    model: str | None = Field(default=None, max_length=64)
    response_format: str = Field(default="mp3", max_length=8)


def _resolve_api_key(settings: Settings) -> str:
    """Return the configured TTS key, falling back to the LLM key.

    Operators can either set ``METAVIEW_TTS_API_KEY`` directly or reuse
    ``METAVIEW_OPENAI_API_KEY`` for hobby setups.
    """
    key = (settings.tts_api_key or settings.openai_api_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="TTS not configured: set METAVIEW_TTS_API_KEY or METAVIEW_OPENAI_API_KEY",
        )
    return key


@router.post("/speech")
@write_limit()
async def synthesize_speech(
    request: Request,
    payload: TtsSpeechRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    """Forward a text→audio request to the configured TTS provider.

    Returns the audio bytes directly so the browser can decode through the
    existing AudioContext pipeline without rebuilding the cache layer.
    """
    api_key = _resolve_api_key(settings)
    voice = payload.voice or settings.tts_default_voice
    model = payload.model or settings.tts_model

    body = {
        "model": model,
        "input": payload.text,
        "voice": voice,
        "speed": payload.rate,
        "response_format": payload.response_format,
    }

    timeout = httpx.Timeout(settings.tts_timeout_s)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            upstream = await client.post(
                f"{settings.tts_base_url.rstrip('/')}/audio/speech",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502, detail=f"TTS upstream unreachable: {exc}"
            ) from exc

    if upstream.status_code >= 400:
        # Surface a sanitized message — never leak the upstream auth header,
        # but pass through enough detail for the client to retry intelligently.
        detail = (
            upstream.text[:300]
            if upstream.headers.get("content-type", "").startswith("application/json")
            else f"upstream returned {upstream.status_code}"
        )
        raise HTTPException(status_code=upstream.status_code, detail=detail)

    media_type = upstream.headers.get("content-type", "audio/mpeg")
    return Response(content=upstream.content, media_type=media_type)
