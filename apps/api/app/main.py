from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.schemas import (
    CustomProviderTestResponse,
    CustomProviderUpsertRequest,
    CustomSubjectPromptRequest,
    CustomSubjectPromptResponse,
    ManimScriptPrepareRequest,
    ManimScriptPrepareResponse,
    ManimScriptRenderRequest,
    ManimScriptRenderResponse,
    PipelineRequest,
    PipelineResponse,
    PipelineRunDetail,
    PipelineRunSummary,
    PromptReferenceRequest,
    PromptReferenceResponse,
    ProviderDescriptor,
    RuntimeCatalog,
    RuntimeSettingsRequest,
    RuntimeSettingsResponse,
)
from app.services.manim_script import ManimScriptError, prepare_manim_script
from app.services.orchestrator import PipelineOrchestrator
from app.services.preview_video_renderer import PreviewVideoRenderError
from app.services.providers.openai import ProviderInvocationError
from app.services.providers.registry import ProviderRegistrationError, ProviderUnavailableError
from app.services.skill_catalog import SubjectSkillUnavailableError

settings = get_settings()
orchestrator = PipelineOrchestrator(settings=settings)

app = FastAPI(title=settings.app_name, version=settings.app_version)
media_root = Path(settings.preview_media_root)
media_root.mkdir(parents=True, exist_ok=True)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount(
    settings.preview_media_url_prefix,
    StaticFiles(directory=media_root),
    name="preview-media",
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
    except SubjectSkillUnavailableError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ProviderInvocationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post(
    f"{settings.api_prefix}/manim/prepare",
    response_model=ManimScriptPrepareResponse,
)
def prepare_manim_endpoint(
    payload: ManimScriptPrepareRequest,
) -> ManimScriptPrepareResponse:
    try:
        prepared = prepare_manim_script(
            payload.source,
            scene_class_name=payload.scene_class_name,
        )
    except ManimScriptError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return ManimScriptPrepareResponse(
        code=prepared.code,
        scene_class_name=prepared.scene_class_name,
        diagnostics=prepared.diagnostics,
        is_runnable=True,
    )


@app.post(
    f"{settings.api_prefix}/manim/render",
    response_model=ManimScriptRenderResponse,
)
def render_manim_endpoint(
    payload: ManimScriptRenderRequest,
) -> ManimScriptRenderResponse:
    try:
        prepared = prepare_manim_script(
            payload.source,
            scene_class_name=payload.scene_class_name,
        )
        request_id = str(uuid4())
        preview_video = orchestrator.preview_video_renderer.render(
            script=prepared.code,
            request_id=request_id,
            scene_class_name=prepared.scene_class_name,
            require_real=payload.require_real,
        )
    except ManimScriptError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PreviewVideoRenderError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    diagnostics = list(prepared.diagnostics)
    diagnostics.extend(
        orchestrator.maybe_embed_preview_narration(
            request_id=request_id,
            preview_video_path=preview_video.file_path,
            narration_text=payload.narration_text,
        )
    )

    return ManimScriptRenderResponse(
        request_id=request_id,
        code=prepared.code,
        scene_class_name=prepared.scene_class_name,
        diagnostics=diagnostics,
        is_runnable=True,
        preview_video_url=preview_video.url,
        render_backend=preview_video.backend,
    )


@app.get(f"{settings.api_prefix}/runtime", response_model=RuntimeCatalog)
def get_runtime_catalog() -> RuntimeCatalog:
    return orchestrator.runtime_catalog()


@app.get(
    f"{settings.api_prefix}/runtime/settings",
    response_model=RuntimeSettingsResponse,
)
def get_runtime_settings() -> RuntimeSettingsResponse:
    return orchestrator.get_runtime_settings()


@app.put(
    f"{settings.api_prefix}/runtime/settings",
    response_model=RuntimeSettingsResponse,
)
def update_runtime_settings(
    payload: RuntimeSettingsRequest,
) -> RuntimeSettingsResponse:
    return orchestrator.update_runtime_settings(payload)


@app.post(
    f"{settings.api_prefix}/prompts/reference",
    response_model=PromptReferenceResponse,
)
def generate_prompt_reference(
    payload: PromptReferenceRequest,
) -> PromptReferenceResponse:
    try:
        return orchestrator.generate_prompt_reference(payload)
    except (ProviderUnavailableError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ProviderInvocationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post(
    f"{settings.api_prefix}/prompts/custom-subject",
    response_model=CustomSubjectPromptResponse,
)
def generate_custom_subject_prompt(
    payload: CustomSubjectPromptRequest,
) -> CustomSubjectPromptResponse:
    try:
        return orchestrator.generate_custom_subject_prompt(payload)
    except (ProviderUnavailableError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ProviderInvocationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get(f"{settings.api_prefix}/runs", response_model=list[PipelineRunSummary])
def list_pipeline_runs(limit: int = Query(default=20, ge=1, le=100)) -> list[PipelineRunSummary]:
    return orchestrator.list_runs(limit=limit)


@app.get(f"{settings.api_prefix}/runs/{{request_id}}", response_model=PipelineRunDetail)
def get_pipeline_run(request_id: str) -> PipelineRunDetail:
    run = orchestrator.get_run(request_id=request_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Pipeline run not found")
    return run


@app.post(f"{settings.api_prefix}/providers/custom", response_model=ProviderDescriptor)
def upsert_custom_provider(payload: CustomProviderUpsertRequest) -> ProviderDescriptor:
    try:
        return orchestrator.upsert_custom_provider(payload)
    except ProviderRegistrationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post(
    f"{settings.api_prefix}/providers/custom/test",
    response_model=CustomProviderTestResponse,
)
def test_custom_provider(payload: CustomProviderUpsertRequest) -> CustomProviderTestResponse:
    try:
        return orchestrator.test_custom_provider(payload)
    except ProviderRegistrationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ProviderInvocationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.delete(f"{settings.api_prefix}/providers/custom/{{name}}")
def delete_custom_provider(name: str) -> dict[str, bool]:
    try:
        deleted = orchestrator.delete_custom_provider(name)
    except ProviderRegistrationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not deleted:
        raise HTTPException(status_code=404, detail="Custom provider not found")
    return {"deleted": True}
