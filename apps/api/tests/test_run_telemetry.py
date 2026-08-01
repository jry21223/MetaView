from __future__ import annotations

import asyncio
import json
import sqlite3
import time

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.run_span import RunSpan, RunStage, RunTelemetrySummary, TokenUsage
from app.infrastructure.llm.openai_provider import _parse_usage
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository
from app.infrastructure.persistence.sqlite_span_repository import SqliteRunSpanRepository
from tests.coverage_test_utils import ComposableCoverageResolver

_VALID_CIR = json.dumps(
    {
        "version": "0.1.0",
        "title": "Telemetry tracer bullet",
        "domain": "algorithm",
        "summary": "A deterministic one-step lesson used to verify telemetry.",
        "steps": [
            {
                "id": "step_01",
                "title": "Inspect the value",
                "narration": "Inspect the only value and explain why the result is deterministic.",
                "visual_kind": "array",
                "tokens": [
                    {
                        "id": "t0",
                        "label": "1",
                        "value": "1",
                        "emphasis": "primary",
                    }
                ],
                "annotations": [],
            }
        ],
    }
)


class SuccessfulLLM:
    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        return _VALID_CIR


class InvalidLLM:
    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        return "not json"


class SlowLLM:
    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        await asyncio.sleep(1)
        return _VALID_CIR


class UsageLLM:
    provider_name = "openai-compatible"
    model_name = "usage-model"

    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        return _VALID_CIR

    async def complete_with_usage(
        self,
        system: str,
        user: str,
    ) -> tuple[str, TokenUsage]:  # noqa: ARG002
        return _VALID_CIR, TokenUsage(
            input_tokens=120,
            output_tokens=30,
            cache_read_tokens=80,
            cache_write_tokens=10,
        )


class FailingSpanRepository:
    async def record(self, span: RunSpan) -> None:  # noqa: ARG002
        raise RuntimeError("telemetry storage unavailable")

    async def list_for_run(self, run_id: str) -> list[RunSpan]:  # noqa: ARG002
        raise RuntimeError("telemetry storage unavailable")


class SlowSpanRepository:
    """Storage latency must stay outside the generation timeout budget."""

    def __init__(self, delay_s: float = 0.03) -> None:
        self.delay_s = delay_s

    async def record(self, span: RunSpan) -> None:  # noqa: ARG002
        await asyncio.sleep(self.delay_s)

    async def list_for_run(self, run_id: str) -> list[RunSpan]:  # noqa: ARG002
        return []


class BlockingRootCloseSpanRepository:
    def __init__(self, delegate: SqliteRunSpanRepository) -> None:
        self._delegate = delegate
        self.root_close_started = asyncio.Event()
        self.release_root_close = asyncio.Event()

    async def record(self, span: RunSpan) -> None:
        if span.stage == RunStage.PIPELINE_TOTAL and span.finished_at is not None:
            self.root_close_started.set()
            await self.release_root_close.wait()
        await self._delegate.record(span)

    async def list_for_run(self, run_id: str) -> list[RunSpan]:
        return await self._delegate.list_for_run(run_id)

    async def summarize(self, run_id: str) -> RunTelemetrySummary | None:
        return await self._delegate.summarize(run_id)


class BlockingLLM:
    def __init__(self) -> None:
        self.started = asyncio.Event()

    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        self.started.set()
        await asyncio.Event().wait()
        raise AssertionError("unreachable")


def test_openai_usage_preserves_total_input_cache_subset_and_measured_zero() -> None:
    usage = _parse_usage(
        {
            "prompt_tokens": 200,
            "completion_tokens": 0,
            "prompt_tokens_details": {"cached_tokens": 80},
        }
    )

    assert usage.input_tokens == 200
    assert usage.output_tokens == 0
    assert usage.cache_read_tokens == 80
    assert usage.cache_write_tokens is None


def test_openai_usage_keeps_missing_counters_unknown() -> None:
    usage = _parse_usage({"input_tokens": 0})

    assert usage.input_tokens == 0
    assert usage.output_tokens is None
    assert usage.cache_read_tokens is None
    assert usage.cache_write_tokens is None


