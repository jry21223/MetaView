from enum import Enum
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator, model_validator


class TopicDomain(str, Enum):
    ALGORITHM = "algorithm"
    MATH = "math"
    CODE = "code"
    PHYSICS = "physics"
    CHEMISTRY = "chemistry"
    BIOLOGY = "biology"
    GEOGRAPHY = "geography"


class ProviderName(str, Enum):
    MOCK = "mock"
    OPENAI = "openai"


class ProviderKind(str, Enum):
    MOCK = "mock"
    OPENAI_COMPATIBLE = "openai_compatible"


class SandboxMode(str, Enum):
    DRY_RUN = "dry_run"
    OFF = "off"


class OutputMode(str, Enum):
    """Rendering output mode. VIDEO produces Manim MP4; HTML produces interactive web page."""

    VIDEO = "video"
    HTML = "html"


class UITheme(str, Enum):
    DARK = "dark"
    LIGHT = "light"


class SandboxStatus(str, Enum):
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"


class PipelineRunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class ValidationSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class ValidationStatus(str, Enum):
    VALID = "valid"
    INVALID = "invalid"


class VisualKind(str, Enum):
    ARRAY = "array"
    FLOW = "flow"
    FORMULA = "formula"
    GRAPH = "graph"
    TEXT = "text"
    MOTION = "motion"
    CIRCUIT = "circuit"
    MOLECULE = "molecule"
    MAP = "map"
    CELL = "cell"


class HtmlAnimationKind(str, Enum):
    GENERIC = "generic"
    LOGIC_FLOW = "logic_flow"


class LayoutInstruction(BaseModel):
    x: int = 64
    y: int = 96
    width: int = 640
    height: int = 120


class VisualToken(BaseModel):
    id: str
    label: str
    value: str | None = None
    emphasis: str = "secondary"


class CirStep(BaseModel):
    id: str
    title: str
    narration: str
    visual_kind: VisualKind
    layout: LayoutInstruction = Field(default_factory=LayoutInstruction)
    tokens: list[VisualToken] = Field(default_factory=list)
    annotations: list[str] = Field(default_factory=list)
    # 时间元数据（用于动画-代码联动）
    start_time: float | None = None  # 步骤开始时间（秒）
    end_time: float | None = None  # 步骤结束时间（秒）


class CirDocument(BaseModel):
    version: str = "0.1.0"
    title: str
    domain: TopicDomain
    summary: str
    steps: list[CirStep] = Field(default_factory=list)
    preset_id: str | None = Field(default=None, description="命中的知识点预设 ID")


class HtmlAnimationParam(BaseModel):
    key: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=100)
    value: str = Field(default="", max_length=500)


class HtmlAnimationStepPayload(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=200)
    narration: str = Field(min_length=1, max_length=2000)
    visual_kind: VisualKind
    tokens: list[VisualToken] = Field(default_factory=list)
    duration_ms: int | None = Field(default=None, ge=120, le=8000)
    emphasis_token_ids: list[str] = Field(default_factory=list, max_length=8)


