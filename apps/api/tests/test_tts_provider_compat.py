"""TTS provider compatibility: two request dialects, many response shapes.

Most vendors take OpenAI's ``POST /audio/speech with a Bearer key``; ByteDance
openspeech (火山引擎) takes its own path, header and body. Responses diverge
further still — raw bytes, base64 in JSON, hex, or a link. These tests pin
both halves so adding a vendor stays a config change rather than a code
change, and so export and playback keep speaking the same dialect.
"""

from __future__ import annotations

import base64
import uuid

import httpx
import pytest

from app.infrastructure.tts import (
    build_tts_request,
    looks_like_audio,
    resolve_base_url,
    response_audio,
)

MP3 = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 64
BARE_MP3 = b"\xff\xfb\x90\x00" + b"\x00" * 64
WAV = b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 32


def _resp(content: bytes, content_type: str) -> httpx.Response:
    return httpx.Response(
        200,
        content=content,
        headers={"content-type": content_type},
        request=httpx.Request("POST", "https://example.test/v1/audio/speech"),
    )


@pytest.mark.parametrize(
    "payload",
    [MP3, BARE_MP3, WAV, b"OggS\x00\x02\x00\x00", b"fLaC\x00\x00\x00\x22", b"\x00\x00\x00\x20ftypM4A "],
)
def test_recognizes_every_container_the_renderer_accepts(payload: bytes) -> None:
    assert looks_like_audio(payload)


@pytest.mark.parametrize("payload", [b"", b"{}", b'{"error": "bad model"}', b"<html>502</html>"])
def test_rejects_non_audio_payloads(payload: bytes) -> None:
    assert not looks_like_audio(payload)


def test_raw_audio_body_passes_through() -> None:
    audio, url = response_audio(_resp(MP3, "audio/mpeg"), "step 0")
    assert audio == MP3
    assert url is None


def test_raw_audio_without_a_useful_content_type_is_still_accepted() -> None:
    # Some gateways answer application/octet-stream, or nothing at all.
    audio, _ = response_audio(_resp(MP3, "application/octet-stream"), "step 0")
    assert audio == MP3


def test_json_envelope_with_base64_audio() -> None:
    body = b'{"data": {"audio": "%s"}}' % base64.b64encode(MP3)
    audio, url = response_audio(_resp(body, "application/json"), "step 0")
    assert audio == MP3
    assert url is None


def test_json_envelope_with_hex_audio() -> None:
    body = b'{"audio": "%s"}' % MP3.hex().encode()
    audio, _ = response_audio(_resp(body, "application/json"), "step 0")
    assert audio == MP3


def test_json_envelope_with_a_download_url() -> None:
    body = b'{"output": {"audio_url": "https://cdn.example.test/a.mp3"}}'
    audio, url = response_audio(_resp(body, "application/json"), "step 0")
    assert audio is None
    assert url == "https://cdn.example.test/a.mp3"


def test_non_http_urls_are_not_followed() -> None:
    # A file:// or gs:// link is not something the server should fetch.
    body = b'{"audio_url": "file:///etc/passwd"}'
    with pytest.raises(RuntimeError, match="no audio"):
        response_audio(_resp(body, "application/json"), "step 0")


def test_a_200_json_error_is_reported_not_written_as_audio() -> None:
    # The failure this guards: writing an error body to step_000.mp3 makes the
    # render fail much later with nothing pointing at the real cause.
    body = b'{"error": {"message": "model not found: tts-1"}}'
    with pytest.raises(RuntimeError, match="model not found"):
        response_audio(_resp(body, "application/json"), "step 3")


def test_error_message_names_the_step_and_content_type() -> None:
    with pytest.raises(RuntimeError) as excinfo:
        response_audio(_resp(b"upstream timeout", "text/plain"), "step 7")
    message = str(excinfo.value)
    assert "step 7" in message
    assert "text/plain" in message


# ── request dialects ────────────────────────────────────────────────────────


def _build(provider: str, **overrides: object) -> object:
    kwargs: dict[str, object] = {
        "provider": provider,
        "base_url": resolve_base_url(provider, None),
        "api_key": "secret-token",
        "model": "tts-1",
        "voice": "alloy",
        "text": "两个物体同时落地。",
    }
    kwargs.update(overrides)
    return build_tts_request(**kwargs)  # type: ignore[arg-type]


