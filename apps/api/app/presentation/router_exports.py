from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from app.application.dto.export_dto import ExportJobResponse, ExportRequest
from app.application.ports.export_repository import IExportJobRepository
from app.application.ports.run_repository import IRunRepository
from app.application.use_cases.export_video import ExportVideoUseCase
from app.config import Settings, get_settings
from app.domain.models.export_job import ExportJob, ExportJobStatus
from app.presentation.dependencies import get_export_repo, get_run_repo

router = APIRouter(prefix="/exports", tags=["exports"])


def _resolve_path(raw: str) -> Path:
    p = Path(raw)
    if p.is_absolute():
        return p
    # Resolve relative to current working directory (process root).
    return Path.cwd() / p


def _to_response(job: ExportJob, request: Request, api_prefix: str) -> ExportJobResponse:
    output_url: str | None = None
    if job.status == ExportJobStatus.COMPLETED and job.output_path:
        output_url = f"{api_prefix}/exports/{job.job_id}/download"
    return ExportJobResponse(
        job_id=job.job_id,
        run_id=job.run_id,
        status=job.status,
        progress=job.progress,
        message=job.message,
        output_url=output_url,
        error=job.error,
        with_audio=job.with_audio,
        created_at=job.created_at,
    )


@router.post("", response_model=ExportJobResponse, status_code=202)
def submit_export(
    request: ExportRequest,
    http_request: Request,
    background_tasks: BackgroundTasks,
    export_repo: Annotated[IExportJobRepository, Depends(get_export_repo)],
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ExportJobResponse:
    if request.with_audio and request.tts is None:
        raise HTTPException(status_code=400, detail="with_audio=true requires a tts config")
    run = run_repo.get(request.run_id)
    if run is None or run.playbook is None:
        raise HTTPException(status_code=404, detail=f"Run {request.run_id!r} has no playbook")

    job_id = str(uuid.uuid4())
    job = ExportJob(
        job_id=job_id,
        run_id=request.run_id,
        with_audio=request.with_audio,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    export_repo.create(job)

    use_case = ExportVideoUseCase(
        export_repo,
        run_repo,
        web_app_dir=_resolve_path(settings.export_web_app_dir),
        artifacts_dir=_resolve_path(settings.export_artifacts_dir),
    )
    background_tasks.add_task(
        use_case.execute,
        job_id,
        request.run_id,
        request.with_audio,
        request.tts,
    )

    return _to_response(job, http_request, settings.api_prefix)


@router.get("/{job_id}", response_model=ExportJobResponse)
def get_export(
    job_id: str,
    http_request: Request,
    export_repo: Annotated[IExportJobRepository, Depends(get_export_repo)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ExportJobResponse:
    job = export_repo.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Export {job_id!r} not found")
    return _to_response(job, http_request, settings.api_prefix)


@router.get("/{job_id}/download")
def download_export(
    job_id: str,
    export_repo: Annotated[IExportJobRepository, Depends(get_export_repo)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> FileResponse:
    job = export_repo.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Export {job_id!r} not found")
    if job.status != ExportJobStatus.COMPLETED or not job.output_path:
        raise HTTPException(status_code=409, detail="export not finished")
    artifacts_root = _resolve_path(settings.export_artifacts_dir).resolve()
    try:
        path = Path(job.output_path).resolve(strict=True)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=410, detail="output file missing") from exc
    # Reject paths that escape the artifacts root (symlink / traversal guard).
    if not path.is_relative_to(artifacts_root):
        raise HTTPException(status_code=403, detail="output path outside artifacts root")
    return FileResponse(
        path,
        media_type="video/mp4",
        filename=f"metaview-{job.run_id[:8]}.mp4",
    )
