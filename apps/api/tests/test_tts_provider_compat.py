"""TTS provider compatibility: one request shape, many response shapes.

Providers agree on "POST /audio/speech with a Bearer key" and diverge after
that. These tests pin the normalization so adding a vendor stays a config
change rather than a code change.
"""

from __future__ import annotations

import base64

import httpx
import pytest

from app.application.use_cases.export_video import (
    _looks_like_audio,
    _tts_response_audio,
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
    assert _looks_like_audio(payload)


@pytest.mark.parametrize("payload", [b"", b"{}", b'{"error": "bad model"}', b"<html>502</html>"])
def test_rejects_non_audio_payloads(payload: bytes) -> None:
    assert not _looks_like_audio(payload)


def test_raw_audio_body_passes_through() -> None:
    audio, url = _tts_response_audio(_resp(MP3, "audio/mpeg"), 0)
    assert audio == MP3
    assert url is None


def test_raw_audio_without_a_useful_content_type_is_still_accepted() -> None:
    # Some gateways answer application/octet-stream, or nothing at all.
    audio, _ = _tts_response_audio(_resp(MP3, "application/octet-stream"), 0)
    assert audio == MP3


def test_json_envelope_with_base64_audio() -> None:
    body = b'{"data": {"audio": "%s"}}' % base64.b64encode(MP3)
    audio, url = _tts_response_audio(_resp(body, "application/json"), 0)
    assert audio == MP3
    assert url is None


def test_json_envelope_with_hex_audio() -> None:
    body = b'{"audio": "%s"}' % MP3.hex().encode()
    audio, _ = _tts_response_audio(_resp(body, "application/json"), 0)
    assert audio == MP3


def test_json_envelope_with_a_download_url() -> None:
    body = b'{"output": {"audio_url": "https://cdn.example.test/a.mp3"}}'
    audio, url = _tts_response_audio(_resp(body, "application/json"), 0)
    assert audio is None
    assert url == "https://cdn.example.test/a.mp3"


def test_non_http_urls_are_not_followed() -> None:
    # A file:// or gs:// link is not something the server should fetch.
    body = b'{"audio_url": "file:///etc/passwd"}'
    with pytest.raises(RuntimeError, match="no audio"):
        _tts_response_audio(_resp(body, "application/json"), 0)


def test_a_200_json_error_is_reported_not_written_as_audio() -> None:
    # The failure this guards: writing an error body to step_000.mp3 makes the
    # render fail much later with nothing pointing at the real cause.
    body = b'{"error": {"message": "model not found: tts-1"}}'
    with pytest.raises(RuntimeError, match="model not found"):
        _tts_response_audio(_resp(body, "application/json"), 3)


def test_error_message_names_the_step_and_content_type() -> None:
    with pytest.raises(RuntimeError) as excinfo:
        _tts_response_audio(_resp(b"upstream timeout", "text/plain"), 7)
    message = str(excinfo.value)
    assert "step 7" in message
    assert "text/plain" in message
