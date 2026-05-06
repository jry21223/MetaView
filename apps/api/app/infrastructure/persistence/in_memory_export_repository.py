from __future__ import annotations

import threading

from app.domain.models.export_job import ExportJob, ExportJobStatus


class InMemoryExportJobRepository:
    """Process-local export job store.

    Exports are tied to a single rendering server process — no persistence
    requirement yet. Switching to SQLite later only needs to swap the binding.
    """

    def __init__(self) -> None:
        self._jobs: dict[str, ExportJob] = {}
        self._lock = threading.Lock()

    def create(self, job: ExportJob) -> None:
        with self._lock:
            self._jobs[job.job_id] = job

    def get(self, job_id: str) -> ExportJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def update(
        self,
        job_id: str,
        *,
        status: ExportJobStatus | None = None,
        progress: float | None = None,
        message: str | None = None,
        output_path: str | None = None,
        error: str | None = None,
    ) -> None:
        with self._lock:
            existing = self._jobs.get(job_id)
            if existing is None:
                return
            patch: dict[str, object] = {}
            if status is not None:
                patch["status"] = status
            if progress is not None:
                patch["progress"] = progress
            if message is not None:
                patch["message"] = message
            if output_path is not None:
                patch["output_path"] = output_path
            if error is not None:
                patch["error"] = error
            self._jobs[job_id] = existing.model_copy(update=patch)
