"""Provider dialects for text-to-speech.

Vendors agree on "send text, get audio" and disagree on nearly everything
else. Two axes of spread live here:

* **Request** — OpenAI and its many clones take ``POST /audio/speech`` with a
  ``Bearer`` key and the text under ``input``. ByteDance's openspeech (火山引擎)
  takes ``POST /api/v1/tts`` with an app triple in the body and a ``Bearer;``
  header. ``build_tts_request`` composes whichever one the operator configured.
* **Response** — some answer with raw audio bytes, others wrap it in JSON as
  base64 or hex, others hand back a URL to fetch. ``response_audio``
  normalizes all of them, so response handling is dialect-independent.

Keeping both axes in one module is what lets the export pipeline and the
playback proxy behave identically for the same ``METAVIEW_TTS_PROVIDER``.
"""

from __future__ import annotations

import base64
import binascii
import contextlib
import uuid
from typing import Any, Final, NamedTuple

import httpx

OPENAI_DIALECT: Final = "openai"
VOLCANO_DIALECT: Final = "volcano"

# Default host per dialect. A base URL that still names *another* dialect's
# default is treated as unset — see ``resolve_base_url``.
BASE_URL_DEFAULTS: Final[dict[str, str]] = {
    OPENAI_DIALECT: "https://api.openai.com/v1",
    VOLCANO_DIALECT: "https://openspeech.bytedance.com",
}

_AUDIO_MAGIC: Final = (b"ID3", b"RIFF", b"OggS", b"fLaC")
# Where providers put the payload inside a JSON envelope, most specific first.
_AUDIO_PAYLOAD_KEYS: Final = ("audio", "audio_base64", "audio_content", "data")
_AUDIO_URL_KEYS: Final = ("url", "audio_url", "audio_file", "file_url")
_JSON_ENVELOPE_KEYS: Final = ("data", "output", "result", "response")


def normalize_dialect(provider: str | None) -> str:
    """Fold a configured provider name to a dialect this module implements."""

    return (provider or OPENAI_DIALECT).strip().lower() or OPENAI_DIALECT


class TtsRequest(NamedTuple):
    """One composed synthesis call: where to post, with what headers and body."""

    url: str
    headers: dict[str, str]
    body: dict[str, Any]


def resolve_base_url(provider: str | None, configured: str | None) -> str:
    """Pick the host for a dialect, ignoring a default left over from another.

    ``METAVIEW_TTS_BASE_URL`` defaults to OpenAI's host, so an operator who
    only flips ``METAVIEW_TTS_PROVIDER`` to ``volcano`` would otherwise post
    openspeech requests at api.openai.com and get a puzzling 404. A base URL
    that still equals some other dialect's default is treated as unset; an
    explicitly chosen host is always honoured.
    """

    dialect = normalize_dialect(provider)
    fallback = BASE_URL_DEFAULTS.get(dialect, BASE_URL_DEFAULTS[OPENAI_DIALECT])
    candidate = (configured or "").strip().rstrip("/")
    if not candidate:
        return fallback
    stale = {
        value.rstrip("/") for key, value in BASE_URL_DEFAULTS.items() if key != dialect
    }
    return fallback if candidate in stale else candidate


