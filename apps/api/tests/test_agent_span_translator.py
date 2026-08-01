from __future__ import annotations

import pytest

from app.application.services.agent_span_translator import record_agent_result_spans
from app.application.services.run_telemetry import RunTelemetry
from app.domain.models.run_span import RunSpan, RunStage
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository
from app.infrastructure.persistence.sqlite_span_repository import SqliteRunSpanRepository


class CaptureSpanRepository:
    def __init__(self) -> None:
        self.spans: list[RunSpan] = []

    async def record(self, span: RunSpan) -> None:
        self.spans.append(span)

    async def list_for_run(self, run_id: str) -> list[RunSpan]:
        return [span for span in self.spans if span.run_id == run_id]


@pytest.mark.asyncio
async def test_translator_does_not_fabricate_success_from_artifacts_only() -> None:
    repo = CaptureSpanRepository()
    telemetry = RunTelemetry(repo, "run-no-sidecar")

    await record_agent_result_spans(
        telemetry,
        None,
        runtime_events=[],
        artifacts={
            "usage": {
                "input_tokens": 12,
                "output_tokens": 3,
                "cache_read_tokens": 2,
                "cache_write_tokens": 0,
            },
            "attempts": 1,
        },
    )
    await telemetry.flush(timeout_s=1)

    assert repo.spans == []


@pytest.mark.asyncio
async def test_translator_preserves_real_timestamps_and_failed_attempt_usage() -> None:
    repo = CaptureSpanRepository()
    telemetry = RunTelemetry(repo, "run-agent", id_factory=iter(["sidecar", "attempt"]).__next__)
    runtime_events = [
        {
            "event": "agent.attempt.completed",
            "detail": {
                "attempt_index": 0,
                "started_at": "2026-08-01T04:00:00.100Z",
                "finished_at": "2026-08-01T04:00:00.900Z",
                "duration_ms": 800,
                "outcome": "failed",
                "error_code": "ProviderError",
                "model_turns": 2,
                "tool_batches": 1,
                "tool_calls": 2,
                "first_committed_step_at": "2026-08-01T04:00:00.500Z",
                "usage": {
                    "input_tokens": 250,
                    "output_tokens": 35,
                    "cache_read_tokens": 80,
                    "cache_write_tokens": 10,
                },
            },
        },
        {
            "event": "sidecar.failed",
            "detail": {
                "started_at": "2026-08-01T04:00:00.000Z",
                "finished_at": "2026-08-01T04:00:01.000Z",
                "duration_ms": 1_000,
                "error_code": "ProviderError",
            },
        },
    ]

    await record_agent_result_spans(
        telemetry,
        None,
        runtime_events=runtime_events,
        artifacts={
            "usage": {
                "input_tokens": 250,
                "output_tokens": 35,
                "cache_read_tokens": 80,
                "cache_write_tokens": 10,
            },
            "first_committed_step_at": "2026-08-01T04:00:00.500Z",
            "time_to_first_committed_step_ms": 500,
        },
        parent_span_id="provider",
    )
    await telemetry.flush(timeout_s=1)

    assert [span.stage for span in repo.spans] == [
        RunStage.AGENT_SIDECAR,
        RunStage.AGENT_ATTEMPT,
    ]
    sidecar, attempt = repo.spans
    assert sidecar.parent_span_id == "provider"
    assert sidecar.status == "error"
    assert sidecar.started_at == "2026-08-01T04:00:00.000Z"
    assert sidecar.finished_at == "2026-08-01T04:00:01.000Z"
    assert sidecar.error_code == "ProviderError"
    assert attempt.parent_span_id == "sidecar"
    assert attempt.status == "error"
    assert attempt.started_at == "2026-08-01T04:00:00.100Z"
    assert attempt.finished_at == "2026-08-01T04:00:00.900Z"
    assert attempt.error_code == "ProviderError"
    assert attempt.input_tokens == 250
    assert attempt.cache_read_tokens == 80
    assert attempt.model_turns == 2
    assert attempt.tool_calls == 2
    assert attempt.metadata["first_committed_step_at"] == ("2026-08-01T04:00:00.500Z")


