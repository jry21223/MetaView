from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.schemas import (
    PipelineRequest,
    PipelineResponse,
    PipelineRunDetail,
    PipelineRunSummary,
    RuntimeCatalog,
)
from app.services.orchestrator import PipelineOrchestrator
from app.services.providers.openai import ProviderInvocationError
from app.services.providers.registry import ProviderUnavailableError

settings = get_settings()
orchestrator = PipelineOrchestrator(settings=settings)

app = FastAPI(title=settings.app_name, version=settings.app_version)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "version": settings.app_version}


@app.post(f"{settings.api_prefix}/pipeline", response_model=PipelineResponse)
def run_pipeline(request: PipelineRequest) -> PipelineResponse:
    try:
        return orchestrator.run(request)
    except ProviderUnavailableError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ProviderInvocationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get(f"{settings.api_prefix}/runtime", response_model=RuntimeCatalog)
def get_runtime_catalog() -> RuntimeCatalog:
    return orchestrator.runtime_catalog()


@app.get(f"{settings.api_prefix}/runs", response_model=list[PipelineRunSummary])
def list_pipeline_runs(limit: int = Query(default=20, ge=1, le=100)) -> list[PipelineRunSummary]:
    return orchestrator.list_runs(limit=limit)


@app.get(f"{settings.api_prefix}/runs/{{request_id}}", response_model=PipelineRunDetail)
def get_pipeline_run(request_id: str) -> PipelineRunDetail:
    run = orchestrator.get_run(request_id=request_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Pipeline run not found")
    return run
