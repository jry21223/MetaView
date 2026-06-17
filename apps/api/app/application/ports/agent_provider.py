from __future__ import annotations

from typing import Any, Protocol

from app.application.agent.types import AgentRequest, AgentResult


class AgentProviderError(RuntimeError):
    """Raised when the agent sidecar cannot produce a PlaybookScript."""

    def __init__(
        self,
        message: str,
        *,
        structured_failure: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.structured_failure = structured_failure


class IAgentProvider(Protocol):
    """Generate a complete PlaybookScript via an agent loop (e.g. Node sidecar
    running pi-agent-core). The implementation is responsible for wiring up
    LLM credentials, tool execution, and self-review; the use-case layer just
    sees the final JSON-serializable dict shaped like ``PlaybookScript``.
    """

    async def run(self, request: AgentRequest) -> AgentResult: ...

    async def generate(
        self,
        prompt: str,
        provider_config: dict[str, Any] | None = None,
        route_decision: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...
