from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.application.agent.types import (
    AgentConstraints,
    AgentResult,
    RuntimeEvent,
    ToolEvent,
)


def test_rich_trace_events_round_trip() -> None:
    tool = ToolEvent(
        sequence=1,
        timestamp="2026-08-21T00:00:00.000Z",
        tool="runtime_tool_execute",
        attempt_id="run-1:attempt:1",
        ok=False,
        duration_ms=12,
        args={"tool": "scene_blueprint.compile"},
        error="runtime_tool.capability_denied",
        state_before="outlined",
        state_after="outlined",
    )
    runtime = RuntimeEvent(
        sequence=2,
        timestamp="2026-08-21T00:00:00.010Z",
        event="sidecar.failed",
        detail={"reason": "test"},
    )

    assert ToolEvent.model_validate(tool.model_dump()).model_dump() == tool.model_dump()
    assert (
        RuntimeEvent.model_validate(runtime.model_dump()).model_dump()
        == runtime.model_dump()
    )


def test_agent_result_keeps_legacy_sparse_events_compatible() -> None:
    result = AgentResult(
        playbook={},
        provider="pi",
        tool_events=[{"tool": "runtime_tool_list", "ok": True}],
        runtime_events=[{"event": "sidecar.completed"}],
    )

    assert result.tool_events == [{"tool": "runtime_tool_list", "ok": True}]
    assert result.runtime_events == [{"event": "sidecar.completed"}]


def test_max_tool_events_is_bounded() -> None:
    assert AgentConstraints().max_tool_events == 512
    with pytest.raises(ValidationError):
        AgentConstraints(max_tool_events=31)
    with pytest.raises(ValidationError):
        AgentConstraints(max_tool_events=2049)
