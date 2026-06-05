"""Tests for issue #39 — body size limit and per-IP rate limiting."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_director_repository import (
    SqliteRunDirectorRepository,
)
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository
from app.main import create_app
from app.presentation.dependencies import get_llm_provider, get_run_director_repo, get_run_repo
from app.presentation.rate_limit import get_limiter

_VALID_CIR = json.dumps(
    {
        "version": "0.1.0",
        "title": "T",
        "domain": "algorithm",
        "summary": "s",
        "steps": [
            {
                "id": "s1",
                "title": "S",
                "narration": "n",
                "visual_kind": "array",
                "tokens": [],
                "annotations": [],
            }
        ],
    }
)


class _MockLLM:
    async def complete(self, system: str, user: str) -> str:
        return _VALID_CIR


@pytest.fixture
def _repo(tmp_path):
    db = str(tmp_path / "test.db")
    init_db(db)
    return SqliteRunRepository(db), SqliteRunDirectorRepository(db)


@pytest.fixture
def body_limit_client(_repo, monkeypatch):
    """Client with a tiny body-size limit so the test payload is provably too large."""
    from app.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_MAX_BODY_BYTES", "256")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    app = create_app()
    run_repo, director_repo = _repo
    app.dependency_overrides[get_run_repo] = lambda: run_repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: _MockLLM()
    with TestClient(app) as c:
        yield c
    get_settings.cache_clear()


@pytest.fixture
def rate_limited_client(_repo, monkeypatch):
    """Client with a low rate-limit threshold so a handful of requests trips it."""
    from app.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_WRITE", "3/minute")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_READ", "3/minute")
    # Fresh limiter state — slowapi keeps an in-memory bucket per process.
    get_limiter().reset()
    app = create_app()
    run_repo, director_repo = _repo
    app.dependency_overrides[get_run_repo] = lambda: run_repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: _MockLLM()
    with TestClient(app) as c:
        yield c
    get_limiter().reset()
    get_settings.cache_clear()


def test_post_exceeding_max_body_bytes_returns_413(body_limit_client) -> None:
    big_prompt = "x" * 1000  # > 256 byte body cap
    resp = body_limit_client.post("/api/v1/pipeline", json={"prompt": big_prompt})
    assert resp.status_code == 413, resp.text
    assert "exceeds" in resp.json()["detail"]


def test_post_within_max_body_bytes_succeeds(body_limit_client) -> None:
    resp = body_limit_client.post("/api/v1/pipeline", json={"prompt": "ok"})
    assert resp.status_code == 202, resp.text


def test_post_rate_limit_returns_429_after_threshold(rate_limited_client) -> None:
    for _ in range(3):
        ok = rate_limited_client.post("/api/v1/pipeline", json={"prompt": "p"})
        assert ok.status_code == 202, ok.text

    blocked = rate_limited_client.post("/api/v1/pipeline", json={"prompt": "p"})
    assert blocked.status_code == 429
    assert "rate limit" in blocked.json()["detail"].lower()


def test_get_rate_limit_returns_429_after_threshold(rate_limited_client) -> None:
    for _ in range(3):
        ok = rate_limited_client.get("/api/v1/runs")
        assert ok.status_code == 200

    blocked = rate_limited_client.get("/api/v1/runs")
    assert blocked.status_code == 429


# ──────────────────────────────────────────────────────────────────────
# Issue #60 — chunked-encoding bypass coverage
# ──────────────────────────────────────────────────────────────────────


def _chunked_streaming_request(
    body: bytes,
) -> tuple[list[dict], object]:
    """Stand up an in-memory ASGI fake that posts ``body`` in 3 chunks with
    no Content-Length header — the shape a hostile chunked-encoding client
    would produce. Returns (sent messages, scope object) for assertion."""

    sent_messages: list[dict] = []
    chunk_size = max(1, len(body) // 3)
    chunks = [body[i : i + chunk_size] for i in range(0, len(body), chunk_size)] or [b""]

    chunk_iter = iter(chunks)

    async def receive():
        try:
            chunk = next(chunk_iter)
            return {"type": "http.request", "body": chunk, "more_body": True}
        except StopIteration:
            return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent_messages.append(message)

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/echo",
        "headers": [(b"content-type", b"application/json")],
    }
    return sent_messages, (scope, receive, send)


def test_body_size_middleware_blocks_chunked_oversize() -> None:
    """The hostile case from issue #60: client sends a chunked body without
    Content-Length, exceeding the cap. The middleware must reject with 413
    and never invoke the inner app."""

    import asyncio

    from app.presentation.middleware import BodySizeLimitMiddleware

    inner_called = False

    async def inner_app(scope, receive, send):
        nonlocal inner_called
        inner_called = True

    middleware = BodySizeLimitMiddleware(inner_app, max_bytes=128)
    payload = b"x" * 1024  # well over the 128-byte cap
    sent, (scope, recv, send) = _chunked_streaming_request(payload)
    asyncio.get_event_loop().run_until_complete(middleware(scope, recv, send))

    assert inner_called is False, "inner app must NOT see an oversized chunked body"
    status = next(msg for msg in sent if msg["type"] == "http.response.start")["status"]
    assert status == 413


def test_body_size_middleware_passes_through_small_chunked_body() -> None:
    """The good case: a chunked body under the cap reaches the inner app
    with the bytes intact."""

    import asyncio

    from app.presentation.middleware import BodySizeLimitMiddleware

    received_chunks: list[bytes] = []

    async def inner_app(scope, receive, send):
        more = True
        while more:
            msg = await receive()
            received_chunks.append(msg.get("body", b""))
            more = msg.get("more_body", False)
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b"", "more_body": False})

    middleware = BodySizeLimitMiddleware(inner_app, max_bytes=1024)
    payload = b'{"prompt": "x"}'
    _sent, (scope, recv, send) = _chunked_streaming_request(payload)
    asyncio.get_event_loop().run_until_complete(middleware(scope, recv, send))

    assert b"".join(received_chunks) == payload
