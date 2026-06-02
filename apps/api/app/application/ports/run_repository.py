from __future__ import annotations

from typing import Protocol

from app.application.dto.followup_dto import RunFollowUpRecord, RunVersionRecord
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

    async def update_playbook_json(self, run_id: str, playbook_json: str) -> None: ...

    async def list(self, limit: int = 50) -> list[PipelineRunResponse]: ...

    async def delete(self, run_id: str) -> bool: ...

    async def ensure_initial_version(
        self, run_id: str, playbook_json: str, created_at: str
    ) -> str: ...

    async def append_followup(
        self,
        run_id: str,
        *,
        followup_id: str,
        user_message: str,
        assistant_reply: str,
        change_summary: str,
        patch_json: str,
        created_at: str,
    ) -> None: ...

    async def append_version(
        self,
        run_id: str,
        *,
        version_id: str,
        playbook_json: str,
        source: str,
        followup_id: str | None,
        parent_version_id: str | None,
        summary: str,
        created_at: str,
    ) -> int: ...

    async def attach_followup_version(self, followup_id: str, version_id: str) -> None: ...

    async def get_version_playbook(self, run_id: str, version_id: str) -> str | None: ...

    async def get_head_version_id(self, run_id: str) -> str | None: ...

    async def list_followups(self, run_id: str) -> list[RunFollowUpRecord]: ...

    async def list_versions(self, run_id: str) -> list[RunVersionRecord]: ...
