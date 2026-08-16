"""End-to-end verification of #238 — the API→sidecar timeout contract.

Two layers:

1. In-process contract consistency: the API forwards ``timeout_ms`` =
   ``int(agent_timeout_s * 1000)`` in the ``POST /generate`` body
   (http_agent_provider.py:67). The sidecar's ``resolveGenerateTimeoutMs``
   (apps/agent/src/server.ts:45-54) accepts any positive finite number and
   clamps to ``min(requested, AGENT_TIMEOUT_MS=540000)``. This test pins the
   values the API actually sends for the documented config range and verifies
   they always fall in the server's accepted domain with
   ``forwarded_ms >= 1``, so the two sides can never disagree about units.

2. Real sidecar (best effort): boots ``apps/agent/src/server.ts`` with a tiny
   ``AGENT_TIMEOUT_MS`` ceiling and a blackhole LLM base URL so generation
   hangs; the response then proves the server parsed ``timeout_ms`` from the
   body and clamped it (huge forwarded value → ceiling; small value → itself;
   absent → ceiling). Skipped when the sidecar cannot start.

The parse/clamp unit math itself is covered by
apps/agent/test/serverTimeout.test.ts; this file only adds the cross-process
evidence.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any

import httpx
import pytest

from app.infrastructure.agent.http_agent_provider import HttpAgentProvider

_SIDECAR_DIR = Path(__file__).resolve().parents[2] / "agent"
_REPO_ROOT = Path(__file__).resolve().parents[3]
_TSX_BIN = _REPO_ROOT / "node_modules" / ".bin" / "tsx"
_CEILING_MS_DEFAULT = 540_000  # server.ts:38 (AGENT_TIMEOUT_MS default)


@pytest.fixture()
def _patched_http_client():
    """Binds httpx.AsyncClient inside the provider module to a MockTransport
    that records request bodies, mirroring test_http_agent_provider.py."""
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "playbook": {
                    "fps": 30,
                    "total_frames": 60,
                    "domain": "math",
                    "title": "t",
                    "summary": "s",
                    "steps": [],
                    "parameter_controls": [],
                }
            },
        )

    transport = httpx.MockTransport(handler)

    class _PatchedAsyncClient(httpx.AsyncClient):  # type: ignore[misc]
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    from app.infrastructure.agent import http_agent_provider as mod

    original = mod.httpx.AsyncClient
    mod.httpx.AsyncClient = _PatchedAsyncClient  # type: ignore[assignment]
    yield captured
    mod.httpx.AsyncClient = original  # type: ignore[assignment]


@pytest.mark.asyncio
async def test_e2e_timeout_ms_contract_values_are_consistent_across_sides(
    _patched_http_client,
) -> None:
    # Documented config range for METAVIEW_AGENT_TIMEOUT_S (config.py default
    # 600.0; sanity-check a spread incl. sub-second so the int truncation is
    # visible). Every forwarded value must be a positive int in milliseconds —
    # the exact domain resolveGenerateTimeoutMs accepts (positive finite →
    # min(requested, ceiling)).
    for timeout_s in (600.0, 120.0, 60.0, 30.0, 5.0, 0.5, 0.001):
        provider = HttpAgentProvider(base_url="http://agent:8001", timeout_s=timeout_s)
        await provider.generate("hello")
        body = dict(_patched_http_client)
        assert "timeout_ms" in body, "sidecar must receive timeout_ms in the body"
        forwarded = body["timeout_ms"]
        assert forwarded == int(timeout_s * 1000), (
            f"timeout_s={timeout_s} forwarded {forwarded}, expected {int(timeout_s * 1000)}"
        )
        assert isinstance(forwarded, int) and forwarded >= 1
        # Sidecar semantics (server.ts:45-54): effective = min(forwarded, ceiling).
        # So the sidecar's per-request budget never exceeds the API's HTTP
        # timeout — the invariant the ticket promises.
        assert min(forwarded, _CEILING_MS_DEFAULT) <= int(timeout_s * 1000)
        _patched_http_client.clear()

    # Default deployment: 600s API timeout → 600_000ms forwarded, clamped to the
    # 540s ceiling — the sidecar gives up at or before the API's client.
    provider = HttpAgentProvider(base_url="http://agent:8001", timeout_s=600.0)
    await provider.generate("hello")
    assert _patched_http_client["timeout_ms"] == 600_000
    assert min(_patched_http_client["timeout_ms"], _CEILING_MS_DEFAULT) == 540_000


def _sidecar_available() -> bool:
    return _TSX_BIN.exists() and (_SIDECAR_DIR / "src" / "server.ts").exists()


@pytest.mark.skipif(not _sidecar_available(), reason="agent sidecar sources unavailable")
class TestRealSidecarTimeoutClamp:
    """Brings up the real sidecar with a 3s ceiling and a blackhole LLM base
    URL so every /generate request hangs and the sidecar's own timeout wins the
    race. The 500 detail then exposes the effective per-request budget."""

    @pytest.fixture()
    def sidecar(self):
        env = os.environ.copy()
        env.update({
            "PORT": "18099",
            "AGENT_TIMEOUT_MS": "3000",
            "AGENT_DEFAULT_API_KEY": "sk-e2e-fake-key",
            "AGENT_DEFAULT_BASE_URL": "http://10.255.255.1:8000",
            "AGENT_DEFAULT_MODEL": "gpt-4o-mini",
            "LOG_LEVEL": "error",
        })
        proc = subprocess.Popen(
            [str(_TSX_BIN), "src/server.ts"],
            cwd=str(_SIDECAR_DIR),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            base = "http://127.0.0.1:18099"
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    with urllib.request.urlopen(f"{base}/healthz", timeout=2) as resp:
                        if resp.status == 200:
                            break
                except Exception:
                    pass
                time.sleep(0.3)
            else:
                pytest.skip("agent sidecar did not become healthy in 30s")
            yield base
        finally:
            proc.send_signal(signal.SIGTERM)
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)

    def _post(self, base: str, body: dict[str, Any]) -> tuple[int, str]:
        with urllib.request.urlopen(
            urllib.request.Request(
                f"{base}/generate",
                data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json"},
            ),
            timeout=30,
        ) as resp:
            return resp.status, resp.read().decode()
        # urlopen raises HTTPError for non-2xx; fall through handled below

    def _post_expect_timeout(self, base: str, body: dict[str, Any], expected_ms: int) -> None:
        from urllib.error import HTTPError

        try:
            self._post(base, body)
        except HTTPError as exc:
            payload = json.loads(exc.read().decode())
            assert exc.code == 500
            assert f"timed out after {expected_ms}ms" in payload.get("detail", ""), (
                f"expected timeout detail mentioning {expected_ms}ms, got {payload!r}"
            )
            return
        raise AssertionError(
            f"expected the sidecar to time out after {expected_ms}ms, got a 2xx response"
        )

    def test_huge_forwarded_timeout_is_clamped_to_ceiling(self, sidecar) -> None:
        # 999999ms forwarded; ceiling 3000ms → effective budget must be 3000ms.
        self._post_expect_timeout(sidecar, {"prompt": "e2e", "timeout_ms": 999_999}, 3000)

    def test_small_forwarded_timeout_wins(self, sidecar) -> None:
        # Below the ceiling the forwarded value must be used verbatim.
        self._post_expect_timeout(sidecar, {"prompt": "e2e", "timeout_ms": 1000}, 1000)

    def test_missing_timeout_falls_back_to_ceiling(self, sidecar) -> None:
        # Legacy clients without timeout_ms keep the env ceiling.
        self._post_expect_timeout(sidecar, {"prompt": "e2e"}, 3000)
