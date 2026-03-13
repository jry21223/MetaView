from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.schemas import PipelineRequest, PipelineResponse, RuntimeCatalog
from app.services.orchestrator import PipelineOrchestrator

settings = get_settings()
orchestrator = PipelineOrchestrator(
    default_provider=settings.default_provider,
    sandbox_timeout_ms=settings.sandbox_timeout_ms,
)

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
    return orchestrator.run(request)


@app.get(f"{settings.api_prefix}/runtime", response_model=RuntimeCatalog)
def get_runtime_catalog() -> RuntimeCatalog:
    return orchestrator.runtime_catalog()
