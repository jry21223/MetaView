from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


class TopicDomain(str, Enum):
    ALGORITHM = "algorithm"
    MATH = "math"
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


class SandboxStatus(str, Enum):
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"


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


class CirDocument(BaseModel):
    version: str = "0.1.0"
    title: str
    domain: TopicDomain
    summary: str
    steps: list[CirStep] = Field(default_factory=list)


class PipelineRequest(BaseModel):
    prompt: str = Field(min_length=5, max_length=1200)
    domain: TopicDomain | None = None
    provider: str | None = None
    router_provider: str | None = None
    generation_provider: str | None = None
    source_image: str | None = Field(default=None, max_length=3_500_000)
    source_image_name: str | None = Field(default=None, max_length=200)
    sandbox_mode: SandboxMode = SandboxMode.DRY_RUN
    persist_run: bool = True

    @model_validator(mode="after")
    def apply_provider_aliases(self) -> "PipelineRequest":
        generation_provider = self.generation_provider or self.provider
        self.generation_provider = generation_provider
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
    description: str
    configured: bool = True
    is_custom: bool = False
    supports_vision: bool = False
    base_url: str | None = None


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

    @model_validator(mode="after")
    def apply_provider_aliases(self) -> "RuntimeCatalog":
        default_generation_provider = (
            self.default_generation_provider or self.default_provider or ProviderName.MOCK.value
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
    diagnostics: list[AgentDiagnostic] = Field(default_factory=list)
    runtime: PipelineRuntime


class PipelineRunSummary(BaseModel):
    request_id: str
    created_at: str
    prompt: str
    title: str
    domain: TopicDomain
    provider: str | None = None
    router_provider: str | None = None
    generation_provider: str | None = None
    sandbox_status: SandboxStatus

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
    request: PipelineRequest
    response: PipelineResponse


class CustomProviderUpsertRequest(BaseModel):
    name: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{1,30}$")
    label: str = Field(min_length=2, max_length=40)
    base_url: str = Field(min_length=8, max_length=300)
    model: str = Field(min_length=1, max_length=100)
    api_key: str | None = Field(default=None, max_length=300)
    description: str = Field(default="", max_length=200)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    supports_vision: bool = False
    enabled: bool = True
