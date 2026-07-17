"""TTS proxy router — issue #40.

Routes ``POST /tts/speech`` through the server-side OpenAI key so the player
never stores secrets in ``localStorage`` and the front-end never makes a
cross-origin request to the upstream TTS provider.
"""

from __future__ import annotations

import re
from typing import Annotated, Final

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from starlette.requests import Request

from app.application.use_cases.account import AccountUseCase
from app.config import Settings, get_settings
from app.presentation.dependencies import get_account_use_case
from app.presentation.edition_policy import require_wechat_session
from app.presentation.rate_limit import write_limit

router = APIRouter(prefix="/tts", tags=["tts"])

_BEARER_TOKEN_RE: Final = re.compile(r"Bearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE)
_OPENAI_KEY_RE: Final = re.compile(r"sk-[A-Za-z0-9._-]{8,}", re.IGNORECASE)
_SECRET_FIELD_RE: Final = re.compile(
    r'(?P<quote>"?)(?P<key>api[_-]?key|authorization|token)'
    r'(?P=quote)(?P<sep>\s*[:=]\s*")(?P<value>[^"]+)(?P<end>")',
    re.IGNORECASE,
)


class TtsSpeechRequest(BaseModel):
    """Audio synthesis request body."""

    text: str = Field(min_length=1, max_length=8000)
    voice: str | None = Field(default=None, max_length=64)
    rate: float = Field(default=1.0, ge=0.25, le=4.0)
    model: str | None = Field(default=None, max_length=64)
    api_key: str | None = Field(default=None, max_length=4096)
    base_url: str | None = Field(default=None, max_length=2048)
    response_format: str = Field(default="mp3", max_length=8)


def _resolve_api_key(settings: Settings, payload: TtsSpeechRequest) -> str:
    """Return the configured TTS key, falling back to the LLM key.

    Operators can either set ``METAVIEW_TTS_API_KEY`` directly or reuse
    ``METAVIEW_OPENAI_API_KEY`` for hobby setups.
    """
    key = (payload.api_key or settings.tts_api_key or settings.openai_api_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="TTS not configured: set METAVIEW_TTS_API_KEY or METAVIEW_OPENAI_API_KEY",
        )
    return key


def _resolve_base_url(settings: Settings, payload: TtsSpeechRequest) -> str:
    if payload.base_url:
        return payload.base_url
    return settings.tts_base_url


def _resolve_model(settings: Settings, payload: TtsSpeechRequest) -> str:
    if payload.model:
        return payload.model
    return settings.tts_model


def _redact_secret_field(match: re.Match[str]) -> str:
    quote = match.group("quote")
    key = match.group("key")
    sep = match.group("sep")
    end = match.group("end")
    return f"{quote}{key}{quote}{sep}[REDACTED]{end}"


def _sanitize_upstream_error(text: str, status_code: int) -> str:
    """Return bounded upstream error detail without leaking credentials."""
    detail = text[:300].strip()
    if not detail:
        return f"upstream returned {status_code}"
    detail = _BEARER_TOKEN_RE.sub("Bearer [REDACTED]", detail)
    detail = _OPENAI_KEY_RE.sub("sk-[REDACTED]", detail)
    detail = _SECRET_FIELD_RE.sub(_redact_secret_field, detail)
    return detail


@router.post("/speech")
@write_limit()
async def synthesize_speech(
    request: Request,
    payload: TtsSpeechRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    account_use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
) -> Response:
    """Forward a text→audio request to the configured TTS provider.

    Returns the audio bytes directly so the browser can decode through the
    existing AudioContext pipeline without rebuilding the cache layer.
    """
    if settings.app_edition == "ops":
        await require_wechat_session(request, settings, account_use_case)

    api_key = _resolve_api_key(settings, payload)
    voice = payload.voice or settings.tts_default_voice
    model = _resolve_model(settings, payload)
    base_url = _resolve_base_url(settings, payload)

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
                f"{base_url.rstrip('/')}/audio/speech",
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
        content_type = upstream.headers.get("content-type", "")
        detail = (
            _sanitize_upstream_error(upstream.text, upstream.status_code)
            if content_type.startswith("application/json")
            else f"upstream returned {upstream.status_code}"
        )
        raise HTTPException(status_code=upstream.status_code, detail=detail)

    media_type = upstream.headers.get("content-type", "audio/mpeg")
    return Response(content=upstream.content, media_type=media_type)
