from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends
from starlette.requests import Request

from app.application.dto.pipeline_dto import PipelineRequest, PipelineRunResponse
from app.application.ports.agent_provider import IAgentProvider
from app.application.ports.llm_provider import ILLMProvider
from app.application.ports.run_repository import IRunRepository
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.config import Settings, get_settings
from app.domain.models.pipeline_run import PipelineRunStatus
from app.infrastructure.llm.openai_provider import OpenAIProvider
from app.presentation.dependencies import (
    get_agent_provider,
    get_llm_provider,
    get_reviewer_llm_provider,
    get_run_repo,
)
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
    llm: Annotated[ILLMProvider, Depends(get_llm_provider)],
    reviewer_llm: Annotated[ILLMProvider | None, Depends(get_reviewer_llm_provider)],
    agent_provider: Annotated[IAgentProvider | None, Depends(get_agent_provider)],
) -> PipelineRunResponse:
    run_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    await run_repo.create(run_id, payload.prompt, created_at)

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
    )
    background_tasks.add_task(use_case.execute, run_id, payload)

    return PipelineRunResponse(
        run_id=run_id,
        status=PipelineRunStatus.QUEUED,
        prompt=payload.prompt,
        created_at=created_at,
    )
