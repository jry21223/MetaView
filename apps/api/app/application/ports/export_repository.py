from __future__ import annotations

from typing import Protocol

from app.domain.models.export_job import ExportJob, ExportJobStatus


class IExportJobRepository(Protocol):
    def create(self, job: ExportJob) -> None: ...

    def get(self, job_id: str) -> ExportJob | None: ...

    def update(
        self,
        job_id: str,
        *,
        status: ExportJobStatus | None = None,
        progress: float | None = None,
        message: str | None = None,
        output_path: str | None = None,
        error: str | None = None,
    ) -> None: ...
