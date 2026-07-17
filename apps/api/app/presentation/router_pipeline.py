from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from starlette.requests import Request

from app.application.dto.pipeline_dto import PipelineRequest, PipelineRunResponse
from app.application.ports.agent_provider import IAgentProvider
from app.application.ports.coverage_resolver import ICoverageResolver
from app.application.ports.director_repository import IRunDirectorRepository
from app.application.ports.llm_provider import ILLMProvider
from app.application.ports.router_provider import IRouterProvider
from app.application.ports.run_repository import IRunRepository
from app.application.use_cases.account import AccountUseCase, InsufficientBalanceError
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.config import Settings, get_settings
from app.domain.models.account import SessionAccount
from app.domain.models.pipeline_run import PipelineRunStatus
from app.infrastructure.llm.openai_provider import OpenAIProvider
from app.infrastructure.router.llm_router_provider import LLMRouterProvider
from app.presentation.dependencies import (
    get_account_use_case,
    get_agent_provider,
    get_coverage_resolver,
    get_llm_provider,
    get_reviewer_llm_provider,
    get_router_provider,
    get_run_director_repo,
    get_run_repo,
)
from app.presentation.edition_policy import require_wechat_session
from app.presentation.rate_limit import write_limit

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


@router.post("", response_model=PipelineRunResponse, status_code=202)
@write_limit()
async def submit_pipeline(
    request: Request,
    payload: PipelineRequest,
    background_tasks: BackgroundTasks,
    settings: Annotated[Settings, Depends(get_settings)],
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
    director_repo: Annotated[IRunDirectorRepository, Depends(get_run_director_repo)],
    llm: Annotated[ILLMProvider, Depends(get_llm_provider)],
    reviewer_llm: Annotated[ILLMProvider | None, Depends(get_reviewer_llm_provider)],
    router_provider: Annotated[IRouterProvider | None, Depends(get_router_provider)],
    agent_provider: Annotated[IAgentProvider | None, Depends(get_agent_provider)],
    coverage_resolver: Annotated[ICoverageResolver, Depends(get_coverage_resolver)],
    account_use_case: Annotated[AccountUseCase, Depends(get_account_use_case)],
) -> PipelineRunResponse:
    run_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    router_min_confidence = (
        payload.router_min_confidence
        if payload.router_min_confidence is not None
        else settings.router_min_confidence
    )
    router_refine_confidence = min(
        settings.router_refine_confidence,
        router_min_confidence,
    )
    owner_user_id: str | None = None
    owner_session: SessionAccount | None = None
    consume_ledger_id: str | None = None
    if settings.app_edition == "ops":
        owner_session = await require_wechat_session(request, settings, account_use_case)
        owner_user_id = owner_session.account.user_id
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
    effective_router: IRouterProvider | None = router_provider
    provider_key = payload.provider_api_key
    router_mode = payload.router_mode or settings.router_mode
    router_timeout_s = payload.router_timeout_s or settings.router_timeout_s
    if provider_key:
        effective_llm = OpenAIProvider(
            api_key=provider_key,
            base_url=payload.provider_base_url or "https://api.openai.com/v1",
            model=payload.provider_model or "gpt-4o-mini",
            max_tokens=settings.openai_max_tokens,
            reasoning_effort=settings.openai_reasoning_effort,
        )
        effective_reviewer = None
        effective_router = _build_request_router(
            payload,
            settings,
            api_key=provider_key,
            base_url=payload.provider_base_url or "https://api.openai.com/v1",
            fallback_model=payload.provider_model or "gpt-4o-mini",
            router_mode=router_mode,
            router_timeout_s=router_timeout_s,
        )
    elif _needs_router_rebuild(payload, router_mode) and settings.openai_api_key:
        effective_router = _build_request_router(
            payload,
            settings,
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
            fallback_model=settings.openai_model or "gpt-4o-mini",
            router_mode=router_mode,
            router_timeout_s=router_timeout_s,
        )
    elif router_mode in {"off", "heuristic"}:
        effective_router = None

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
        router_provider=effective_router,
        router_mode=router_mode,
        router_min_confidence=router_min_confidence,
        router_refine_confidence=router_refine_confidence,
        coverage_resolver=(
            coverage_resolver if payload.router_min_confidence is None else None
        ),
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


def _needs_router_rebuild(payload: PipelineRequest, router_mode: str) -> bool:
    return bool(
        router_mode in {"llm", "hybrid"}
        and (payload.router_model or payload.router_timeout_s is not None)
    )


def _build_request_router(
    payload: PipelineRequest,
    settings: Settings,
    *,
    api_key: str,
    base_url: str,
    fallback_model: str,
    router_mode: str,
    router_timeout_s: float,
) -> IRouterProvider | None:
    if router_mode not in {"llm", "hybrid"}:
        return None
    model = (
        payload.router_model
        or settings.router_model
        or settings.openai_router_model
        or fallback_model
        or "gpt-4o-mini"
    )
    llm = OpenAIProvider(
        api_key=api_key,
        base_url=base_url,
        model=model,
        timeout=router_timeout_s,
        temperature=settings.router_temperature,
    )
    return LLMRouterProvider(llm, model_name=model)
