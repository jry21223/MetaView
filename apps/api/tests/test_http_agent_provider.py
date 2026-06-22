"""Tests for HttpAgentProvider — the FastAPI-side HTTP client targeting the
Node sidecar's /generate endpoint.

We don't rely on respx (not in requirements); httpx ships ``MockTransport``
which is enough for the small surface we need to cover.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from app.application.agent.types import AgentConstraints, AgentRequest, ToolManifest
from app.application.ports.agent_provider import AgentProviderError
from app.infrastructure.agent.http_agent_provider import HttpAgentProvider


def _make_provider_with_handler(
    handler,
    *,
    shared_token: str | None = None,
) -> HttpAgentProvider:
    """Construct a HttpAgentProvider whose internal AsyncClient is backed by an
    in-memory transport. We monkeypatch httpx.AsyncClient at the class level via
    a subclass to keep the production code untouched.
    """
    transport = httpx.MockTransport(handler)

    class _PatchedAsyncClient(httpx.AsyncClient):  # type: ignore[misc]
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    # Monkeypatch the module-level httpx.AsyncClient lookup inside the provider
    # by replacing the symbol on the imported module.
    from app.infrastructure.agent import http_agent_provider as mod

    mod.httpx.AsyncClient = _PatchedAsyncClient  # type: ignore[assignment]
    return HttpAgentProvider(
        base_url="http://agent:8001",
        timeout_s=5.0,
        shared_token=shared_token,
    )


@pytest.fixture(autouse=True)
def _restore_httpx_async_client():
    # Snapshot the real symbol so each test's patch is reverted afterward.
    import httpx as real_httpx

    from app.infrastructure.agent import http_agent_provider as mod

    original = mod.httpx.AsyncClient
    yield
    mod.httpx.AsyncClient = original  # type: ignore[assignment]
    real_httpx.AsyncClient = original  # type: ignore[assignment]


@pytest.mark.asyncio
async def test_generate_returns_playbook_dict() -> None:
    fake_playbook = {
        "fps": 30,
        "total_frames": 60,
        "domain": "math",
        "title": "x",
        "summary": "y",
        "steps": [],
        "parameter_controls": [],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/generate"
        body = json.loads(request.content)
        assert body["prompt"] == "hello"
        return httpx.Response(200, json={"playbook": fake_playbook})

    provider = _make_provider_with_handler(handler)
    out = await provider.generate("hello")
    assert out == fake_playbook


@pytest.mark.asyncio
async def test_run_posts_wide_agent_request_and_returns_agent_result() -> None:
    fake_playbook = {
        "fps": 30,
        "total_frames": 60,
        "domain": "math",
        "title": "x",
        "summary": "y",
        "steps": [],
        "parameter_controls": [],
    }
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "playbook": fake_playbook,
                "provider": "pi",
                "tool_events": [{"tool": "runtime_tool_list", "ok": True}],
                "runtime_events": [{"event": "sidecar.completed"}],
                "review": None,
                "artifacts": {},
            },
        )

    provider = _make_provider_with_handler(handler, shared_token="shared-secret")
    result = await provider.run(
        AgentRequest(
            run_id="run-http",
            prompt="hello",
            source_code=None,
            language=None,
            route_decision={"destination": "generic_cir"},
            provider_config={"model": "gpt-4o-mini"},
            playbook_schema={"type": "object"},
            constraints=AgentConstraints(max_self_repair_attempts=2),
            available_tools=[
                ToolManifest(
                    name="playbook.schema.validate",
                    description="Validate PlaybookScript.",
                    args_schema={"type": "object"},
                    domain="playbook",
                    deterministic=True,
                )
            ],
        )
    )

    assert seen["run_id"] == "run-http"
    assert seen["prompt"] == "hello"
    assert seen["provider"] == {"model": "gpt-4o-mini"}
    assert seen["route_decision"] == {"destination": "generic_cir"}
    assert seen["playbook_schema"] == {"type": "object"}
    assert seen["available_tools"][0]["name"] == "playbook.schema.validate"
    assert result.provider == "pi"
    assert result.playbook == fake_playbook
    assert result.tool_events[0]["tool"] == "runtime_tool_list"


@pytest.mark.asyncio
async def test_forwards_provider_config_when_user_key_supplied() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(
            200, json={"playbook": {
                "fps": 30, "total_frames": 1, "domain": "math",
                "title": "t", "summary": "s", "steps": [], "parameter_controls": [],
            }}
        )

    provider = _make_provider_with_handler(handler)
    await provider.generate(
        "prompt",
        provider_config={"api_key": "sk-x", "base_url": "https://x", "model": "gpt-4o-mini"},
    )
    assert seen["prompt"] == "prompt"
    assert seen["provider"] == {
        "api_key": "sk-x",
        "base_url": "https://x",
        "model": "gpt-4o-mini",
    }


@pytest.mark.asyncio
async def test_forwards_agent_shared_token_header() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-metaview-agent-token"] == "shared-secret"
        return httpx.Response(
            200,
            json={
                "playbook": {
                    "fps": 30,
                    "total_frames": 1,
                    "domain": "math",
                    "title": "t",
                    "summary": "s",
                    "steps": [],
                    "parameter_controls": [],
                }
            },
        )

    provider = _make_provider_with_handler(handler, shared_token="shared-secret")
    await provider.generate("prompt")


@pytest.mark.asyncio
async def test_500_response_raises_agent_provider_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"detail": "sidecar exploded"})

    provider = _make_provider_with_handler(handler)
    with pytest.raises(AgentProviderError) as excinfo:
        await provider.generate("prompt")
    assert "500" in str(excinfo.value)
    assert "sidecar exploded" in str(excinfo.value)


@pytest.mark.asyncio
async def test_500_response_preserves_structured_self_check_failure() -> None:
    self_check = {
        "status": "blocked",
        "issues": [
            {
                "code": "step.empty_voiceover",
                "severity": "error",
                "path": "steps[0].voiceover_text",
                "message": "Every step must have non-empty voiceover_text.",
                "suggestion": "Write narration.",
            }
        ],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            500,
            json={
                "detail": "agent self-check blocked PlaybookScript generation",
                "self_check": self_check,
            },
        )

    provider = _make_provider_with_handler(handler)
    with pytest.raises(AgentProviderError) as excinfo:
        await provider.generate("prompt")
    assert excinfo.value.structured_failure == self_check


@pytest.mark.asyncio
async def test_missing_playbook_field_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"other": "thing"})

    provider = _make_provider_with_handler(handler)
    with pytest.raises(AgentProviderError) as excinfo:
        await provider.generate("prompt")
    assert "playbook" in str(excinfo.value)


@pytest.mark.asyncio
async def test_non_json_response_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"not json at all")

    provider = _make_provider_with_handler(handler)
    with pytest.raises(AgentProviderError) as excinfo:
        await provider.generate("prompt")
    assert "invalid JSON" in str(excinfo.value)