def build_tts_request(
    *,
    provider: str | None,
    base_url: str,
    api_key: str,
    model: str,
    voice: str,
    text: str,
    speed: float = 1.0,
    audio_format: str = "mp3",
    app_id: str | None = None,
    cluster: str = "volcano_tts",
) -> TtsRequest:
    """Compose one synthesis request in the dialect the provider speaks."""

    dialect = normalize_dialect(provider)
    root = base_url.rstrip("/")

    if dialect == VOLCANO_DIALECT:
        # openspeech: the app triple travels in the body, the access token in a
        # "Bearer;" header (the semicolon is theirs, not a typo), and the audio
        # comes back as base64 inside a JSON envelope.
        if not app_id:
            raise ValueError("Volcano TTS needs an app id: set METAVIEW_TTS_APP_ID")
        return TtsRequest(
            url=f"{root}/api/v1/tts",
            headers={
                "Authorization": f"Bearer;{api_key}",
                "Content-Type": "application/json",
            },
            body={
                "app": {"appid": app_id, "token": api_key, "cluster": cluster},
                "user": {"uid": "metaview"},
                "audio": {
                    "voice_type": voice,
                    "encoding": audio_format,
                    "speed_ratio": speed,
                },
                "request": {
                    "reqid": str(uuid.uuid4()),
                    "text": text,
                    "operation": "query",
                },
            },
        )

    return TtsRequest(
        url=f"{root}/audio/speech",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        body={
            "model": model,
            "voice": voice,
            "input": text,
            "speed": speed,
            # OpenAI spells the container ``response_format``; several
            # compatible providers only read ``format``. Sending both keeps one
            # request shape working across the spread — each side ignores the
            # key it does not know.
            "response_format": audio_format,
            "format": audio_format,
        },
    )


def looks_like_audio(payload: bytes) -> bool:
    """Cheap magic-byte check: is this actually an audio container?

    Guards the failure mode where a provider answers HTTP 200 with a JSON
    error body — writing that to step_000.mp3 produces a render that fails
    much later with nothing pointing back at the real cause.
    """

    if len(payload) < 8:
        return False
    if payload.startswith(_AUDIO_MAGIC):
        return True
    # Bare MPEG frame sync (mp3 without an ID3 header): 11 set bits.
    if payload[0] == 0xFF and (payload[1] & 0xE0) == 0xE0:
        return True
    # ISO base media (m4a/aac): a size-prefixed "ftyp" box.
    return payload[4:8] == b"ftyp"


def decode_audio_field(value: str) -> bytes | None:
    """Decode a base64 or hex audio payload; None when it is neither."""

    text = value.strip()
    if not text:
        return None
    with contextlib.suppress(binascii.Error, ValueError):
        decoded = base64.b64decode(text, validate=True)
        if looks_like_audio(decoded):
            return decoded
    with contextlib.suppress(ValueError):
        decoded = bytes.fromhex(text)
        if looks_like_audio(decoded):
            return decoded
    return None


def audio_from_json(body: Any) -> tuple[bytes | None, str | None]:
    """Pull audio bytes — or a URL to fetch them — out of a JSON envelope."""

    scopes = [body]
    if isinstance(body, dict):
        scopes.extend(
            body[key] for key in _JSON_ENVELOPE_KEYS if isinstance(body.get(key), dict)
        )
    for scope in scopes:
        if not isinstance(scope, dict):
            continue
        for key in _AUDIO_PAYLOAD_KEYS:
            value = scope.get(key)
            if isinstance(value, str):
                decoded = decode_audio_field(value)
                if decoded is not None:
                    return decoded, None
        for key in _AUDIO_URL_KEYS:
            value = scope.get(key)
            if isinstance(value, str) and value.startswith(("http://", "https://")):
                return None, value
    return None, None


def response_audio(resp: httpx.Response, label: str) -> tuple[bytes | None, str | None]:
    """Normalize one provider response into audio bytes or a URL to fetch.

    Raises with the provider's own words when the response carries no audio at
    all, so a misconfigured model or voice name is obvious at the first call.
    ``label`` names the caller's unit of work (a step index, "playback") and
    only ever appears in the error message.
    """

    content_type = resp.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type.startswith("audio/") or looks_like_audio(resp.content):
        return resp.content, None
    if "json" in content_type or resp.content[:1] in (b"{", b"["):
        with contextlib.suppress(ValueError):
            audio, url = audio_from_json(resp.json())
            if audio is not None or url is not None:
                return audio, url
    raise RuntimeError(
        f"TTS returned no audio for {label} "
        f"(content-type {content_type or 'unset'}): {resp.text[:200]}"
    )
