"""Tests for issue #40 — server-side TTS proxy."""

from __future__ import annotations

import asyncio
import base64
import json as json_module
import sqlite3
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_account_repository import SqliteAccountRepository
from app.main import create_app


class _FakeResponse:
    def __init__(self, status_code: int, content: bytes, headers: dict[str, str]):
        self.status_code = status_code
        self.content = content
        self.headers = headers

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", errors="replace")

    def json(self) -> Any:
        return json_module.loads(self.content)


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
    monkeypatch.setenv("METAVIEW_TTS_API_KEY", "")
    monkeypatch.setenv("METAVIEW_OPENAI_API_KEY", "")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setattr(
        "app.presentation.router_tts.httpx.AsyncClient", _FakeAsyncClient
    )
    app = create_app()
    yield TestClient(app)
    get_settings.cache_clear()


@pytest.fixture
def ops_client(monkeypatch, tmp_path) -> tuple[TestClient, object]:
    get_settings.cache_clear()
    db = str(tmp_path / "tts-ops.db")
    init_db(db)
    session = _wechat_session(db)
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", db)
    monkeypatch.setenv("METAVIEW_TTS_API_KEY", "sk-server-secret")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setattr(
        "app.presentation.router_tts.httpx.AsyncClient", _FakeAsyncClient
    )
    app = create_app()
    yield TestClient(app), session
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


def test_self_speech_accepts_temporary_provider_config(client) -> None:
    _FakeAsyncClient.response = _FakeResponse(
        status_code=200,
        content=b"audio",
        headers={"content-type": "audio/mpeg"},
    )

    r = client.post(
        "/api/v1/tts/speech",
        json={
            "text": "你好",
            "voice": "nova",
            "api_key": "sk-client-secret",
            "base_url": "https://tts.example.test/v1",
            "model": "tts-custom",
        },
    )

    assert r.status_code == 200
    req = _FakeAsyncClient.last_request
    assert req is not None
    assert req["url"] == "https://tts.example.test/v1/audio/speech"
    assert req["headers"]["Authorization"] == "Bearer sk-client-secret"
    assert req["json"]["model"] == "tts-custom"


def test_ops_speech_requires_wechat_session(ops_client) -> None:
    client, _session = ops_client
    _FakeAsyncClient.response = _FakeResponse(
        status_code=200,
        content=b"audio",
        headers={"content-type": "audio/mpeg"},
    )

    r = client.post("/api/v1/tts/speech", json={"text": "hi"})

    assert r.status_code == 401
    assert _FakeAsyncClient.last_request is None


def test_ops_speech_accepts_client_provider_config(ops_client) -> None:
    client, session = ops_client
    _FakeAsyncClient.response = _FakeResponse(
        status_code=200,
        content=b"audio",
        headers={"content-type": "audio/mpeg"},
    )

    r = client.post(
        "/api/v1/tts/speech",
        json={
            "text": "hi",
            "api_key": "sk-client-secret",
            "base_url": "https://tts.example.test/v1",
            "model": "tts-custom",
        },
        headers={"Cookie": f"mv_session={session.token}"},
    )

    assert r.status_code == 200
    req = _FakeAsyncClient.last_request
    assert req is not None
    assert req["url"] == "https://tts.example.test/v1/audio/speech"
    assert req["headers"]["Authorization"] == "Bearer sk-client-secret"
    assert req["json"]["model"] == "tts-custom"


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


def test_speech_redacts_upstream_error_secrets(client) -> None:
    _FakeAsyncClient.response = _FakeResponse(
        status_code=401,
        content=(
            b'{"error":"Authorization: Bearer abc.def_ghi-123 '
            b'and key sk-secret123456789"}'
        ),
        headers={"content-type": "application/json"},
    )

    r = client.post("/api/v1/tts/speech", json={"text": "x"})

    assert r.status_code == 401
    detail = r.json()["detail"]
    assert "abc.def_ghi-123" not in detail
    assert "sk-secret123456789" not in detail
    assert "Bearer [REDACTED]" in detail
    assert "sk-[REDACTED]" in detail


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


def _wechat_session(db: str):
    session = _run(SqliteAccountRepository(db).get_or_create_session(None, session_days=30))
    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            UPDATE accounts
            SET login_provider = 'wechat',
                display_name = '微信用户',
                wechat_openid = ?
            WHERE user_id = ?
            """,
            (f"openid_{session.account.user_id}", session.account.user_id),
        )
        conn.commit()
    return session


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


def test_volcano_provider_speaks_openspeech_end_to_end(monkeypatch) -> None:
    """A player request must reach 火山 in its own dialect and come back as bytes.

    Export and playback share one dialect module, so this is the proof that
    flipping METAVIEW_TTS_PROVIDER also fixes in-browser narration — not just
    the rendered video.
    """
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_TTS_PROVIDER", "volcano")
    monkeypatch.setenv("METAVIEW_TTS_API_KEY", "volc-access-token")
    monkeypatch.setenv("METAVIEW_TTS_APP_ID", "1234567890")
    monkeypatch.setenv("METAVIEW_TTS_DEFAULT_VOICE", "BV700_streaming")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setattr("app.presentation.router_tts.httpx.AsyncClient", _FakeAsyncClient)
    mp3 = b"\xff\xfb\x90\x00" + b"\x00" * 64
    _FakeAsyncClient.response = _FakeResponse(
        status_code=200,
        content=b'{"code": 3000, "data": "%s"}' % base64.b64encode(mp3),
        headers={"content-type": "application/json"},
    )
    try:
        with TestClient(create_app()) as client:
            r = client.post("/api/v1/tts/speech", json={"text": "抛体运动"})
        assert r.status_code == 200
        # The JSON envelope is unwrapped: the browser gets decodable audio and
        # an audio content-type, never application/json.
        assert r.content == mp3
        assert r.headers["content-type"] == "audio/mpeg"

        req = _FakeAsyncClient.last_request
        assert req is not None
        # Base URL was left at its OpenAI default; the dialect overrides it.
        assert req["url"] == "https://openspeech.bytedance.com/api/v1/tts"
        assert req["headers"]["Authorization"] == "Bearer;volc-access-token"
        assert req["json"]["app"]["appid"] == "1234567890"
        assert req["json"]["audio"]["voice_type"] == "BV700_streaming"
        assert req["json"]["request"]["text"] == "抛体运动"
    finally:
        get_settings.cache_clear()


def test_volcano_without_an_app_id_is_a_configuration_error(monkeypatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_TTS_PROVIDER", "volcano")
    monkeypatch.setenv("METAVIEW_TTS_API_KEY", "volc-access-token")
    monkeypatch.setenv("METAVIEW_TTS_APP_ID", "")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setattr("app.presentation.router_tts.httpx.AsyncClient", _FakeAsyncClient)
    try:
        with TestClient(create_app()) as client:
            r = client.post("/api/v1/tts/speech", json={"text": "x"})
        assert r.status_code == 503
        assert "METAVIEW_TTS_APP_ID" in r.json()["detail"]
        # It failed before any network call — no half-formed request went out.
        assert _FakeAsyncClient.last_request is None
    finally:
        get_settings.cache_clear()
