from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.schemas import (
    CustomProviderTestResponse,
    CustomProviderUpsertRequest,
    ManimScriptPrepareRequest,
    ManimScriptPrepareResponse,
    ManimScriptRenderRequest,
    ManimScriptRenderResponse,
    PipelineRequest,
    PipelineResponse,
    PipelineRunDetail,
    PipelineRunSummary,
    ProviderDescriptor,
    RuntimeCatalog,
)
from app.services.manim_script import ManimScriptError, prepare_manim_script
from app.services.orchestrator import PipelineOrchestrator
from app.services.preview_video_renderer import PreviewVideoRenderError
from app.services.providers.openai import ProviderInvocationError
from app.services.providers.registry import ProviderRegistrationError, ProviderUnavailableError
from app.services.skill_catalog import SubjectSkillUnavailableError
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any


class VideoNarrationRequest(BaseModel):
    """视频配音请求"""
    video_path: str = Field(..., description="输入视频路径")
    narration_text: str = Field(..., description="讲解文本", max_length=2000)
    voice: str = Field(default="female", description="音色：female（女声）, male（男声）")
    bgm_path: Optional[str] = Field(default=None, description="背景音乐路径")
    bgm_volume: float = Field(default=0.3, ge=0, le=1, description="背景音乐音量（0-1）")


class VideoNarrationResponse(BaseModel):
    """视频配音响应"""
    success: bool
    video_path: Optional[str] = None
    audio_path: Optional[str] = None
    video_url: Optional[str] = None
    audio_url: Optional[str] = None
    duration_ms: int = 0
    error: Optional[str] = None

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

    return ManimScriptRenderResponse(
        request_id=request_id,
        code=prepared.code,
        scene_class_name=prepared.scene_class_name,
        diagnostics=prepared.diagnostics,
        is_runnable=True,
        preview_video_url=preview_video.url,
        render_backend=preview_video.backend,
    )


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


# ========== ManimCat 风格架构 API ==========

class ConceptDesignRequest(BaseModel):
    """概念设计请求"""
    prompt: str = Field(min_length=5, max_length=1200)
    domain: Optional[str] = None
    source_code: Optional[str] = None
    source_image: Optional[str] = None


class ConceptDesignResponse(BaseModel):
    """概念设计响应"""
    success: bool
    concept_id: str
    title: str
    domain: str
    objects: list[str]
    key_moments: list[str]
    scenes_count: int
    complexity_score: int
    duration_estimate: float
    metadata: dict


class CodeGenerationRequest(BaseModel):
    """代码生成请求"""
    concept_id: str
    optimize: bool = True


class CodeGenerationResponse(BaseModel):
    """代码生成响应"""
    success: bool
    code: str
    scene_class_name: str
    lines_of_code: int
    diagnostics: list[str]
    metadata: dict


class ProcessReplayResponse(BaseModel):
    """过程回放响应"""
    process_id: str
    prompt: str
    stages: list[dict]
    result: Optional[dict] = None
    error: Optional[str] = None


@app.post(f"{settings.api_prefix}/concept/design", response_model=ConceptDesignResponse)
def design_concept(payload: ConceptDesignRequest) -> ConceptDesignResponse:
    """
    概念设计接口 - ManimCat 风格架构第一阶段
    
    将用户输入转换为结构化的动画概念设计
    """
    result = orchestrator.concept_designer.design(
        prompt=payload.prompt,
        source_image=payload.source_image,
        source_code=payload.source_code
    )
    
    if not result.success:
        raise HTTPException(status_code=400, detail=result.error)
    
    return ConceptDesignResponse(
        success=True,
        concept_id=str(uuid4()),
        title=result.concept.title,
        domain=result.concept.domain,
        objects=result.concept.objects,
        key_moments=result.concept.key_moments,
        scenes_count=len(result.scenes),
        complexity_score=result.concept.complexity_score,
        duration_estimate=result.concept.duration_estimate,
        metadata=result.metadata
    )


