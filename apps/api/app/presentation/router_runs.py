from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from starlette.requests import Request

from app.application.dto.pipeline_dto import PipelineRunResponse
from app.application.ports.run_repository import IRunRepository
from app.presentation.dependencies import get_run_repo
from app.presentation.rate_limit import read_limit

router = APIRouter(prefix="/runs", tags=["runs"])


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
