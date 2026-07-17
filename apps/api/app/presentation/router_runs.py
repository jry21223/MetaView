from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from starlette.requests import Request

from app.application.dto.followup_dto import (
    FollowUpRequest,
    FollowUpResponse,
    RestoreVersionResponse,
    RunFollowUpsResponse,
)
from app.application.dto.pipeline_dto import PipelineRunResponse
from app.application.ports.director_repository import IRunDirectorRepository
from app.application.ports.llm_provider import ILLMProvider
from app.application.ports.run_repository import IRunRepository
from app.application.use_cases.account import AccountUseCase, InsufficientBalanceError
from app.application.use_cases.follow_up import FollowUpPatchError, FollowUpPatchUseCase
from app.config import Settings, get_settings
from app.domain.models.account import SessionAccount
from app.domain.models.playbook import PlaybookScript
from app.domain.services.director_builder import build_default_director
from app.domain.services.playbook_quality import quality_gate_playbook
from app.infrastructure.llm.openai_provider import OpenAIProvider
from app.presentation.dependencies import (
    get_account_use_case,
    get_llm_provider,
    get_run_director_repo,
    get_run_repo,
)
from app.presentation.edition_policy import require_wechat_session
from app.presentation.rate_limit import read_limit, write_limit

router = APIRouter(prefix="/runs", tags=["runs"])
_RUN_LOCKS: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


@router.get("", response_model=list[PipelineRunResponse])
@read_limit()
async def list_runs(
    request: Request,
    response: Response,
    settings: Annotated[Settings, Depends(get_settings)],
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
    account_use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
    limit: int = 50,
) -> list[PipelineRunResponse]:
    owner = await _owner_session(request, response, settings, account_use_case)
    owner_user_id = owner.account.user_id if owner is not None else None
    return await run_repo.list(limit=limit, user_id=owner_user_id)


@router.get("/{run_id}", response_model=PipelineRunResponse)
@read_limit()
async def get_run(
    request: Request,
    response: Response,
    run_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
    director_repo: Annotated[IRunDirectorRepository, Depends(get_run_director_repo)],
    account_use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
) -> PipelineRunResponse:
    owner = await _owner_session(request, response, settings, account_use_case)
    owner_user_id = owner.account.user_id if owner is not None else None
    run = await run_repo.get(run_id, user_id=owner_user_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    run.director = await director_repo.get(run_id)
    return run


@router.get("/{run_id}/follow-ups", response_model=RunFollowUpsResponse)
@read_limit()
async def list_followups(
    request: Request,
    response: Response,
    run_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
    account_use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
) -> RunFollowUpsResponse:
    owner = await _owner_session(request, response, settings, account_use_case)
    owner_user_id = owner.account.user_id if owner is not None else None
    run = await run_repo.get(run_id, user_id=owner_user_id)
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
    response: Response,
    run_id: str,
    payload: FollowUpRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
    director_repo: Annotated[IRunDirectorRepository, Depends(get_run_director_repo)],
    llm: Annotated[ILLMProvider, Depends(get_llm_provider)],
    account_use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
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
                "Follow-up LLM not configured: set METAVIEW_OPENAI_API_KEY or configure Provider"
            ),
        )

    async with _RUN_LOCKS[run_id]:
        owner = await _owner_session(request, response, settings, account_use_case)
        owner_user_id = owner.account.user_id if owner is not None else None
        run = await run_repo.get(run_id, user_id=owner_user_id)
        if run is None or run.playbook is None:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} has no playbook")
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
        followup_id = str(uuid.uuid4())
        consume_ledger_id = f"followup:{run_id}:{followup_id}"
        if owner is not None:
            try:
                await account_use_case.consume_generation_credit(
                    session=owner,
                    ledger_id=consume_ledger_id,
                )
            except InsufficientBalanceError as exc:
                raise HTTPException(status_code=402, detail=str(exc)) from exc
        try:
            try:
                result = await use_case.execute(base_playbook, payload)
            except FollowUpPatchError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc

            next_quality = None
            if result.playbook is not None:
                next_quality = quality_gate_playbook(
                    result.playbook,
                    run.prompt,
                    generator_path="followup_patch",
                    coverage_decision=getattr(run, "coverage_decision", None),
                    lesson_plan=getattr(run, "lesson_plan", None),
                    coverage_mode=(
                        run.coverage_decision.mode
                        if getattr(run, "coverage_decision", None) is not None
                        else (
                            run.quality_report.coverage_mode
                            if run.quality_report is not None
                            else "unknown"
                        )
                    ),
                )
                next_quality.actions = [
                    *(run.quality_report.actions if run.quality_report is not None else []),
                    "followup:quality_gate",
                ]
                if next_quality.status in {"repairable", "blocked"}:
                    codes = ", ".join(issue.code for issue in next_quality.issues[:5])
                    raise HTTPException(
                        status_code=422,
                        detail=f"Follow-up failed the canonical quality gate: {codes}",
                    )

            now = _now()
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
            version_id = None
            director = None
            if result.playbook is not None:
                current_json = run.playbook.model_dump_json()
                await run_repo.ensure_initial_version(run_id, current_json, now)
                if parent_version_id is None:
                    parent_version_id = await run_repo.get_head_version_id(run_id)
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
                director = build_default_director(result.playbook, run_id)
                await director_repo.upsert(director, now)
                await run_repo.update_playbook_json(run_id, next_json)
                assert next_quality is not None
                await run_repo.update_quality_report(
                    run_id,
                    next_quality.model_dump_json(),
                )
        except Exception:
            if owner is not None:
                await account_use_case.refund_generation_credit(
                    session=owner,
                    ledger_id=consume_ledger_id,
                )
            raise

    return FollowUpResponse(
        kind="patch" if result.playbook is not None else "reply",
        reply=result.reply,
        change_summary=result.change_summary,
        version_id=version_id,
        playbook=result.playbook,
        director=director,
    )


