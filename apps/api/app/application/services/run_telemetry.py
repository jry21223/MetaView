"""Best-effort span recording for pipeline runs.

Two hard rules:

1. Telemetry never changes generation behaviour. Every persistence call is
   wrapped; a failing span write is logged and dropped.
2. Retries are recorded as sibling spans (same ``parent_span_id``, increasing
   ``attempt_index``), so "which layer retried, and why" stays answerable.

Parenting is implicit via a :class:`contextvars.ContextVar`. A run executes in
one asyncio task, so a span opened inside another span's ``async with`` body
picks it up as parent without threading handles through every signature — that
keeps this PR from touching generation code paths beyond the ``async with``
lines themselves.
"""

from __future__ import annotations

import asyncio
import contextvars
import logging
import time
import uuid
from collections.abc import AsyncIterator, Callable, Iterator
from contextlib import asynccontextmanager, contextmanager, suppress
from datetime import datetime, timezone
from typing import Any

from app.application.ports.span_repository import IRunSpanRepository
from app.domain.models.run_span import RunSpan, SpanStatus

logger = logging.getLogger(__name__)

_ACTIVE_PARENT: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "metaview_active_span_id",
    default=None,
)

_ACTIVE_TELEMETRY: contextvars.ContextVar["RunTelemetry | None"] = contextvars.ContextVar(
    "metaview_active_telemetry",
    default=None,
)


@contextmanager
def activate(telemetry: "RunTelemetry") -> Iterator[None]:
    """Bind a recorder to the current context for the duration of a run.

    ``asyncio`` copies the current context into every task it creates, so a
    stage running under ``asyncio.wait_for`` inherits both the recorder and the
    active parent span without any parameter threading. Mutations inside that
    child task stay in the child's copy, which is what we want — a nested stage
    must not reparent its siblings.
    """
    token = _ACTIVE_TELEMETRY.set(telemetry)
    try:
        yield
    finally:
        _ACTIVE_TELEMETRY.reset(token)


def current_telemetry() -> "RunTelemetry":
    """Recorder for the run in progress, or an inert one outside a run."""
    return _ACTIVE_TELEMETRY.get() or NullRunTelemetry()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SpanHandle:
    """Mutable accumulator for one in-flight span.

    Mutation is confined to the span's own lifetime; the immutable
    :class:`RunSpan` is materialised at record time.
    """

    def __init__(
        self,
        *,
        span_id: str,
        run_id: str,
        parent_span_id: str | None,
        stage: str,
        attempt_index: int,
        started_at: str,
    ) -> None:
        self.span_id = span_id
        self.run_id = run_id
        self.parent_span_id = parent_span_id
        self.stage = stage
        self.attempt_index = attempt_index
        self.started_at = started_at
        self.status: SpanStatus = "running"
        self.provider: str | None = None
        self.model: str | None = None
        self.input_tokens: int | None = None
        self.output_tokens: int | None = None
        self.cache_read_tokens: int | None = None
        self.cache_write_tokens: int | None = None
        self.model_turns: int | None = None
        self.tool_batches: int | None = None
        self.tool_calls: int | None = None
        self.error_code: str | None = None
        self.metadata: dict[str, Any] = {}

    def set_model(self, *, provider: str | None = None, model: str | None = None) -> None:
        if provider:
            self.provider = provider
        if model:
            self.model = model

    def add_usage(
        self,
        *,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        cache_read_tokens: int | None = None,
        cache_write_tokens: int | None = None,
    ) -> None:
        """Accumulate token usage. ``None`` stays ``None`` — an unreported
        counter must not be recorded as a measured zero."""
        self.input_tokens = _add(self.input_tokens, input_tokens)
        self.output_tokens = _add(self.output_tokens, output_tokens)
        self.cache_read_tokens = _add(self.cache_read_tokens, cache_read_tokens)
        self.cache_write_tokens = _add(self.cache_write_tokens, cache_write_tokens)

    def set_counters(
        self,
        *,
        model_turns: int | None = None,
        tool_batches: int | None = None,
        tool_calls: int | None = None,
    ) -> None:
        if model_turns is not None:
            self.model_turns = model_turns
        if tool_batches is not None:
            self.tool_batches = tool_batches
        if tool_calls is not None:
            self.tool_calls = tool_calls

    def merge_metadata(self, values: dict[str, Any]) -> None:
        self.metadata = {**self.metadata, **values}

    def set_error(self, code: str) -> None:
        self.error_code = code

    def to_span(self, *, finished_at: str | None, duration_ms: int | None) -> RunSpan:
        return RunSpan(
            span_id=self.span_id,
            run_id=self.run_id,
            parent_span_id=self.parent_span_id,
            stage=self.stage,
            attempt_index=self.attempt_index,
            status=self.status,
            started_at=self.started_at,
            finished_at=finished_at,
            duration_ms=duration_ms,
            provider=self.provider,
            model=self.model,
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
            cache_read_tokens=self.cache_read_tokens,
            cache_write_tokens=self.cache_write_tokens,
            model_turns=self.model_turns,
            tool_batches=self.tool_batches,
            tool_calls=self.tool_calls,
            error_code=self.error_code,
            metadata=self.metadata,
        )


