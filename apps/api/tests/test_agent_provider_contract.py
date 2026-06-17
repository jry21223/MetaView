from __future__ import annotations

import pytest

from app.application.agent.types import (
    AgentConstraints,
    AgentRequest,
    AgentResult,
    ToolManifest,
)


@pytest.mark.asyncio
async def test_agent_provider_run_contract_uses_wide_request_shape() -> None:
    class _Provider:
        async def run(self, request: AgentRequest) -> AgentResult:
            assert request.run_id == "run-contract"
            assert request.route_decision["destination"] == "generic_cir"
            assert request.available_tools[0].name == "playbook.schema.validate"
            return AgentResult(
                playbook={"title": "ok"},
                provider="test",
                tool_events=[],
                runtime_events=[],
                review=None,
                artifacts={},
            )

    request = AgentRequest(
        run_id="run-contract",
        prompt="explain y=x",
        source_code=None,
        language=None,
        route_decision={"destination": "generic_cir"},
        provider_config={"model": "test-model"},
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

    result = await _Provider().run(request)

    assert result.provider == "test"
    assert result.playbook["title"] == "ok"
