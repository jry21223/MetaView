from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends

from app.application.dto.pipeline_dto import PipelineRequest, PipelineRunResponse
from app.application.ports.llm_provider import ILLMProvider
from app.application.ports.run_repository import IRunRepository
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.models.pipeline_run import PipelineRunStatus
from app.infrastructure.llm.openai_provider import OpenAIProvider
from app.presentation.dependencies import get_llm_provider, get_run_repo

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


@router.post("", response_model=PipelineRunResponse, status_code=202)
async def submit_pipeline(
    request: PipelineRequest,
    background_tasks: BackgroundTasks,
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
    llm: Annotated[ILLMProvider, Depends(get_llm_provider)],
) -> PipelineRunResponse:
    run_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    run_repo.create(run_id, request.prompt, created_at)

    # Per-request provider override takes precedence over the injected default
    effective_llm: ILLMProvider = llm
    if request.provider_api_key:
        effective_llm = OpenAIProvider(
            api_key=request.provider_api_key,
            base_url=request.provider_base_url or "https://api.openai.com/v1",
            model=request.provider_model or "gpt-4o-mini",
        )

    use_case = RunPipelineUseCase(run_repo, effective_llm)
    background_tasks.add_task(use_case.execute, run_id, request)

    return PipelineRunResponse(
        run_id=run_id,
        status=PipelineRunStatus.QUEUED,
        created_at=created_at,
    )
