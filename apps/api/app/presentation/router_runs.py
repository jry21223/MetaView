from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from starlette.requests import Request

from app.application.dto.followup_dto import (
    FollowUpRequest,
    FollowUpResponse,
    RestoreVersionResponse,
    RunFollowUpsResponse,
)
from app.application.dto.pipeline_dto import PipelineRunResponse
from app.application.ports.llm_provider import ILLMProvider
from app.application.ports.run_repository import IRunRepository
from app.application.use_cases.follow_up import FollowUpPatchError, FollowUpPatchUseCase
from app.config import Settings, get_settings
from app.domain.models.playbook import PlaybookScript
from app.infrastructure.llm.openai_provider import OpenAIProvider
from app.presentation.dependencies import get_llm_provider, get_run_repo
from app.presentation.rate_limit import read_limit, write_limit

router = APIRouter(prefix="/runs", tags=["runs"])
_RUN_LOCKS: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


@router.get("", response_model=list[PipelineRunResponse])
@read_limit()
async def list_runs(
    request: Request,
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
    limit: int = 50,
) -> list[PipelineRunResponse]:
    return await run_repo.list(limit=limit)


@router.get("/{run_id}", response_model=PipelineRunResponse)
@read_limit()
async def get_run(
    request: Request,
    run_id: str,
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
) -> PipelineRunResponse:
    run = await run_repo.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return run


@router.get("/{run_id}/follow-ups", response_model=RunFollowUpsResponse)
@read_limit()
async def list_followups(
    request: Request,
    run_id: str,
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
) -> RunFollowUpsResponse:
    run = await run_repo.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return RunFollowUpsResponse(
        followups=await run_repo.list_followups(run_id),
        versions=await run_repo.list_versions(run_id),
    )


@router.post("/{run_id}/follow-up", response_model=FollowUpResponse)
@write_limit()
async def submit_followup(
    request: Request,
    run_id: str,
    payload: FollowUpRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
    llm: Annotated[ILLMProvider, Depends(get_llm_provider)],
) -> FollowUpResponse:
    if settings.app_edition == "ops" and (
        payload.provider_api_key or payload.provider_base_url or payload.provider_model
    ):
        raise HTTPException(
            status_code=400,
            detail="运营版使用平台托管模型，不能提交客户端 Provider 配置",
        )
    if not payload.provider_api_key and not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "Follow-up LLM not configured: set METAVIEW_OPENAI_API_KEY "
                "or configure Provider"
            ),
        )

    async with _RUN_LOCKS[run_id]:
        run = await run_repo.get(run_id)
        if run is None or run.playbook is None:
            raise HTTPException(
                status_code=404, detail=f"Run {run_id!r} has no playbook"
            )
        base_playbook = run.playbook
        parent_version_id = payload.base_version_id
        if payload.base_version_id:
            base_json = await run_repo.get_version_playbook(run_id, payload.base_version_id)
            if base_json is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Version {payload.base_version_id!r} not found",
                )
            try:
                base_playbook = PlaybookScript.model_validate_json(base_json)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail="Stored version is invalid") from exc

        effective_llm = _resolve_followup_llm(payload, settings, llm)
        use_case = FollowUpPatchUseCase(
            effective_llm,
            default_step_frames=settings.playbook_default_step_frames,
        )
        try:
            result = await use_case.execute(base_playbook, payload)
        except FollowUpPatchError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        now = _now()
        current_json = run.playbook.model_dump_json()
        await run_repo.ensure_initial_version(run_id, current_json, now)
        if parent_version_id is None:
            parent_version_id = await run_repo.get_head_version_id(run_id)
        followup_id = str(uuid.uuid4())
        patch_json = json.dumps(result.patch, ensure_ascii=False)
        await run_repo.append_followup(
            run_id,
            followup_id=followup_id,
            user_message=payload.message,
            assistant_reply=result.reply,
            change_summary=result.change_summary,
            patch_json=patch_json,
            created_at=now,
        )
        version_id = str(uuid.uuid4())
        next_json = result.playbook.model_dump_json()
        await run_repo.append_version(
            run_id,
            version_id=version_id,
            playbook_json=next_json,
            source="followup",
            followup_id=followup_id,
            parent_version_id=parent_version_id,
            summary=result.change_summary,
            created_at=now,
        )
        await run_repo.attach_followup_version(followup_id, version_id)
        await run_repo.update_playbook_json(run_id, next_json)

    return FollowUpResponse(
        reply=result.reply,
        change_summary=result.change_summary,
        version_id=version_id,
        playbook=result.playbook,
    )


@router.post("/{run_id}/versions/{version_id}/restore", response_model=RestoreVersionResponse)
@write_limit()
async def restore_version(
    request: Request,
    run_id: str,
    version_id: str,
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
) -> RestoreVersionResponse:
    async with _RUN_LOCKS[run_id]:
        run = await run_repo.get(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
        playbook_json = await run_repo.get_version_playbook(run_id, version_id)
        if playbook_json is None:
            raise HTTPException(
                status_code=404, detail=f"Version {version_id!r} not found"
            )
        try:
            playbook = PlaybookScript.model_validate_json(playbook_json)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Stored version is invalid") from exc
        now = _now()
        parent_version_id = await run_repo.get_head_version_id(run_id)
        restore_version_id = str(uuid.uuid4())
        await run_repo.append_version(
            run_id,
            version_id=restore_version_id,
            playbook_json=playbook.model_dump_json(),
            source="restore",
            followup_id=None,
            parent_version_id=parent_version_id,
            summary=f"revert: restore {_short_version_id(version_id)}",
            created_at=now,
        )
        await run_repo.update_playbook_json(run_id, playbook.model_dump_json())

    return RestoreVersionResponse(version_id=restore_version_id, playbook=playbook)


@router.delete("/{run_id}", status_code=204)
@write_limit()
async def delete_run(
    request: Request,
    run_id: str,
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
) -> None:
    deleted = await run_repo.delete(run_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")


def _resolve_followup_llm(
    payload: FollowUpRequest,
    settings: Settings,
    default_llm: ILLMProvider,
) -> ILLMProvider:
    if not payload.provider_api_key:
        return default_llm
    return OpenAIProvider(
        api_key=payload.provider_api_key,
        base_url=payload.provider_base_url or "https://api.openai.com/v1",
        model=payload.provider_model or "gpt-4o-mini",
        timeout=settings.openai_timeout_s or 300.0,
        max_tokens=settings.openai_max_tokens,
        reasoning_effort=settings.openai_reasoning_effort,
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _short_version_id(version_id: str) -> str:
    compact = version_id.replace("-", "")
    if len(compact) >= 8 and all(c in "0123456789abcdefABCDEF" for c in compact[:8]):
        return compact[:8].lower()
    return hashlib.sha1(version_id.encode("utf-8")).hexdigest()[:8]
