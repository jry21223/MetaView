"""HTTP client implementation of :class:`IAgentProvider`.

Talks to the Node sidecar at ``settings.agent_base_url`` via a single
``POST /generate`` request. The sidecar runs ``@earendil-works/pi-agent-core``
with the Drawing CLI tool registry and returns the final ``PlaybookScript``
JSON. This module is intentionally tiny — the real complexity (tool
routing, LLM provider abstraction, prompt) lives in the sidecar.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.application.ports.agent_provider import AgentProviderError

logger = logging.getLogger(__name__)


class HttpAgentProvider:
    """Per-request HTTP client targeting the sidecar's ``/generate`` route."""

    def __init__(
        self,
        base_url: str,
        timeout_s: float = 600.0,
        shared_token: str | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout_s = timeout_s
        self._shared_token = shared_token

    async def generate(
        self,
        prompt: str,
        provider_config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"prompt": prompt}
        if provider_config:
            # Forward an opaque ``provider`` blob — the sidecar decides which
            # pi-ai provider to instantiate (openai / anthropic / deepseek …).
            body["provider"] = provider_config

        url = f"{self._base_url}/generate"
        headers = (
            {"X-MetaView-Agent-Token": self._shared_token}
            if self._shared_token
            else None
        )
        try:
            async with httpx.AsyncClient(timeout=self._timeout_s) as client:
                resp = await client.post(url, json=body, headers=headers)
        except httpx.HTTPError as exc:
            raise AgentProviderError(
                f"agent sidecar unreachable ({self._base_url}): {exc}"
            ) from exc

        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except ValueError:
                detail = resp.text[:500]
            raise AgentProviderError(
                f"agent sidecar returned {resp.status_code}: {detail!r}"
            )

        try:
            payload = resp.json()
        except ValueError as exc:
            raise AgentProviderError(f"agent sidecar produced invalid JSON: {exc}") from exc

        if not isinstance(payload, dict) or "playbook" not in payload:
            raise AgentProviderError(
                f"agent sidecar response missing 'playbook' field: {payload!r}"
            )
        playbook = payload["playbook"]
        if not isinstance(playbook, dict):
            raise AgentProviderError(
                f"agent sidecar 'playbook' field is not an object: {type(playbook)}"
            )
        return playbook