def test_init_db_migrates_legacy_runs_before_creating_span_table(tmp_path) -> None:
    db_path = str(tmp_path / "legacy.db")
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE pipeline_runs (
                request_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                prompt TEXT NOT NULL,
                status TEXT,
                error_message TEXT,
                review_json TEXT
            )
            """
        )
        conn.execute(
            "INSERT INTO pipeline_runs"
            " (request_id, created_at, prompt, status, error_message, review_json)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            ("legacy-run", "2026-08-01T00:00:00+00:00", "legacy", "failed", "boom", None),
        )

    init_db(db_path)
    init_db(db_path)

    with sqlite3.connect(db_path) as conn:
        run = conn.execute(
            "SELECT run_id, started_at, finished_at, generator_path, total_duration_ms"
            " FROM pipeline_runs WHERE run_id='legacy-run'"
        ).fetchone()
        foreign_tables = {
            row[2] for row in conn.execute("PRAGMA foreign_key_list(pipeline_run_spans)")
        }

    assert run == ("legacy-run", None, None, None, None)
    assert foreign_tables == {"pipeline_runs"}


@pytest.mark.asyncio
async def test_deleting_run_also_deletes_telemetry_spans(tmp_path) -> None:
    db_path = str(tmp_path / "delete.db")
    init_db(db_path)
    run_repo = SqliteRunRepository(db_path)
    span_repo = SqliteRunSpanRepository(db_path)
    await run_repo.create("run-delete", "delete me", "2026-08-01T00:00:00+00:00")
    await span_repo.record(
        RunSpan(
            span_id="span-delete",
            run_id="run-delete",
            stage=RunStage.PIPELINE_TOTAL,
            status="ok",
            started_at="2026-08-01T00:00:01+00:00",
            finished_at="2026-08-01T00:00:02+00:00",
            duration_ms=1000,
        )
    )

    assert await run_repo.delete("run-delete") is True
    assert await span_repo.list_for_run("run-delete") == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("run_id", "llm", "timeout_s", "expected_run_status", "expected_span_status"),
    [
        ("run-ok", SuccessfulLLM(), None, PipelineRunStatus.SUCCEEDED, "ok"),
        ("run-error", InvalidLLM(), None, PipelineRunStatus.FAILED, "error"),
        ("run-timeout", SlowLLM(), 0.01, PipelineRunStatus.FAILED, "timeout"),
    ],
)
async def test_pipeline_total_span_matches_terminal_run_status(
    tmp_path,
    run_id,
    llm,
    timeout_s,
    expected_run_status,
    expected_span_status,
) -> None:
    db_path = str(tmp_path / f"{run_id}.db")
    init_db(db_path)
    run_repo = SqliteRunRepository(db_path)
    span_repo = SqliteRunSpanRepository(db_path)
    await run_repo.create(run_id, "test prompt", "2026-08-01T00:00:00+00:00")
    use_case = RunPipelineUseCase(
        run_repo,
        llm,
        coverage_resolver=ComposableCoverageResolver(),
        pipeline_timeout_s=timeout_s,
        span_repo=span_repo,
    )

    await use_case.execute(run_id, PipelineRequest(prompt="test prompt", domain="algorithm"))

    run = await run_repo.get(run_id)
    spans = await span_repo.list_for_run(run_id)
    root = next(span for span in spans if span.stage == RunStage.PIPELINE_TOTAL)
    assert run is not None
    assert run.status == expected_run_status
    assert root.status == expected_span_status
    assert root.parent_span_id is None
    assert root.finished_at is not None
    assert root.duration_ms is not None
    if expected_span_status == "timeout":
        started_children = [
            span
            for span in spans
            if span.parent_span_id is not None
            and span.status == "running"
            and span.finished_at is None
        ]
        assert started_children


@pytest.mark.asyncio
async def test_single_path_records_leaf_usage_and_summary_without_sensitive_payloads(
    tmp_path,
) -> None:
    db_path = str(tmp_path / "single-summary.db")
    init_db(db_path)
    run_repo = SqliteRunRepository(db_path)
    span_repo = SqliteRunSpanRepository(db_path)
    await run_repo.create(
        "run-single",
        "private prompt must not enter spans",
        "2026-08-01T00:00:00+00:00",
    )
    use_case = RunPipelineUseCase(
        run_repo,
        UsageLLM(),
        coverage_resolver=ComposableCoverageResolver(),
        span_repo=span_repo,
    )

    await use_case.execute(
        "run-single",
        PipelineRequest(prompt="private prompt must not enter spans", domain="algorithm"),
    )

    spans = await span_repo.list_for_run("run-single")
    by_stage = {span.stage: span for span in spans}
    assert {
        RunStage.PIPELINE_TOTAL,
        RunStage.ROUTER,
        RunStage.COVERAGE_RESOLUTION,
        RunStage.LESSON_PLAN,
        RunStage.SKILL_PACK,
        RunStage.GENERATION_SINGLE,
        RunStage.QUALITY_GATE,
        RunStage.FINALIZE,
    } <= by_stage.keys()
    assert by_stage[RunStage.SKILL_PACK].status == "skipped"
    generation = by_stage[RunStage.GENERATION_SINGLE]
    assert generation.provider == "openai-compatible"
    assert generation.model == "usage-model"
    assert generation.input_tokens == 120
    assert generation.output_tokens == 30
    assert generation.cache_read_tokens == 80
    assert generation.cache_write_tokens == 10
    assert generation.model_turns == 1
    assert "private prompt" not in json.dumps(
        [span.model_dump(mode="json") for span in spans],
        ensure_ascii=False,
    )

    summary = await span_repo.summarize("run-single")
    assert summary is not None
    assert summary.generator_path == "generic_cir"
    assert summary.input_tokens == 120
    assert summary.output_tokens == 30
    assert summary.cache_read_tokens == 80
    assert summary.cache_write_tokens == 10
    assert summary.generation_model_turns == 1
    assert summary.single_model_requests == 1
    assert "total_model_requests" not in summary.model_dump()
    assert summary.time_to_final_result_ms is not None


@pytest.mark.asyncio
async def test_single_provider_without_usage_keeps_usage_unknown(tmp_path) -> None:
    db_path = str(tmp_path / "single-no-usage.db")
    init_db(db_path)
    run_repo = SqliteRunRepository(db_path)
    span_repo = SqliteRunSpanRepository(db_path)
    await run_repo.create("run-no-usage", "prompt", "2026-08-01T00:00:00+00:00")
    use_case = RunPipelineUseCase(
        run_repo,
        SuccessfulLLM(),
        coverage_resolver=ComposableCoverageResolver(),
        span_repo=span_repo,
    )

    await use_case.execute(
        "run-no-usage",
        PipelineRequest(prompt="prompt", domain="algorithm"),
    )

    summary = await span_repo.summarize("run-no-usage")
    assert summary is not None
    assert summary.input_tokens is None
    assert summary.output_tokens is None
    assert summary.cache_read_tokens is None
    assert summary.cache_write_tokens is None
    assert summary.generation_model_turns == 1


@pytest.mark.asyncio
async def test_span_repository_failure_does_not_change_generation_result(tmp_path) -> None:
    db_path = str(tmp_path / "best-effort.db")
    init_db(db_path)
    run_repo = SqliteRunRepository(db_path)
    await run_repo.create("run-best-effort", "prompt", "2026-08-01T00:00:00+00:00")
    use_case = RunPipelineUseCase(
        run_repo,
        SuccessfulLLM(),
        coverage_resolver=ComposableCoverageResolver(),
        span_repo=FailingSpanRepository(),
    )

    await use_case.execute(
        "run-best-effort",
        PipelineRequest(prompt="prompt", domain="algorithm"),
    )

    run = await run_repo.get("run-best-effort")
    assert run is not None
    assert run.status == PipelineRunStatus.SUCCEEDED


@pytest.mark.asyncio
async def test_terminal_status_is_not_visible_before_root_telemetry_closes(tmp_path) -> None:
    db_path = str(tmp_path / "terminal-order.db")
    init_db(db_path)
    run_repo = SqliteRunRepository(db_path)
    span_repo = BlockingRootCloseSpanRepository(SqliteRunSpanRepository(db_path))
    await run_repo.create("run-order", "prompt", "2026-08-01T00:00:00+00:00")
    use_case = RunPipelineUseCase(
        run_repo,
        SuccessfulLLM(),
        coverage_resolver=ComposableCoverageResolver(),
        span_repo=span_repo,
    )

    execute_task = asyncio.create_task(
        use_case.execute(
            "run-order",
            PipelineRequest(prompt="prompt", domain="algorithm"),
        )
    )
    await asyncio.wait_for(span_repo.root_close_started.wait(), timeout=1)

    while_root_is_closing = await run_repo.get("run-order")
    assert while_root_is_closing is not None
    assert while_root_is_closing.status not in {
        PipelineRunStatus.SUCCEEDED,
        PipelineRunStatus.FAILED,
    }

    span_repo.release_root_close.set()
    await execute_task
    completed = await run_repo.get("run-order")
    completed_summary = await span_repo.summarize("run-order")
    assert completed is not None
    assert completed_summary is not None
    assert completed.status == PipelineRunStatus.SUCCEEDED
    assert completed_summary.finished_at is not None


@pytest.mark.asyncio
async def test_slow_span_storage_does_not_consume_generation_timeout(tmp_path) -> None:
    db_path = str(tmp_path / "slow-telemetry.db")
    init_db(db_path)
    run_repo = SqliteRunRepository(db_path)
    await run_repo.create("run-slow-telemetry", "prompt", "2026-08-01T00:00:00+00:00")
    use_case = RunPipelineUseCase(
        run_repo,
        SuccessfulLLM(),
        coverage_resolver=ComposableCoverageResolver(),
        pipeline_timeout_s=0.02,
        span_repo=SlowSpanRepository(),
    )

    started = time.perf_counter()
    await use_case.execute(
        "run-slow-telemetry",
        PipelineRequest(prompt="prompt", domain="algorithm"),
    )

    result = await run_repo.get("run-slow-telemetry")
    assert result is not None
    assert result.status == PipelineRunStatus.SUCCEEDED
    assert time.perf_counter() - started < 0.5


@pytest.mark.asyncio
async def test_external_cancellation_leaves_run_and_started_spans_unfinished(tmp_path) -> None:
    db_path = str(tmp_path / "cancelled.db")
    init_db(db_path)
    run_repo = SqliteRunRepository(db_path)
    span_repo = SqliteRunSpanRepository(db_path)
    llm = BlockingLLM()
    await run_repo.create("run-cancelled", "prompt", "2026-08-01T00:00:00+00:00")
    use_case = RunPipelineUseCase(
        run_repo,
        llm,
        coverage_resolver=ComposableCoverageResolver(),
        span_repo=span_repo,
    )
    execute_task = asyncio.create_task(
        use_case.execute(
            "run-cancelled",
            PipelineRequest(prompt="prompt", domain="algorithm"),
        )
    )
    await asyncio.wait_for(llm.started.wait(), timeout=1)

    execute_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await execute_task

    run = await run_repo.get("run-cancelled")
    spans = await span_repo.list_for_run("run-cancelled")
    summary = await span_repo.summarize("run-cancelled")
    root = next(span for span in spans if span.stage == RunStage.PIPELINE_TOTAL)
    generation = next(
        span for span in spans if span.stage == RunStage.GENERATION_SINGLE
    )
    assert run is not None
    assert summary is not None
    assert run.status not in {PipelineRunStatus.SUCCEEDED, PipelineRunStatus.FAILED}
    assert summary.finished_at is None
    assert root.status == "running"
    assert root.finished_at is None
    assert generation.status == "running"
    assert generation.finished_at is None