class HtmlFlowNodePayload(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    x: int = Field(ge=0, le=800)
    y: int = Field(ge=0, le=400)
    label: str = Field(min_length=1, max_length=120)
    kind: Literal["start", "process", "decision", "end"] = "process"

    @field_validator("x", mode="before")
    @classmethod
    def clamp_x(cls, value: int | str) -> int | str:
        if isinstance(value, int):
            return min(max(value, 0), 800)
        return value

    @field_validator("y", mode="before")
    @classmethod
    def clamp_y(cls, value: int | str) -> int | str:
        if isinstance(value, int):
            return min(max(value, 0), 400)
        return value


class HtmlFlowLinkPayload(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    from_node: str = Field(alias="from", min_length=1, max_length=120)
    to_node: str = Field(alias="to", min_length=1, max_length=120)
    label: str | None = Field(default=None, max_length=80)


class HtmlFlowStepPayload(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=400)
    highlight_node: str | None = Field(default=None, max_length=120)
    pulse_link_ids: list[str] = Field(default_factory=list, max_length=8)
    activate_node_ids: list[str] = Field(default_factory=list, max_length=8)
    duration_ms: int = Field(default=700, ge=180, le=8000)


class HtmlAnimationPayload(BaseModel):
    kind: HtmlAnimationKind = HtmlAnimationKind.GENERIC
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(default="", max_length=2000)
    steps: list[HtmlAnimationStepPayload] = Field(default_factory=list, max_length=24)
    params: list[HtmlAnimationParam] = Field(default_factory=list, max_length=8)
    flow_nodes: list[HtmlFlowNodePayload] = Field(default_factory=list, max_length=24)
    flow_links: list[HtmlFlowLinkPayload] = Field(default_factory=list, max_length=32)
    flow_steps: list[HtmlFlowStepPayload] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def require_animation_content(self) -> "HtmlAnimationPayload":
        if self.kind == HtmlAnimationKind.LOGIC_FLOW:
            if not self.flow_nodes:
                raise ValueError("Logic-flow payload must include at least one flow node")
            if not self.flow_steps:
                raise ValueError("Logic-flow payload must include at least one flow step")
            node_ids = {node.id for node in self.flow_nodes}
            for link in self.flow_links:
                if link.from_node not in node_ids or link.to_node not in node_ids:
                    raise ValueError("Logic-flow links must reference existing nodes")
            link_ids = {link.id for link in self.flow_links}
            for step in self.flow_steps:
                if step.highlight_node and step.highlight_node not in node_ids:
                    raise ValueError("Logic-flow step highlight must reference an existing node")
                if any(node_id not in node_ids for node_id in step.activate_node_ids):
                    raise ValueError("Logic-flow step active nodes must reference existing nodes")
                if any(link_id not in link_ids for link_id in step.pulse_link_ids):
                    raise ValueError("Logic-flow step pulse links must reference existing links")
            return self
        if not self.steps:
            raise ValueError("HTML animation payload must include at least one step")
        return self


class ExecutionParameterControl(BaseModel):
    id: str
    label: str
    value: str
    description: str | None = None
    placeholder: str | None = None


class ExecutionArrayTrack(BaseModel):
    id: str
    label: str
    values: list[str] = Field(default_factory=list)
    target_value: str | None = None


class ExecutionCheckpoint(BaseModel):
    id: str
    step_index: int = Field(ge=0)
    step_id: str
    visual_kind: VisualKind
    title: str
    summary: str
    start_s: float = Field(ge=0)
    start_progress: float | None = Field(default=None, ge=0, le=1)
    end_s: float = Field(ge=0)
    end_progress: float | None = Field(default=None, ge=0, le=1)
    code_lines: list[int] = Field(default_factory=list)
    focus_tokens: list[str] = Field(default_factory=list)
    array_focus_indices: list[int] = Field(default_factory=list)
    array_reference_indices: list[int] = Field(default_factory=list)
    breakpoint: bool = False
    guiding_question: str | None = None


class ExecutionMap(BaseModel):
    duration_s: float = Field(gt=0)
    interaction_hint: str | None = None
    checkpoints: list[ExecutionCheckpoint] = Field(default_factory=list)
    parameter_controls: list[ExecutionParameterControl] = Field(default_factory=list)
    array_track: ExecutionArrayTrack | None = None
    step_to_checkpoint: dict[str, str] = Field(default_factory=dict)
    line_to_step_ids: dict[int, list[str]] = Field(default_factory=dict)


class PipelineRequest(BaseModel):
    prompt: str = Field(min_length=5, max_length=1200)
    domain: TopicDomain | None = None
    provider: str | None = None
    router_provider: str | None = None
    generation_provider: str | None = None
    source_code: str | None = Field(default=None, max_length=60_000)
    source_code_language: str | None = Field(default=None, max_length=20)
    source_image: str | None = Field(default=None, max_length=3_500_000)
    source_image_name: str | None = Field(default=None, max_length=200)
    ui_theme: UITheme | None = None
    enable_narration: bool = True
    sandbox_mode: SandboxMode = SandboxMode.DRY_RUN
    output_mode: OutputMode = OutputMode.VIDEO
    persist_run: bool = True

    @model_validator(mode="after")
    def apply_provider_aliases(self) -> "PipelineRequest":
        generation_provider = self.generation_provider or self.provider
        self.generation_provider = generation_provider
        if self.router_provider is None:
            self.router_provider = generation_provider
        if self.provider is None:
            self.provider = generation_provider
        return self


class AgentDiagnostic(BaseModel):
    agent: str
    message: str


class ProviderDescriptor(BaseModel):
    name: str
    label: str
    kind: ProviderKind
    model: str
    stage_models: dict[str, str] = Field(default_factory=dict)
    description: str
    configured: bool = True
    is_custom: bool = False
    supports_vision: bool = False
    base_url: str | None = None
    temperature: float | None = None
    api_key_configured: bool = False


TTSBackend = Literal["auto", "system", "openai_compatible"]
RenderBackend = Literal["auto", "manim", "fallback"]
ManimQuality = Literal["l", "m", "h", "p", "k"]
ManimFormat = Literal["mp4", "webm", "gif"]


def _strip_or_none(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _coerce_optional_float(value: float | str | None) -> float | str | None:
    if value is None:
        return None
    if isinstance(value, str):
        normalized = value.strip()
        return normalized or None
    return value


class ManimSettingsRequest(BaseModel):
    """Manim 渲染引擎配置"""

    python_path: str = Field(default=".venv-manim/bin/python", max_length=300)
    cli_module: str = Field(default="manim", max_length=100)
    quality: ManimQuality = "h"
    format: ManimFormat = "mp4"
    disable_caching: bool = True
    render_timeout_s: float | None = Field(default=None, gt=0)

    @field_validator("python_path", "cli_module", mode="before")
    @classmethod
    def normalize_paths(cls, value: str | None) -> str | None:
        return _strip_or_none(value)

    @field_validator("render_timeout_s", mode="before")
    @classmethod
    def normalize_optional_timeout(cls, value: float | str | None) -> float | str | None:
        return _coerce_optional_float(value)


class ManimSettingsResponse(BaseModel):
    python_path: str = ".venv-manim/bin/python"
    cli_module: str = "manim"
    quality: ManimQuality = "h"
    format: ManimFormat = "mp4"
    disable_caching: bool = True
    render_timeout_s: float | None = None


class CJKFontSettingsRequest(BaseModel):
    """中文字体配置（统一用于真实 Manim 与 Fallback 预览）"""

    family: str = Field(default="Noto Sans CJK SC", max_length=100)
    path: str | None = Field(default=None, max_length=300)

    @field_validator("family", "path", mode="before")
    @classmethod
    def normalize_strings(cls, value: str | None) -> str | None:
        return _strip_or_none(value)


class CJKFontSettingsResponse(BaseModel):
    family: str = "Noto Sans CJK SC"
    path: str | None = None


class OpenAIProviderSettingsRequest(BaseModel):
    """内置 OpenAI 兼容 Provider 配置"""

    api_key: str | None = Field(default=None, max_length=300)
    base_url: str = Field(default="https://api.openai.com/v1", max_length=300)
    model: str | None = Field(default=None, max_length=100)
    router_model: str | None = Field(default=None, max_length=100)
    planning_model: str | None = Field(default=None, max_length=100)
    coding_model: str | None = Field(default=None, max_length=100)
    critic_model: str | None = Field(default=None, max_length=100)
    test_model: str | None = Field(default=None, max_length=100)
    supports_vision: bool = False
    timeout_s: float | None = Field(default=300.0, gt=0)

    @field_validator(
        "api_key",
        "base_url",
        "model",
        "router_model",
        "planning_model",
        "coding_model",
        "critic_model",
        "test_model",
        mode="before",
    )
    @classmethod
    def normalize_optional_strings(cls, value: str | None) -> str | None:
        return _strip_or_none(value)

    @field_validator("timeout_s", mode="before")
    @classmethod
    def normalize_optional_timeout(cls, value: float | str | None) -> float | str | None:
        return _coerce_optional_float(value)


class OpenAIProviderSettingsResponse(BaseModel):
    api_key_configured: bool = False
    base_url: str = "https://api.openai.com/v1"
    model: str | None = None
    router_model: str | None = None
    planning_model: str | None = None
    coding_model: str | None = None
    critic_model: str | None = None
    test_model: str | None = None
    supports_vision: bool = False
    timeout_s: float | None = 300.0


class ProviderDefaultsRequest(BaseModel):
    """默认 Provider 选择"""

    default_provider: str | None = Field(default=None, max_length=100)
    default_router_provider: str | None = Field(default=None, max_length=100)
    default_generation_provider: str | None = Field(default=None, max_length=100)

    @field_validator(
        "default_provider",
        "default_router_provider",
        "default_generation_provider",
        mode="before",
    )
    @classmethod
    def normalize_optional_strings(cls, value: str | None) -> str | None:
        return _strip_or_none(value)


class ProviderDefaultsResponse(BaseModel):
    default_provider: str | None = None
    default_router_provider: str | None = None
    default_generation_provider: str | None = None


class CorsSettingsRequest(BaseModel):
    """CORS 跨域配置"""

    origin_regex: str = Field(
        default=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        max_length=500,
    )

    @field_validator("origin_regex", mode="before")
    @classmethod
    def normalize_regex(cls, value: str | None) -> str | None:
        return _strip_or_none(value)


class CorsSettingsResponse(BaseModel):
    origin_regex: str = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


class TTSSettingsRequest(BaseModel):
    enabled: bool = True
    backend: TTSBackend = "openai_compatible"
    model: str = Field(default="mimotts-v2", min_length=1, max_length=100)
    base_url: str | None = Field(default=None, max_length=300)
    api_key: str | None = Field(default=None, max_length=300)
    voice: str = Field(default="default", min_length=1, max_length=100)
    rate_wpm: int = Field(default=150, ge=60, le=320)
    speed: float = Field(default=0.88, ge=0.5, le=1.5)
    max_chars: int = Field(default=1500, ge=100, le=20_000)
    timeout_s: float | None = Field(default=120.0, gt=0)

    @field_validator("base_url", "api_key", "voice", mode="before")
    @classmethod
    def normalize_optional_string(cls, value: str | None) -> str | None:
        return _strip_or_none(value)

    @field_validator("timeout_s", mode="before")
    @classmethod
    def normalize_optional_timeout(cls, value: float | str | None) -> float | str | None:
        return _coerce_optional_float(value)


class TTSSettingsResponse(BaseModel):
    enabled: bool = True
    backend: TTSBackend = "openai_compatible"
    model: str = "mimotts-v2"
    base_url: str | None = None
    api_key_configured: bool = False
    voice: str = "default"
    rate_wpm: int = 150
    speed: float = 0.88
    max_chars: int = 1500
    timeout_s: float | None = 120.0


class RuntimeSettingsRequest(BaseModel):
    """运行时可编辑配置（存 SQLite，不依赖环境变量）"""

    mock_provider_enabled: bool = True
    enabled_domains: str = "algorithm,math,code,physics,chemistry,biology,geography"
    render_backend: RenderBackend = "auto"
    manim: ManimSettingsRequest = Field(default_factory=ManimSettingsRequest)
    cjk_font: CJKFontSettingsRequest = Field(default_factory=CJKFontSettingsRequest)
    openai: OpenAIProviderSettingsRequest = Field(default_factory=OpenAIProviderSettingsRequest)
    default_providers: ProviderDefaultsRequest = Field(default_factory=ProviderDefaultsRequest)
    cors: CorsSettingsRequest = Field(default_factory=CorsSettingsRequest)
    tts: TTSSettingsRequest = Field(default_factory=TTSSettingsRequest)

    @field_validator("enabled_domains", mode="before")
    @classmethod
    def normalize_domains(cls, value: str | None) -> str:
        if value is None:
            return "algorithm,math,code,physics,chemistry,biology,geography"
        normalized = value.strip()
        return normalized or "algorithm,math,code,physics,chemistry,biology,geography"


class RuntimeSettingsResponse(BaseModel):
    mock_provider_enabled: bool = True
    enabled_domains: str = "algorithm,math,code,physics,chemistry,biology,geography"
    render_backend: RenderBackend = "auto"
    manim: ManimSettingsResponse = Field(default_factory=ManimSettingsResponse)
    cjk_font: CJKFontSettingsResponse = Field(default_factory=CJKFontSettingsResponse)
    openai: OpenAIProviderSettingsResponse = Field(default_factory=OpenAIProviderSettingsResponse)
    default_providers: ProviderDefaultsResponse = Field(default_factory=ProviderDefaultsResponse)
    cors: CorsSettingsResponse = Field(default_factory=CorsSettingsResponse)
    tts: TTSSettingsResponse = Field(default_factory=TTSSettingsResponse)


class SkillDescriptor(BaseModel):
    id: str
    domain: TopicDomain
    label: str
    description: str
    version: str = "1.0.0"
    triggers: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    supports_image_input: bool = False
    execution_notes: list[str] = Field(default_factory=list)


class AgentTrace(BaseModel):
    agent: str
    provider: str
    model: str
    summary: str
    raw_output: str | None = None


class SandboxReport(BaseModel):
    mode: SandboxMode
    engine: str
    status: SandboxStatus
    duration_ms: int = 0
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class ValidationIssue(BaseModel):
    severity: ValidationSeverity
    code: str
    message: str
    step_id: str | None = None


class CirValidationReport(BaseModel):
    status: ValidationStatus
    issues: list[ValidationIssue] = Field(default_factory=list)


class PipelineRuntime(BaseModel):
    skill: SkillDescriptor
    provider: ProviderDescriptor | None = None
    router_provider: ProviderDescriptor | None = None
    generation_provider: ProviderDescriptor | None = None
    sandbox: SandboxReport
    validation: CirValidationReport
    agent_traces: list[AgentTrace] = Field(default_factory=list)
    repair_count: int = 0
    repair_actions: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def apply_provider_aliases(self) -> "PipelineRuntime":
        generation_provider = self.generation_provider or self.provider
        router_provider = self.router_provider or generation_provider
        self.generation_provider = generation_provider
        self.router_provider = router_provider
        self.provider = generation_provider
        return self


class RuntimeCatalog(BaseModel):
    default_provider: str | None = None
    default_router_provider: str | None = None
    default_generation_provider: str | None = None
    sandbox_engine: str
    providers: list[ProviderDescriptor] = Field(default_factory=list)
    skills: list[SkillDescriptor] = Field(default_factory=list)
    sandbox_modes: list[SandboxMode] = Field(default_factory=list)
    settings: RuntimeSettingsResponse = Field(default_factory=RuntimeSettingsResponse)

    @model_validator(mode="after")
    def apply_provider_aliases(self) -> "RuntimeCatalog":
        default_generation_provider = (
            self.default_generation_provider
            or self.default_provider
            or (self.providers[0].name if self.providers else None)
        )
        default_router_provider = self.default_router_provider or default_generation_provider
        self.default_generation_provider = default_generation_provider
        self.default_router_provider = default_router_provider
        self.default_provider = default_generation_provider
        return self


class PipelineResponse(BaseModel):
    request_id: str = Field(default_factory=lambda: str(uuid4()))
    cir: CirDocument
    renderer_script: str
    preview_video_url: str | None = None
    preview_html_url: str | None = None
    execution_map: ExecutionMap | None = None
    diagnostics: list[AgentDiagnostic] = Field(default_factory=list)
    runtime: PipelineRuntime
    # 步骤时间元数据（用于动画-代码联动）
    step_timing: list[dict] = Field(default_factory=list)


class PipelineSubmitResponse(BaseModel):
    request_id: str
    created_at: str
    status: PipelineRunStatus


class PipelineRunSummary(BaseModel):
    request_id: str
    created_at: str
    updated_at: str
    status: PipelineRunStatus
    prompt: str
    title: str
    domain: TopicDomain | None = None
    output_mode: OutputMode = OutputMode.VIDEO
    provider: str | None = None
    router_provider: str | None = None
    generation_provider: str | None = None
    sandbox_status: SandboxStatus | None = None
    error_message: str | None = None

    @model_validator(mode="after")
    def apply_provider_aliases(self) -> "PipelineRunSummary":
        generation_provider = self.generation_provider or self.provider
        router_provider = self.router_provider or generation_provider
        self.generation_provider = generation_provider
        self.router_provider = router_provider
        self.provider = generation_provider
        return self


class PipelineRunDetail(BaseModel):
    created_at: str
    updated_at: str
    status: PipelineRunStatus
    error_message: str | None = None
    request: PipelineRequest
    response: PipelineResponse | None = None


class PromptReferenceRequest(BaseModel):
    subject: TopicDomain
    provider: str | None = None
    notes: str | None = Field(default=None, max_length=6000)
    write: bool = False


class PromptReferenceResponse(BaseModel):
    subject: TopicDomain
    provider: str
    model: str
    output_path: str
    markdown: str
    wrote_file: bool
    raw_output: str | None = None


class CustomSubjectPromptRequest(BaseModel):
    subject_name: str = Field(min_length=2, max_length=80)
    provider: str | None = None
    summary: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=6000)
    write: bool = False

    @field_validator("subject_name", "summary", "notes", mode="before")
    @classmethod
    def normalize_prompt_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class CustomSubjectPromptResponse(BaseModel):
    subject_name: str
    slug: str
    provider: str
    model: str
    output_path: str
    markdown: str
    wrote_file: bool
    raw_output: str | None = None


class CustomProviderUpsertRequest(BaseModel):
    name: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{1,30}$")
    label: str = Field(min_length=2, max_length=40)
    base_url: str = Field(min_length=8, max_length=300)
    model: str = Field(min_length=1, max_length=100)
    router_model: str | None = Field(default=None, max_length=100)
    planning_model: str | None = Field(default=None, max_length=100)
    coding_model: str | None = Field(default=None, max_length=100)
    critic_model: str | None = Field(default=None, max_length=100)
    test_model: str | None = Field(default=None, max_length=100)
    api_key: str | None = Field(default=None, max_length=300)
    description: str = Field(default="", max_length=200)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    supports_vision: bool = False
    enabled: bool = True

    @field_validator(
        "api_key",
        "router_model",
        "planning_model",
        "coding_model",
        "critic_model",
        "test_model",
        mode="before",
    )
    @classmethod
    def normalize_optional_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class CustomProviderTestResponse(BaseModel):
    ok: bool
    provider: str
    model: str
    message: str
    raw_excerpt: str | None = None


class ManimScriptPrepareRequest(BaseModel):
    source: str = Field(min_length=1, max_length=80_000)
    scene_class_name: str = Field(
        default="GeneratedScene",
        min_length=1,
        max_length=80,
        pattern=r"^[A-Za-z_][A-Za-z0-9_]*$",
    )


class ManimScriptPrepareResponse(BaseModel):
    code: str
    scene_class_name: str
    diagnostics: list[str] = Field(default_factory=list)
    is_runnable: bool = True


class ManimScriptRenderRequest(ManimScriptPrepareRequest):
    require_real: bool = True
    narration_text: str | None = Field(default=None, max_length=4000)


class ManimScriptRenderResponse(ManimScriptPrepareResponse):
    request_id: str
    preview_video_url: str
    render_backend: str
