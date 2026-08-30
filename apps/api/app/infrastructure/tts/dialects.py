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
import json
import uuid
from typing import Any, Final, NamedTuple

import httpx

OPENAI_DIALECT: Final = "openai"
VOLCANO_DIALECT: Final = "volcano"
# 火山 v3 (current console): one X-Api-Key, HTTP chunked, JSON chunks each
# carrying base64 audio. Same req_params as the WebSocket variant.
VOLCANO_V3_DIALECT: Final = "volcano_v3"
VOLCANO_V3_PATH: Final = "/api/v3/tts/unidirectional"
VOLCANO_V3_RESOURCE_ID: Final = "seed-tts-2.0"

# Default host per dialect. A base URL that still names *another* dialect's
# default is treated as unset — see ``resolve_base_url``.
BASE_URL_DEFAULTS: Final[dict[str, str]] = {
    OPENAI_DIALECT: "https://api.openai.com/v1",
    VOLCANO_DIALECT: "https://openspeech.bytedance.com",
    VOLCANO_V3_DIALECT: "https://openspeech.bytedance.com",
}

_AUDIO_MAGIC: Final = (b"ID3", b"RIFF", b"OggS", b"fLaC")
# Where providers put the payload inside a JSON envelope, most specific first.
_AUDIO_PAYLOAD_KEYS: Final = ("audio", "audio_base64", "audio_content", "data")
_AUDIO_URL_KEYS: Final = ("url", "audio_url", "audio_file", "file_url")
# ``header`` is 火山 v3: its live responses nest code/message/data there,
# though the published reference shows them at the top level.
_JSON_ENVELOPE_KEYS: Final = ("data", "output", "result", "response", "header")


def build_v3_req_params(
    *,
    text: str,
    speaker: str,
    audio_format: str = "mp3",
    sample_rate: int = 24000,
    speech_rate: int = 0,
    loudness_rate: int = 0,
    extra_additions: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The 火山 v3 request body — identical over HTTP and over WebSocket.

    Deliberately minimal, and the corpus is what decided that: there is no
    LaTeX and no Markdown in any lesson, so the vendor's parsers for those
    would only add latency; and ``max_length_to_filter_parenthesis`` must stay
    off because our parentheses hold coordinates like ``(-1,2.4)``, never
    asides — switching it on would silently swallow them.

    ``additions`` is a JSON-serialized *string*, per the vendor's field type.
    """

    additions: dict[str, Any] = {"explicit_language": "zh-cn"}
    if extra_additions:
        additions.update(extra_additions)
    return {
        "req_params": {
            "text": text,
            "speaker": speaker,
            "audio_params": {
                "format": audio_format,
                "sample_rate": sample_rate,
                "speech_rate": speech_rate,
                "loudness_rate": loudness_rate,
            },
            "additions": json.dumps(additions, ensure_ascii=False),
        }
    }


def v3_headers(*, api_key: str, resource_id: str) -> dict[str, str]:
    """Headers every 火山 v3 call carries, whichever transport it uses."""

    return {
        "X-Api-Key": api_key,
        "X-Api-Resource-Id": resource_id,
        "X-Api-Request-Id": str(uuid.uuid4()),
        "Content-Type": "application/json",
    }


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
    resource_id: str = VOLCANO_V3_RESOURCE_ID,
) -> TtsRequest:
    """Compose one synthesis request in the dialect the provider speaks."""

    dialect = normalize_dialect(provider)
    root = base_url.rstrip("/")

    if dialect == VOLCANO_V3_DIALECT:
        # 火山 v3 over HTTP chunked: the whole request is req_params, the
        # credentials are headers, and the audio comes back as a stream of
        # JSON chunks each holding base64 (see ``audio_from_chunked_json``).
        return TtsRequest(
            url=f"{root}{VOLCANO_V3_PATH}",
            headers=v3_headers(api_key=api_key, resource_id=resource_id),
            body=build_v3_req_params(
                text=text,
                speaker=voice,
                audio_format=audio_format,
                # v3 counts in steps, not multiples: 0 is normal, 100 is
                # double speed, -50 is half. Clamped to the documented range
                # so a caller's rate can never make the request invalid.
                speech_rate=max(-50, min(100, round((speed - 1.0) * 100))),
            ),
        )

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


def audio_from_chunked_json(body: bytes) -> tuple[bytes | None, str | None]:
    """Join the audio out of an HTTP-chunked stream of JSON objects.

    火山 v3 answers with one JSON object per chunk, each carrying a slice of
    base64 audio under ``data``. httpx de-chunks transparently, so what
    arrives here is those objects back to back — possibly newline separated,
    possibly not. Scanning with ``raw_decode`` accepts either without having
    to guess which the vendor emits.

    Each chunk's payload is decoded on its own and the *bytes* concatenated:
    joining the base64 strings first would corrupt every chunk whose length
    is not a multiple of four.
    """

    text = body.decode("utf-8", "replace").strip()
    if not text:
        return None, None

    decoder = json.JSONDecoder()
    chunks: list[bytes] = []
    error: str | None = None
    index = 0
    while index < len(text):
        if text[index] in " \r\n\t,":
            index += 1
            continue
        try:
            obj, end = decoder.raw_decode(text, index)
        except ValueError:
            break
        index = end
        if not isinstance(obj, dict):
            continue
        # 火山 v3 answers with code/message/data nested under "header", not at
        # the top level as its reference shows — confirmed against the live
        # endpoint, which returned {"header":{"code":45000010,...}} for a bad
        # key. Read both so a documentation drift either way stays handled.
        scope = obj.get("header") if isinstance(obj.get("header"), dict) else obj
        code = scope.get("code", obj.get("code"))
        if isinstance(code, int) and code != 0 and error is None:
            message = scope.get("message") or obj.get("message") or "no message"
            error = f"code {code}: {message}"
        payload = obj.get("data")
        if not isinstance(payload, str):
            payload = scope.get("data")
        if isinstance(payload, str) and payload:
            decoded = decode_audio_field(payload)
            if decoded is None:
                # Mid-stream slices are raw base64 without a container header,
                # so the magic-byte check in decode_audio_field rejects them.
                with contextlib.suppress(binascii.Error, ValueError):
                    decoded = base64.b64decode(payload, validate=True)
            if decoded:
                chunks.append(decoded)

    if chunks:
        return b"".join(chunks), None
    if error:
        raise RuntimeError(f"volcano v3 TTS refused the request: {error}")
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
        # Not a single object: a chunked stream of them, joined here. This
        # also raises with the vendor's own code/message when it refused.
        audio, url = audio_from_chunked_json(resp.content)
        if audio is not None or url is not None:
            return audio, url
    raise RuntimeError(
        f"TTS returned no audio for {label} "
        f"(content-type {content_type or 'unset'}): {resp.text[:200]}"
    )
