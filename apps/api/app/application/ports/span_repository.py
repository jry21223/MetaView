from __future__ import annotations

from typing import Protocol

from app.domain.models.run_span import RunSpan, RunTelemetrySummary


class IRunSpanRepository(Protocol):
    """Persistence port for run telemetry spans.

    Implementations must be best-effort from the caller's point of view: the
    recorder swallows persistence failures so telemetry can never fail a run.
    """

    async def record(self, span: RunSpan) -> None: ...

    async def list_for_run(self, run_id: str) -> list[RunSpan]: ...

    async def summarize(self, run_id: str) -> RunTelemetrySummary | None: ...