def test_openai_dialect_posts_audio_speech_with_a_bearer_key() -> None:
    call = _build("openai")
    assert call.url == "https://api.openai.com/v1/audio/speech"
    assert call.headers["Authorization"] == "Bearer secret-token"
    assert call.body["input"] == "两个物体同时落地。"
    assert call.body["model"] == "tts-1"
    assert call.body["voice"] == "alloy"
    # Both container spellings ride along; each vendor ignores the other's.
    assert call.body["response_format"] == "mp3"
    assert call.body["format"] == "mp3"


@pytest.mark.parametrize("provider", ["", None, "OpenAI", " siliconflow "])
def test_unknown_or_blank_providers_fall_back_to_the_openai_dialect(provider: str) -> None:
    call = build_tts_request(
        provider=provider,
        base_url="https://api.siliconflow.cn/v1",
        api_key="k",
        model="m",
        voice="v",
        text="t",
    )
    assert call.url == "https://api.siliconflow.cn/v1/audio/speech"
    assert call.headers["Authorization"] == "Bearer k"


def test_volcano_dialect_speaks_openspeech_not_openai() -> None:
    call = _build("volcano", voice="BV700_streaming", app_id="1234567890")
    assert call.url == "https://openspeech.bytedance.com/api/v1/tts"
    # The semicolon is ByteDance's own scheme, not a typo — a space fails auth.
    assert call.headers["Authorization"] == "Bearer;secret-token"
    assert call.body["app"] == {
        "appid": "1234567890",
        "token": "secret-token",
        "cluster": "volcano_tts",
    }
    assert call.body["audio"]["voice_type"] == "BV700_streaming"
    assert call.body["audio"]["encoding"] == "mp3"
    assert call.body["request"]["text"] == "两个物体同时落地。"
    assert call.body["request"]["operation"] == "query"
    # OpenAI-only keys must not leak into the openspeech body.
    assert "input" not in call.body
    assert "model" not in call.body


def test_volcano_requests_carry_a_fresh_id_each_time() -> None:
    first = _build("volcano", app_id="1")
    second = _build("volcano", app_id="1")
    assert first.body["request"]["reqid"] != second.body["request"]["reqid"]
    uuid.UUID(first.body["request"]["reqid"])  # well-formed, not a placeholder


def test_volcano_without_an_app_id_fails_before_the_network_call() -> None:
    with pytest.raises(ValueError, match="METAVIEW_TTS_APP_ID"):
        _build("volcano")


def test_speed_and_container_reach_both_dialects() -> None:
    openai = _build("openai", speed=1.25, audio_format="wav")
    assert openai.body["speed"] == 1.25
    assert openai.body["response_format"] == "wav"

    volcano = _build("volcano", app_id="1", speed=1.25, audio_format="wav")
    assert volcano.body["audio"]["speed_ratio"] == 1.25
    assert volcano.body["audio"]["encoding"] == "wav"


def test_a_base_url_left_at_another_dialects_default_is_treated_as_unset() -> None:
    # The trap this guards: an operator flips METAVIEW_TTS_PROVIDER=volcano but
    # leaves METAVIEW_TTS_BASE_URL at its OpenAI default, and every request
    # goes to api.openai.com/api/v1/tts for a baffling 404.
    assert (
        resolve_base_url("volcano", "https://api.openai.com/v1")
        == "https://openspeech.bytedance.com"
    )
    assert resolve_base_url("volcano", None) == "https://openspeech.bytedance.com"
    assert (
        resolve_base_url("openai", "https://openspeech.bytedance.com")
        == "https://api.openai.com/v1"
    )


def test_an_explicitly_chosen_host_is_always_honoured() -> None:
    assert resolve_base_url("openai", "https://api.siliconflow.cn/v1") == (
        "https://api.siliconflow.cn/v1"
    )
    assert resolve_base_url("volcano", "https://proxy.internal/openspeech/") == (
        "https://proxy.internal/openspeech"
    )
