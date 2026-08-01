from __future__ import annotations

from typing import Protocol

from app.application.dto.followup_dto import RunFollowUpRecord, RunVersionRecord
from app.application.dto.pipeline_dto import PipelineRunResponse
from app.domain.models.director import DirectorScript
from app.domain.models.pipeline_run import PipelineRunStatus


class InteractionVersionConflictError(RuntimeError):
    """The interaction sandbox was based on a version that is no longer active."""


class IRunRepository(Protocol):
    async def create(
        self,
        run_id: str,
        prompt: str,
        created_at: str,
        user_id: str | None = None,
    ) -> None: ...

    async def update(
        self,
        run_id: str,
        *,
        status: PipelineRunStatus,
        playbook_json: str | None = None,
        error: str | None = None,
        review_json: str | None = None,
    ) -> None: ...

    async def get(
        self,
        run_id: str,
        user_id: str | None = None,
    ) -> PipelineRunResponse | None: ...

    async def update_playbook_json(self, run_id: str, playbook_json: str) -> None: ...

    async def mark_started(self, run_id: str, started_at: str) -> None: ...

    async def mark_finished(
        self,
        run_id: str,
        finished_at: str,
        *,
        generator_path: str | None = None,
        total_duration_ms: int | None = None,
    ) -> None: ...

    async def update_quality_report(self, run_id: str, quality_report_json: str) -> None: ...

    async def update_lesson_plan(self, run_id: str, lesson_plan_json: str) -> None: ...

    async def update_coverage_decision(
        self,
        run_id: str,
        coverage_decision_json: str,
    ) -> None: ...

    async def list(
        self,
        limit: int = 50,
        user_id: str | None = None,
    ) -> list[PipelineRunResponse]: ...

    async def delete(self, run_id: str, user_id: str | None = None) -> bool: ...

    async def ensure_initial_version(
        self,
        run_id: str,
        playbook_json: str,
        created_at: str,
        director_json: str | None = None,
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
        director_json: str | None = None,
    ) -> int: ...

    async def commit_interaction_version(
        self,
        run_id: str,
        *,
        expected_base_version_id: str | None,
        version_id: str,
        initial_playbook_json: str,
        playbook_json: str,
        quality_report_json: str,
        director: DirectorScript,
        summary: str,
        created_at: str,
    ) -> None: ...

    async def attach_followup_version(self, followup_id: str, version_id: str) -> None: ...

    async def get_version_playbook(self, run_id: str, version_id: str) -> str | None: ...

    async def get_version_director(self, run_id: str, version_id: str) -> str | None: ...

    async def get_head_version_id(self, run_id: str) -> str | None: ...

    async def set_head_version(self, run_id: str, version_id: str | None) -> None: ...

    async def list_followups(self, run_id: str) -> list[RunFollowUpRecord]: ...

    async def list_versions(self, run_id: str) -> list[RunVersionRecord]: ...
