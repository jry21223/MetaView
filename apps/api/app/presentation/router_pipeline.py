from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from starlette.requests import Request

from app.application.dto.pipeline_dto import PipelineRequest, PipelineRunResponse
from app.application.ports.agent_provider import IAgentProvider
from app.application.ports.director_repository import IRunDirectorRepository
from app.application.ports.llm_provider import ILLMProvider
from app.application.ports.run_repository import IRunRepository
from app.application.use_cases.account import AccountUseCase, InsufficientBalanceError
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.config import Settings, get_settings
from app.domain.models.account import SessionAccount
from app.domain.models.pipeline_run import PipelineRunStatus
from app.infrastructure.llm.openai_provider import OpenAIProvider
from app.presentation.dependencies import (
    get_account_use_case,
    get_agent_provider,
    get_llm_provider,
    get_reviewer_llm_provider,
    get_run_director_repo,
    get_run_repo,
)
from app.presentation.rate_limit import write_limit

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


@router.post("", response_model=PipelineRunResponse, status_code=202)
@write_limit()
async def submit_pipeline(
    request: Request,
    response: Response,
    payload: PipelineRequest,
    background_tasks: BackgroundTasks,
    settings: Annotated[Settings, Depends(get_settings)],
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
    director_repo: Annotated[IRunDirectorRepository, Depends(get_run_director_repo)],
    llm: Annotated[ILLMProvider, Depends(get_llm_provider)],
    reviewer_llm: Annotated[ILLMProvider | None, Depends(get_reviewer_llm_provider)],
    agent_provider: Annotated[IAgentProvider | None, Depends(get_agent_provider)],
    account_use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
) -> PipelineRunResponse:
    if settings.app_edition == "ops" and (
        payload.provider_api_key or payload.provider_base_url or payload.provider_model
    ):
        raise HTTPException(
            status_code=400,
            detail="运营版使用平台托管模型，不能提交客户端 Provider 配置",
        )

    run_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    owner_user_id: str | None = None
    owner_session: SessionAccount | None = None
    consume_ledger_id: str | None = None
    if settings.app_edition == "ops":
        owner_session = await account_use_case.get_or_create_session(
            request.cookies.get(settings.account_session_cookie)
        )
        owner_user_id = owner_session.account.user_id
        _maybe_set_session_cookie(request, response, settings, owner_session.token)
        consume_ledger_id = f"pipeline:{run_id}"
        try:
            await account_use_case.consume_generation_credit(
                session=owner_session,
                ledger_id=consume_ledger_id,
            )
        except InsufficientBalanceError as exc:
            raise HTTPException(status_code=402, detail=str(exc)) from exc

    await run_repo.create(run_id, payload.prompt, created_at, user_id=owner_user_id)

    # Per-request provider override takes precedence over the injected default.
    # When the caller supplies custom credentials, we cannot reuse the global
    # reviewer provider. Drop the reviewer to avoid crossing accounts and let
    # the generator self-repair.
    effective_llm: ILLMProvider = llm
    effective_reviewer: ILLMProvider | None = reviewer_llm
    provider_key = payload.provider_api_key
    if provider_key:
        effective_llm = OpenAIProvider(
            api_key=provider_key,
            base_url=payload.provider_base_url or "https://api.openai.com/v1",
            model=payload.provider_model or "gpt-4o-mini",
            max_tokens=settings.openai_max_tokens,
            reasoning_effort=settings.openai_reasoning_effort,
        )
        effective_reviewer = None

    use_case = RunPipelineUseCase(
        run_repo,
        effective_llm,
        reviewer_llm=effective_reviewer,
        max_repair_attempts=settings.max_repair_attempts,
        reviewer_mode=settings.reviewer_mode,
        agent_provider=agent_provider,
        generation_mode=settings.generation_mode,
        pipeline_timeout_s=settings.pipeline_timeout_s,
        director_repo=director_repo,
    )
    background_tasks.add_task(
        _execute_pipeline_with_optional_refund,
        use_case,
        run_repo,
        account_use_case,
        run_id,
        payload,
        owner_session,
        consume_ledger_id,
    )

    return PipelineRunResponse(
        run_id=run_id,
        status=PipelineRunStatus.QUEUED,
        prompt=payload.prompt,
        created_at=created_at,
    )


async def _execute_pipeline_with_optional_refund(
    use_case: RunPipelineUseCase,
    run_repo: IRunRepository,
    account_use_case: AccountUseCase,
    run_id: str,
    payload: PipelineRequest,
    owner_session: SessionAccount | None,
    consume_ledger_id: str | None,
) -> None:
    await use_case.execute(run_id, payload)
    if owner_session is None or consume_ledger_id is None:
        return
    run = await run_repo.get(run_id, user_id=owner_session.account.user_id)
    if run is not None and run.status == PipelineRunStatus.FAILED:
        await account_use_case.refund_generation_credit(
            session=owner_session,
            ledger_id=consume_ledger_id,
        )


def _maybe_set_session_cookie(
    request: Request,
    response: Response,
    settings: Settings,
    token: str,
) -> None:
    if request.cookies.get(settings.account_session_cookie) == token:
        return
    response.set_cookie(
        settings.account_session_cookie,
        token,
        max_age=settings.account_session_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.account_session_secure,
        samesite="lax",
    )
