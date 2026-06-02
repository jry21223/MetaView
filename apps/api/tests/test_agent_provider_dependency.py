from __future__ import annotations

from app.config import Settings
from app.infrastructure.agent.codex_agent_provider import CodexAgentProvider
from app.infrastructure.agent.http_agent_provider import HttpAgentProvider
from app.presentation.dependencies import get_agent_provider


def test_agent_provider_dependency_returns_none_in_single_mode() -> None:
    settings = Settings(generation_mode="single", agent_provider="codex")

    assert get_agent_provider(settings) is None


def test_agent_provider_dependency_defaults_to_http_sidecar() -> None:
    settings = Settings(generation_mode="agent")

    provider = get_agent_provider(settings)

    assert isinstance(provider, HttpAgentProvider)


def test_agent_provider_dependency_can_select_codex_sdk() -> None:
    settings = Settings(
        generation_mode="agent",
        agent_provider="codex",
        codex_model="gpt-5.2-codex",
        codex_effort="high",
    )

    provider = get_agent_provider(settings)

    assert isinstance(provider, CodexAgentProvider)