def _add(current: int | None, delta: int | None) -> int | None:
    if delta is None:
        return current
    return delta if current is None else current + delta


class RunTelemetry:
    """Records spans for one run. Construct one per ``execute`` call."""

    def __init__(
        self,
        repo: IRunSpanRepository | None,
        run_id: str,
        *,
        id_factory: Callable[[], str] | None = None,
    ) -> None:
        self._repo = repo
        self._run_id = run_id
        self._id_factory = id_factory or (lambda: uuid.uuid4().hex)
        self._attempts: dict[tuple[str | None, str], int] = {}
        self._write_queue: asyncio.Queue[RunSpan] = asyncio.Queue()
        self._writer_task: asyncio.Task[None] | None = None

    @property
    def enabled(self) -> bool:
        return self._repo is not None

    @property
    def active_parent_span_id(self) -> str | None:
        """Current context parent, used when a later retry must stay a sibling."""
        return _ACTIVE_PARENT.get()

    def next_attempt_index(self, stage: str, parent_span_id: str | None = None) -> int:
        """Sibling counter for a (parent, stage) pair.

        Lets a caller record repair loops without tracking indices itself.
        """
        key = (parent_span_id if parent_span_id is not None else _ACTIVE_PARENT.get(), stage)
        current = self._attempts.get(key, -1) + 1
        self._attempts[key] = current
        return current

    @asynccontextmanager
    async def span(
        self,
        stage: str,
        *,
        attempt_index: int | None = None,
        parent_span_id: str | None = None,
        provider: str | None = None,
        model: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AsyncIterator[SpanHandle]:
        parent = parent_span_id if parent_span_id is not None else _ACTIVE_PARENT.get()
        resolved_attempt = (
            attempt_index if attempt_index is not None else self.next_attempt_index(stage, parent)
        )
        handle = SpanHandle(
            span_id=self._id_factory(),
            run_id=self._run_id,
            parent_span_id=parent,
            stage=stage,
            attempt_index=resolved_attempt,
            started_at=_utc_now_iso(),
        )
        handle.set_model(provider=provider, model=model)
        if metadata:
            handle.merge_metadata(metadata)

        started_perf = time.perf_counter()
        await self._persist(handle, finished_at=None, duration_ms=None)
        token = _ACTIVE_PARENT.set(handle.span_id)
        persist_final = True
        try:
            yield handle
        except TimeoutError:
            handle.status = "timeout"
            handle.error_code = handle.error_code or "pipeline.timeout"
            raise
        except asyncio.CancelledError:
            # A wait_for timeout cancels its child task, while callers and
            # process shutdown can cancel the whole run. In both cases the
            # last truthful observation for this span is the opening
            # ``running`` row. The pipeline-total owner records a local timeout
            # explicitly after wait_for translates the child cancellation.
            persist_final = False
            raise
        except BaseException as exc:  # noqa: BLE001 - status must reflect reality.
            handle.status = "error"
            handle.error_code = handle.error_code or type(exc).__name__
            raise
        else:
            if handle.status == "running":
                handle.status = "ok"
        finally:
            _ACTIVE_PARENT.reset(token)
            if persist_final:
                duration_ms = int((time.perf_counter() - started_perf) * 1000)
                await self._persist(
                    handle,
                    finished_at=_utc_now_iso(),
                    duration_ms=duration_ms,
                )

    async def record_completed(
        self,
        stage: str,
        *,
        duration_ms: int | None,
        status: SpanStatus = "ok",
        attempt_index: int | None = None,
        parent_span_id: str | None = None,
        provider: str | None = None,
        model: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        cache_read_tokens: int | None = None,
        cache_write_tokens: int | None = None,
        model_turns: int | None = None,
        tool_batches: int | None = None,
        tool_calls: int | None = None,
        error_code: str | None = None,
        metadata: dict[str, Any] | None = None,
        started_at: str | None = None,
        finished_at: str | None = None,
    ) -> str:
        """Record a stage that already finished elsewhere.

        Used for work measured inside the sidecar, where the API only learns
        the durations after the fact and cannot wrap them in ``span``. Returns
        the new span id so callers can parent children to it explicitly.
        """
        parent = parent_span_id if parent_span_id is not None else _ACTIVE_PARENT.get()
        handle = SpanHandle(
            span_id=self._id_factory(),
            run_id=self._run_id,
            parent_span_id=parent,
            stage=stage,
            attempt_index=(
                attempt_index
                if attempt_index is not None
                else self.next_attempt_index(stage, parent)
            ),
            started_at=started_at or _utc_now_iso(),
        )
        handle.status = status
        handle.set_model(provider=provider, model=model)
        handle.add_usage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read_tokens,
            cache_write_tokens=cache_write_tokens,
        )
        handle.set_counters(
            model_turns=model_turns,
            tool_batches=tool_batches,
            tool_calls=tool_calls,
        )
        if error_code:
            handle.set_error(error_code)
        if metadata:
            handle.merge_metadata(metadata)
        await self._persist(
            handle,
            finished_at=(
                None if status == "running" else finished_at or _utc_now_iso()
            ),
            duration_ms=duration_ms,
        )
        return handle.span_id

    async def _persist(
        self,
        handle: SpanHandle,
        *,
        finished_at: str | None,
        duration_ms: int | None,
    ) -> None:
        if self._repo is None:
            return
        self._ensure_writer()
        self._write_queue.put_nowait(
            handle.to_span(finished_at=finished_at, duration_ms=duration_ms)
        )

    def _ensure_writer(self) -> None:
        if self._repo is None:
            return
        if self._writer_task is None or self._writer_task.done():
            self._writer_task = asyncio.create_task(
                self._write_spans_in_order(),
                name=f"run-telemetry-{self._run_id}",
            )

    async def _write_spans_in_order(self) -> None:
        assert self._repo is not None
        while True:
            span = await self._write_queue.get()
            try:
                await self._repo.record(span)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - telemetry must never fail a run.
                logger.warning(
                    "Failed to persist span %s (stage=%s) for run %s",
                    span.span_id,
                    span.stage,
                    span.run_id,
                    exc_info=True,
                )
            finally:
                self._write_queue.task_done()

    async def flush(self, *, timeout_s: float) -> None:
        """Drain queued writes without allowing telemetry storage to stall a run.

        One worker preserves each run's opening/closing write order. On a
        timeout, the worker and remaining writes are dropped; generation state
        is deliberately independent from this best-effort sink.
        """
        writer = self._writer_task
        if writer is None:
            return
        try:
            await asyncio.wait_for(self._write_queue.join(), timeout=timeout_s)
        except TimeoutError:
            logger.warning(
                "Timed out flushing telemetry for run %s; dropping %d queued writes",
                self._run_id,
                self._write_queue.qsize(),
            )
        finally:
            writer.cancel()
            with suppress(asyncio.CancelledError):
                await writer
            if self._writer_task is writer:
                self._writer_task = None
            while not self._write_queue.empty():
                self._write_queue.get_nowait()
                self._write_queue.task_done()


class NullRunTelemetry(RunTelemetry):
    """Telemetry sink used when no span repository is wired."""

    def __init__(self, run_id: str = "unknown") -> None:
        super().__init__(None, run_id)