@router.post("/{run_id}/versions/{version_id}/restore", response_model=RestoreVersionResponse)
@write_limit()
async def restore_version(
    request: Request,
    response: Response,
    run_id: str,
    version_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
    director_repo: Annotated[IRunDirectorRepository, Depends(get_run_director_repo)],
    account_use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
) -> RestoreVersionResponse:
    async with _RUN_LOCKS[run_id]:
        owner = await _owner_session(request, response, settings, account_use_case)
        owner_user_id = owner.account.user_id if owner is not None else None
        run = await run_repo.get(run_id, user_id=owner_user_id)
        if run is None:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
        playbook_json = await run_repo.get_version_playbook(run_id, version_id)
        if playbook_json is None:
            raise HTTPException(status_code=404, detail=f"Version {version_id!r} not found")
        try:
            playbook = PlaybookScript.model_validate_json(playbook_json)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Stored version is invalid") from exc
        quality_report = quality_gate_playbook(
            playbook,
            run.prompt,
            generator_path="version_restore",
            coverage_decision=getattr(run, "coverage_decision", None),
            lesson_plan=getattr(run, "lesson_plan", None),
            coverage_mode=(
                run.coverage_decision.mode
                if getattr(run, "coverage_decision", None) is not None
                else (
                    run.quality_report.coverage_mode
                    if run.quality_report is not None
                    else "unknown"
                )
            ),
        )
        quality_report.actions = [
            *(run.quality_report.actions if run.quality_report is not None else []),
            "version:restore_quality_gate",
        ]
        if quality_report.status in {"repairable", "blocked"}:
            codes = ", ".join(issue.code for issue in quality_report.issues[:5])
            raise HTTPException(
                status_code=422,
                detail=f"Stored version failed the canonical quality gate: {codes}",
            )
        now = _now()
        director = build_default_director(playbook, run_id)
        await director_repo.upsert(director, now)
        await run_repo.update_playbook_json(run_id, playbook.model_dump_json())
        await run_repo.update_quality_report(run_id, quality_report.model_dump_json())

    return RestoreVersionResponse(
        version_id=version_id,
        playbook=playbook,
        director=director,
    )


@router.delete("/{run_id}", status_code=204)
@write_limit()
async def delete_run(
    request: Request,
    response: Response,
    run_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
    director_repo: Annotated[IRunDirectorRepository, Depends(get_run_director_repo)],
    account_use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
) -> None:
    owner = await _owner_session(request, response, settings, account_use_case)
    owner_user_id = owner.account.user_id if owner is not None else None
    deleted = await run_repo.delete(run_id, user_id=owner_user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    await director_repo.delete(run_id)


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


async def _owner_session(
    request: Request,
    response: Response,
    settings: Settings,
    account_use_case: AccountUseCase,
) -> SessionAccount | None:
    if settings.app_edition != "ops":
        return None
    return await require_wechat_session(request, settings, account_use_case)
