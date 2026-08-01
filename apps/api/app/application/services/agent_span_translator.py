"""Turn sidecar-reported telemetry into spans.

The sidecar measures work the API cannot see from outside: how many model
requests a generation actually took, how many of those turns carried tool
calls, and real token usage including cache reads. It reports that through the
existing ``runtime_events`` / ``artifacts`` channels on ``AgentResult``.

This module is the only place that knows those event names. It lives in the
application layer rather than in ``HttpAgentProvider`` so the provider stays a
dumb transport with no telemetry dependency.

Every field is treated as optional. A sidecar that predates this contract (or
one that failed before reporting) yields no spans rather than fabricated ones.
"""

from __future__ import annotations

from typing import Any

from app.application.agent.types import AgentResult
from app.application.services.run_telemetry import RunTelemetry
from app.domain.models.run_span import RunStage

ATTEMPT_COMPLETED = "agent.attempt.completed"
ATTEMPT_STARTED = "agent.attempt.started"
SELF_CHECK_COMPLETED = "agent.self_check.completed"
SIDECAR_COMPLETED = "sidecar.completed"
SIDECAR_FAILED = "sidecar.failed"


async def record_agent_result_spans(
    telemetry: RunTelemetry,
    result: AgentResult | None,
    *,
    runtime_events: list[dict[str, Any]] | None = None,
    artifacts: dict[str, Any] | None = None,
    parent_span_id: str | None = None,
) -> None:
    """Record ``agent.sidecar`` and its ``agent.attempt`` children.

    ``result`` is optional so a failed sidecar call can still be recorded from
    the raw events carried on the error path.
    """
    events = runtime_events if runtime_events is not None else _events(result)
    payload = artifacts if artifacts is not None else _artifacts(result)
    sidecar_event = _find_event(events, SIDECAR_COMPLETED) or _find_event(events, SIDECAR_FAILED)
    if sidecar_event is None:
        return
    sidecar_detail = _detail(sidecar_event)
    failed = sidecar_event.get("event") == SIDECAR_FAILED

    sidecar_metadata: dict[str, Any] = {}
    first_step_ms = _int(payload.get("time_to_first_committed_step_ms"))
    if first_step_ms is not None:
        sidecar_metadata["time_to_first_committed_step_ms"] = first_step_ms
    first_step_at = _str(payload.get("first_committed_step_at"))
    if first_step_at is not None:
        sidecar_metadata["first_committed_step_at"] = first_step_at

    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    sidecar_span_id = await telemetry.record_completed(
        RunStage.AGENT_SIDECAR,
        duration_ms=_int(sidecar_detail.get("duration_ms")),
        status="error" if failed else "ok",
        parent_span_id=parent_span_id,
        input_tokens=_int(usage.get("input_tokens")),
        output_tokens=_int(usage.get("output_tokens")),
        cache_read_tokens=_int(usage.get("cache_read_tokens")),
        cache_write_tokens=_int(usage.get("cache_write_tokens")),
        error_code=(
            _str(sidecar_detail.get("error_code")) or "agent.sidecar_failed" if failed else None
        ),
        metadata=sidecar_metadata,
        started_at=_str(sidecar_detail.get("started_at")),
        finished_at=_str(sidecar_detail.get("finished_at")),
    )

    self_checks = {
        _int(_detail(event).get("attempt_index")): _detail(event)
        for event in events
        if event.get("event") == SELF_CHECK_COMPLETED
    }

    for event in events:
        if event.get("event") not in {ATTEMPT_STARTED, ATTEMPT_COMPLETED}:
            continue
        detail = _detail(event)
        attempt_index = _int(detail.get("attempt_index"))
        self_check = self_checks.get(attempt_index, {})
        attempt_usage = detail.get("usage") if isinstance(detail.get("usage"), dict) else {}
        metadata: dict[str, Any] = {}
        if isinstance(detail.get("tool_calls_by_name"), dict):
            metadata["tool_calls_by_name"] = detail["tool_calls_by_name"]
        for key in ("committed_steps", "time_to_first_committed_step_ms"):
            value = _int(detail.get(key))
            if value is not None:
                metadata[key] = value
        attempt_first_step_at = _str(detail.get("first_committed_step_at"))
        if attempt_first_step_at is not None:
            metadata["first_committed_step_at"] = attempt_first_step_at
        if self_check.get("status"):
            metadata["self_check_status"] = self_check["status"]
        if isinstance(self_check.get("issue_codes"), list):
            metadata["self_check_issue_codes"] = [
                code for code in self_check["issue_codes"] if isinstance(code, str)
            ]

        attempt_running = (
            event.get("event") == ATTEMPT_STARTED or detail.get("outcome") == "running"
        )
        attempt_failed = detail.get("outcome") == "failed" or self_check.get(
            "status"
        ) == "blocked"
        if attempt_running:
            attempt_status = "running"
            attempt_error = None
        elif attempt_failed:
            attempt_status = "error"
            attempt_error = _str(detail.get("error_code")) or (
                "agent.self_check_blocked"
                if self_check.get("status") == "blocked"
                else "agent.attempt_failed"
            )
        else:
            attempt_status = "ok"
            attempt_error = None
        await telemetry.record_completed(
            RunStage.AGENT_ATTEMPT,
            duration_ms=_int(detail.get("duration_ms")),
            status=attempt_status,
            attempt_index=attempt_index if attempt_index is not None else 0,
            parent_span_id=sidecar_span_id,
            provider=_str(detail.get("provider")),
            model=_str(detail.get("model")),
            input_tokens=_int(attempt_usage.get("input_tokens")),
            output_tokens=_int(attempt_usage.get("output_tokens")),
            cache_read_tokens=_int(attempt_usage.get("cache_read_tokens")),
            cache_write_tokens=_int(attempt_usage.get("cache_write_tokens")),
            model_turns=_int(detail.get("model_turns")),
            tool_batches=_int(detail.get("tool_batches")),
            tool_calls=_int(detail.get("tool_calls")),
            error_code=attempt_error,
            metadata=metadata,
            started_at=_str(detail.get("started_at")),
            finished_at=_str(detail.get("finished_at")),
        )


def _events(result: AgentResult | None) -> list[dict[str, Any]]:
    if result is None:
        return []
    return [event for event in result.runtime_events if isinstance(event, dict)]


def _artifacts(result: AgentResult | None) -> dict[str, Any]:
    if result is None or not isinstance(result.artifacts, dict):
        return {}
    return result.artifacts


def _find_event(events: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    for event in events:
        if event.get("event") == name:
            return event
    return None


def _detail(event: dict[str, Any] | None) -> dict[str, Any]:
    if event is None:
        return {}
    detail = event.get("detail")
    return detail if isinstance(detail, dict) else {}


def _int(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def _str(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None
