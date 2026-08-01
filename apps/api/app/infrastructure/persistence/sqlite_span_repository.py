"""SQLite implementation of :class:`IRunSpanRepository`.

Spans are written twice: once when the stage opens (``status='running'``) so a
crashed or killed run still shows where it stopped, and once when it closes.
``INSERT OR REPLACE`` keyed on ``span_id`` makes the second write an update.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
from datetime import datetime
from typing import Any

from app.domain.models.run_span import RunSpan, RunStage, RunTelemetrySummary

_COLUMNS = (
    "span_id",
    "run_id",
    "parent_span_id",
    "stage",
    "attempt_index",
    "status",
    "started_at",
    "finished_at",
    "duration_ms",
    "provider",
    "model",
    "input_tokens",
    "output_tokens",
    "cache_read_tokens",
    "cache_write_tokens",
    "model_turns",
    "tool_batches",
    "tool_calls",
    "error_code",
    "metadata_json",
)


class SqliteRunSpanRepository:
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    async def record(self, span: RunSpan) -> None:
        placeholders = ", ".join("?" for _ in _COLUMNS)
        columns = ", ".join(_COLUMNS)
        values = (
            span.span_id,
            span.run_id,
            span.parent_span_id,
            span.stage,
            span.attempt_index,
            span.status,
            span.started_at,
            span.finished_at,
            span.duration_ms,
            span.provider,
            span.model,
            span.input_tokens,
            span.output_tokens,
            span.cache_read_tokens,
            span.cache_write_tokens,
            span.model_turns,
            span.tool_batches,
            span.tool_calls,
            span.error_code,
            json.dumps(span.metadata, ensure_ascii=False) if span.metadata else None,
        )

        def _sync() -> None:
            with self._connect() as conn:
                conn.execute(
                    f"INSERT OR REPLACE INTO pipeline_run_spans ({columns})"
                    f" VALUES ({placeholders})",
                    values,
                )
                conn.commit()

        await asyncio.to_thread(_sync)

    async def list_for_run(self, run_id: str) -> list[RunSpan]:
        def _sync() -> list[sqlite3.Row]:
            with self._connect() as conn:
                return list(
                    conn.execute(
                        "SELECT * FROM pipeline_run_spans"
                        " WHERE run_id=? ORDER BY started_at ASC, rowid ASC",
                        (run_id,),
                    )
                )

        rows = await asyncio.to_thread(_sync)
        return [_row_to_span(row) for row in rows]

    async def summarize(self, run_id: str) -> RunTelemetrySummary | None:
        def _sync() -> tuple[sqlite3.Row | None, list[sqlite3.Row]]:
            with self._connect() as conn:
                run = conn.execute(
                    "SELECT started_at, finished_at, generator_path, total_duration_ms"
                    " FROM pipeline_runs WHERE run_id=?",
                    (run_id,),
                ).fetchone()
                rows = list(
                    conn.execute(
                        "SELECT * FROM pipeline_run_spans"
                        " WHERE run_id=? ORDER BY started_at ASC, rowid ASC",
                        (run_id,),
                    )
                )
                return run, rows

        run, rows = await asyncio.to_thread(_sync)
        if run is None:
            return None
        spans = [_row_to_span(row) for row in rows]
        if run["started_at"] is None and not spans:
            return None
        return _summarize(run, spans)


def _row_to_span(row: sqlite3.Row) -> RunSpan:
    metadata: dict[str, Any] = {}
    raw_metadata = row["metadata_json"]
    if raw_metadata:
        try:
            parsed = json.loads(raw_metadata)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            metadata = parsed
    return RunSpan(
        span_id=row["span_id"],
        run_id=row["run_id"],
        parent_span_id=row["parent_span_id"],
        stage=row["stage"],
        attempt_index=row["attempt_index"],
        status=row["status"],
        started_at=row["started_at"],
        finished_at=row["finished_at"],
        duration_ms=row["duration_ms"],
        provider=row["provider"],
        model=row["model"],
        input_tokens=row["input_tokens"],
        output_tokens=row["output_tokens"],
        cache_read_tokens=row["cache_read_tokens"],
        cache_write_tokens=row["cache_write_tokens"],
        model_turns=row["model_turns"],
        tool_batches=row["tool_batches"],
        tool_calls=row["tool_calls"],
        error_code=row["error_code"],
        metadata=metadata,
    )


def _summarize(run: sqlite3.Row, spans: list[RunSpan]) -> RunTelemetrySummary:
    generation_leaves = [
        span for span in spans if span.stage in {RunStage.GENERATION_SINGLE, RunStage.AGENT_ATTEMPT}
    ]
    root_started_at = _parse_datetime(run["started_at"])
    quality_spans = [span for span in spans if span.stage == RunStage.QUALITY_GATE]
    valid_quality_spans = [
        span
        for span in quality_spans
        if span.metadata.get("quality_status") in {"clean", "warnings"}
    ]
    total_duration_ms = run["total_duration_ms"]
    return RunTelemetrySummary(
        started_at=run["started_at"],
        finished_at=run["finished_at"],
        generator_path=run["generator_path"],
        total_duration_ms=total_duration_ms,
        input_tokens=_complete_sum(generation_leaves, "input_tokens"),
        output_tokens=_complete_sum(generation_leaves, "output_tokens"),
        cache_read_tokens=_complete_sum(generation_leaves, "cache_read_tokens"),
        cache_write_tokens=_complete_sum(generation_leaves, "cache_write_tokens"),
        generation_model_turns=_complete_sum(generation_leaves, "model_turns"),
        tool_batches=_complete_sum(generation_leaves, "tool_batches"),
        tool_calls=_complete_sum(generation_leaves, "tool_calls"),
        single_model_requests=_stage_count(spans, RunStage.GENERATION_SINGLE),
        agent_provider_calls=_stage_count(spans, RunStage.GENERATION_AGENT_PROVIDER),
        agent_attempts=_stage_count(spans, RunStage.AGENT_ATTEMPT),
        reviewer_calls=_stage_count(spans, RunStage.REVIEWER),
        quality_repair_calls=_stage_count(spans, RunStage.QUALITY_REPAIR),
        time_to_first_committed_step_ms=_first_committed_step_ms(spans, root_started_at),
        time_to_first_quality_decision_ms=_first_finished_offset_ms(
            quality_spans,
            root_started_at,
        ),
        time_to_first_valid_candidate_ms=_first_finished_offset_ms(
            valid_quality_spans,
            root_started_at,
        ),
        time_to_final_result_ms=total_duration_ms,
    )


def _complete_sum(spans: list[RunSpan], field: str) -> int | None:
    if not spans:
        return None
    values = [getattr(span, field) for span in spans]
    if any(value is None for value in values):
        return None
    return sum(value for value in values if value is not None)


def _stage_count(spans: list[RunSpan], stage: str) -> int:
    return sum(span.stage == stage for span in spans)


def _parse_datetime(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _first_finished_offset_ms(
    spans: list[RunSpan],
    root_started_at: datetime | None,
) -> int | None:
    if root_started_at is None:
        return None
    finished = [
        parsed for span in spans if (parsed := _parse_datetime(span.finished_at)) is not None
    ]
    if not finished:
        return None
    return max(0, int((min(finished) - root_started_at).total_seconds() * 1000))


def _first_committed_step_ms(
    spans: list[RunSpan],
    root_started_at: datetime | None,
) -> int | None:
    absolute_times = [
        parsed
        for span in spans
        if (parsed := _parse_datetime(_string(span.metadata.get("first_committed_step_at"))))
        is not None
    ]
    if root_started_at is not None and absolute_times:
        return max(0, int((min(absolute_times) - root_started_at).total_seconds() * 1000))
    offsets = [
        value
        for span in spans
        if span.stage == RunStage.AGENT_SIDECAR
        and isinstance((value := span.metadata.get("time_to_first_committed_step_ms")), int)
        and not isinstance(value, bool)
    ]
    return min(offsets) if offsets else None


def _string(value: Any) -> str | None:
    return value if isinstance(value, str) else None