@app.post(f"{settings.api_prefix}/code/generate", response_model=CodeGenerationResponse)
def generate_code(payload: CodeGenerationRequest) -> CodeGenerationResponse:
    """
    代码生成接口 - ManimCat 风格架构第二阶段
    
    根据概念设计生成 Manim 代码
    """
    # 从 process registry 获取概念设计
    process = orchestrator.process_registry.get_process(payload.concept_id)
    
    if not process:
        raise HTTPException(status_code=404, detail="Concept not found")
    
    # TODO: 从 process 中提取 concept 和 scenes
    # 这里简化处理，实际应该从 process 中恢复
    result = orchestrator.code_generator.generate(
        concept=None,  # 需要从 process 中恢复
        scenes=[]
    )
    
    if not result.success:
        raise HTTPException(status_code=400, detail=result.error)
    
    return CodeGenerationResponse(
        success=True,
        code=result.code,
        scene_class_name=result.scene_class_name,
        lines_of_code=len(result.code.split('\n')),
        diagnostics=result.diagnostics,
        metadata=result.metadata
    )


@app.get(f"{settings.api_prefix}/process", response_model=list[dict])
def list_processes(
    limit: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = None
) -> list[dict]:
    """获取过程列表"""
    processes = orchestrator.process_registry.list_processes(
        limit=limit,
        status=status
    )
    return [p.to_dict() for p in processes]


@app.get(settings.api_prefix + "/process/{process_id}", response_model=dict)
def get_process(process_id: str) -> dict:
    """获取过程详情"""
    process = orchestrator.process_registry.get_process(process_id)
    if not process:
        raise HTTPException(status_code=404, detail="Process not found")
    return process.to_dict()


@app.get(settings.api_prefix + "/process/{process_id}/replay", response_model=ProcessReplayResponse)
def replay_process(process_id: str) -> ProcessReplayResponse:
    """回放过程历史"""
    replay = orchestrator.process_registry.replay_process(process_id)
    if not replay:
        raise HTTPException(status_code=404, detail="Process not found")
    return ProcessReplayResponse(**replay)


@app.get(f"{settings.api_prefix}/tasks", response_model=dict)
def get_task_queue_stats() -> dict:
    """获取任务队列统计"""
    return orchestrator.queue_processor.get_queue_stats()


@app.post(
    f"{settings.api_prefix}/video/narration",
    response_model=VideoNarrationResponse,
    summary="生成视频语音讲解",
    description="为视频生成 TTS 语音讲解并合成到视频中"
)
def generate_video_narration(
    payload: VideoNarrationRequest
) -> VideoNarrationResponse:
    """
    生成视频语音讲解
    
    - **video_path**: 输入视频路径
    - **narration_text**: 讲解文本（最多 2000 字符）
    - **voice**: 音色（female=女声，male=男声）
    - **bgm_path**: 背景音乐路径（可选）
    - **bgm_volume**: 背景音乐音量（0-1，默认 0.3）
    """
    try:
        output_dir = str(Path(payload.video_path).parent / "narrated")
        
        result = orchestrator.generate_video_with_narration(
            video_path=payload.video_path,
            narration_text=payload.narration_text,
            output_dir=output_dir,
            voice=payload.voice,
            bgm_path=payload.bgm_path,
            bgm_volume=payload.bgm_volume
        )
        
        response = VideoNarrationResponse(
            success=result["success"],
            video_path=result.get("video_path"),
            audio_path=result.get("audio_path"),
            duration_ms=result.get("duration_ms", 0),
            error=result.get("error")
        )
        
        # 生成 URL
        if result["success"] and result.get("video_path"):
            video_url_path = Path(result["video_path"]).relative_to(settings.preview_media_root)
            response.video_url = f"{settings.preview_media_url_prefix}/{video_url_path}"
        
        if result["success"] and result.get("audio_path"):
            audio_url_path = Path(result["audio_path"]).relative_to(settings.preview_media_root)
            response.audio_url = f"{settings.preview_media_url_prefix}/{audio_url_path}"
        
        return response
        
    except Exception as e:
        return VideoNarrationResponse(
            success=False,
            error=f"生成失败：{str(e)}"
        )