@pytest.mark.asyncio
async def test_agent_spans_feed_run_summary_without_double_counting(tmp_path) -> None:
    db_path = str(tmp_path / "agent-summary.db")
    init_db(db_path)
    run_repo = SqliteRunRepository(db_path)
    span_repo = SqliteRunSpanRepository(db_path)
    await run_repo.create(
        "run-summary",
        "prompt",
        "2026-08-01T04:00:00+00:00",
    )
    await run_repo.mark_started("run-summary", "2026-08-01T04:00:00+00:00")
    await run_repo.mark_finished(
        "run-summary",
        "2026-08-01T04:00:01+00:00",
        generator_path="agent",
        total_duration_ms=1_000,
    )
    telemetry = RunTelemetry(
        span_repo,
        "run-summary",
        id_factory=iter(["provider", "sidecar", "attempt"]).__next__,
    )
    provider_span_id = await telemetry.record_completed(
        RunStage.GENERATION_AGENT_PROVIDER,
        duration_ms=1_000,
    )

    await record_agent_result_spans(
        telemetry,
        None,
        runtime_events=[
            {
                "event": "agent.attempt.completed",
                "detail": {
                    "attempt_index": 0,
                    "started_at": "2026-08-01T04:00:00.100Z",
                    "finished_at": "2026-08-01T04:00:00.900Z",
                    "duration_ms": 800,
                    "outcome": "succeeded",
                    "model_turns": 2,
                    "tool_batches": 1,
                    "tool_calls": 2,
                    "first_committed_step_at": "2026-08-01T04:00:00.500Z",
                    "usage": {
                        "input_tokens": 250,
                        "output_tokens": 35,
                        "cache_read_tokens": 80,
                        "cache_write_tokens": 10,
                    },
                },
            },
            {
                "event": "sidecar.completed",
                "detail": {
                    "started_at": "2026-08-01T04:00:00.000Z",
                    "finished_at": "2026-08-01T04:00:01.000Z",
                    "duration_ms": 1_000,
                },
            },
        ],
        artifacts={
            "usage": {
                "input_tokens": 250,
                "output_tokens": 35,
                "cache_read_tokens": 80,
                "cache_write_tokens": 10,
            },
            "first_committed_step_at": "2026-08-01T04:00:00.500Z",
            "time_to_first_committed_step_ms": 500,
        },
        parent_span_id=provider_span_id,
    )
    await telemetry.flush(timeout_s=1)

    summary = await span_repo.summarize("run-summary")
    assert summary is not None
    assert summary.generator_path == "agent"
    assert summary.input_tokens == 250
    assert summary.output_tokens == 35
    assert summary.cache_read_tokens == 80
    assert summary.cache_write_tokens == 10
    assert summary.generation_model_turns == 2
    assert summary.tool_batches == 1
    assert summary.tool_calls == 2
    assert "total_model_requests" not in summary.model_dump()
    assert summary.agent_provider_calls == 1
    assert summary.agent_attempts == 1
    assert summary.time_to_first_committed_step_ms == 500


@pytest.mark.asyncio
async def test_translator_preserves_in_flight_attempt_from_sidecar_timeout() -> None:
    repo = CaptureSpanRepository()
    telemetry = RunTelemetry(
        repo,
        "run-timeout",
        id_factory=iter(["sidecar", "attempt"]).__next__,
    )

    await record_agent_result_spans(
        telemetry,
        None,
        runtime_events=[
            {
                "event": "agent.attempt.started",
                "detail": {
                    "attempt_index": 0,
                    "started_at": "2026-08-01T04:00:00.100Z",
                    "finished_at": None,
                    "duration_ms": None,
                    "outcome": "running",
                    "error_code": None,
                    "model_turns": 1,
                    "tool_batches": 1,
                    "tool_calls": 2,
                    "usage": {
                        "input_tokens": 120,
                        "output_tokens": 20,
                        "cache_read_tokens": 50,
                        "cache_write_tokens": 0,
                    },
                },
            },
            {
                "event": "sidecar.failed",
                "detail": {
                    "started_at": "2026-08-01T04:00:00.000Z",
                    "finished_at": "2026-08-01T04:00:01.000Z",
                    "duration_ms": 1_000,
                    "error_code": "AgentGenerationTimeoutError",
                },
            },
        ],
        artifacts={
            "usage": {
                "input_tokens": 120,
                "output_tokens": 20,
                "cache_read_tokens": 50,
                "cache_write_tokens": 0,
            },
            "attempts": 1,
        },
        parent_span_id="provider",
    )
    await telemetry.flush(timeout_s=1)

    sidecar, attempt = repo.spans
    assert sidecar.status == "error"
    assert sidecar.error_code == "AgentGenerationTimeoutError"
    assert attempt.parent_span_id == sidecar.span_id
    assert attempt.status == "running"
    assert attempt.started_at == "2026-08-01T04:00:00.100Z"
    assert attempt.finished_at is None
    assert attempt.duration_ms is None
    assert attempt.model_turns == 1
    assert attempt.tool_calls == 2
    assert attempt.cache_read_tokens == 50
