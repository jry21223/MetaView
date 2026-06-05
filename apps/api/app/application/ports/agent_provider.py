from __future__ import annotations

from typing import Any, Protocol


class AgentProviderError(RuntimeError):
    """Raised when the agent sidecar cannot produce a PlaybookScript."""


class IAgentProvider(Protocol):
    """Generate a complete PlaybookScript via an agent loop (e.g. Node sidecar
    running pi-agent-core). The implementation is responsible for wiring up
    LLM credentials, tool execution, and self-review; the use-case layer just
    sees the final JSON-serializable dict shaped like ``PlaybookScript``.
    """

    async def generate(
        self,
        prompt: str,
        provider_config: dict[str, Any] | None = None,
        route_decision: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...
