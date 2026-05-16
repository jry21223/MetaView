"""Tests for issue #40 — server-side TTS proxy."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app


class _FakeResponse:
    def __init__(self, status_code: int, content: bytes, headers: dict[str, str]):
        self.status_code = status_code
        self.content = content
        self.headers = headers

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", errors="replace")


class _FakeAsyncClient:
    """In-test stand-in for ``httpx.AsyncClient``.

    Avoids the real network and lets each test script the upstream behavior.
    """

    response: _FakeResponse | None = None
    raises: Exception | None = None
    last_request: dict[str, Any] | None = None

    def __init__(self, *_: Any, **__: Any) -> None:
        pass

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, *_: Any) -> None:
        return None

    async def post(
        self, url: str, *, headers: dict[str, str], json: dict[str, Any]
    ) -> _FakeResponse:
        _FakeAsyncClient.last_request = {"url": url, "headers": headers, "json": json}
        if _FakeAsyncClient.raises is not None:
            raise _FakeAsyncClient.raises
        assert _FakeAsyncClient.response is not None
        return _FakeAsyncClient.response


@pytest.fixture(autouse=True)
def _reset_fake_client() -> Iterator[None]:
    _FakeAsyncClient.response = None
    _FakeAsyncClient.raises = None
    _FakeAsyncClient.last_request = None
    yield


@pytest.fixture
def client(monkeypatch) -> TestClient:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_TTS_API_KEY", "sk-test-secret")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setattr(
        "app.presentation.router_tts.httpx.AsyncClient", _FakeAsyncClient
    )
    app = create_app()
    yield TestClient(app)
    get_settings.cache_clear()


@pytest.fixture
def client_without_key(monkeypatch) -> TestClient:
    get_settings.cache_clear()
    monkeypatch.delenv("METAVIEW_TTS_API_KEY", raising=False)
    monkeypatch.delenv("METAVIEW_OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setattr(
        "app.presentation.router_tts.httpx.AsyncClient", _FakeAsyncClient
    )
    app = create_app()
    yield TestClient(app)
    get_settings.cache_clear()


def test_speech_returns_audio_bytes_from_upstream(client) -> None:
    _FakeAsyncClient.response = _FakeResponse(
        status_code=200,
        content=b"\xff\xfb\x90\x00fake-mp3-bytes",
        headers={"content-type": "audio/mpeg"},
    )
    r = client.post(
        "/api/v1/tts/speech",
        json={"text": "你好，世界", "voice": "echo", "rate": 1.25},
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/mpeg"
    assert r.content.startswith(b"\xff\xfb")
    # Upstream auth header carries the server key, not anything client-supplied.
    req = _FakeAsyncClient.last_request
    assert req is not None
    assert req["headers"]["Authorization"] == "Bearer sk-test-secret"
    assert req["json"]["voice"] == "echo"
    assert req["json"]["speed"] == 1.25


def test_speech_defaults_voice_to_settings(client) -> None:
    _FakeAsyncClient.response = _FakeResponse(
        status_code=200,
        content=b"audio",
        headers={"content-type": "audio/mpeg"},
    )
    r = client.post("/api/v1/tts/speech", json={"text": "test"})
    assert r.status_code == 200
    assert _FakeAsyncClient.last_request is not None
    assert _FakeAsyncClient.last_request["json"]["voice"] == "alloy"


def test_speech_503_when_no_key_configured(client_without_key) -> None:
    r = client_without_key.post("/api/v1/tts/speech", json={"text": "hi"})
    assert r.status_code == 503
    assert "not configured" in r.json()["detail"].lower()


def test_speech_502_on_upstream_network_error(client) -> None:
    _FakeAsyncClient.raises = httpx.ConnectError("dns fail")
    r = client.post("/api/v1/tts/speech", json={"text": "x"})
    assert r.status_code == 502
    assert "unreachable" in r.json()["detail"].lower()


def test_speech_passes_through_upstream_error_code(client) -> None:
    _FakeAsyncClient.response = _FakeResponse(
        status_code=401,
        content=b'{"error": "invalid api key"}',
        headers={"content-type": "application/json"},
    )
    r = client.post("/api/v1/tts/speech", json={"text": "x"})
    assert r.status_code == 401


def test_speech_validates_text_length(client) -> None:
    r = client.post("/api/v1/tts/speech", json={"text": ""})
    assert r.status_code == 422
    r = client.post("/api/v1/tts/speech", json={"text": "x" * 10000})
    assert r.status_code == 422


def test_speech_validates_rate_range(client) -> None:
    r = client.post("/api/v1/tts/speech", json={"text": "x", "rate": 5.0})
    assert r.status_code == 422
    r = client.post("/api/v1/tts/speech", json={"text": "x", "rate": 0.1})
    assert r.status_code == 422
