from __future__ import annotations

from typing import Protocol

from app.application.dto.pipeline_dto import PipelineRunResponse
from app.domain.models.pipeline_run import PipelineRunStatus


class IRunRepository(Protocol):
    async def create(self, run_id: str, prompt: str, created_at: str) -> None: ...

    async def update(
        self,
        run_id: str,
        *,
        status: PipelineRunStatus,
        playbook_json: str | None = None,
        error: str | None = None,
        review_json: str | None = None,
    ) -> None: ...

    async def get(self, run_id: str) -> PipelineRunResponse | None: ...

    async def list(self, limit: int = 50) -> list[PipelineRunResponse]: ...
