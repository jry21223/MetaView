from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field


class TopicDomain(str, Enum):
    ALGORITHM = "algorithm"
    MATH = "math"


class ProviderName(str, Enum):
    MOCK = "mock"
    OPENAI = "openai"


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
    domain: TopicDomain = TopicDomain.ALGORITHM
    provider: ProviderName | None = None
    sandbox_mode: SandboxMode = SandboxMode.DRY_RUN
    persist_run: bool = True


class AgentDiagnostic(BaseModel):
    agent: str
    message: str


class ProviderDescriptor(BaseModel):
    name: ProviderName
    model: str
    description: str
    configured: bool = True


class AgentTrace(BaseModel):
    agent: str
    provider: ProviderName
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
    provider: ProviderDescriptor
    sandbox: SandboxReport
    validation: CirValidationReport
    agent_traces: list[AgentTrace] = Field(default_factory=list)
    repair_count: int = 0
    repair_actions: list[str] = Field(default_factory=list)


class RuntimeCatalog(BaseModel):
    default_provider: ProviderName
    sandbox_engine: str
    providers: list[ProviderDescriptor] = Field(default_factory=list)
    sandbox_modes: list[SandboxMode] = Field(default_factory=list)


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
    provider: ProviderName
    sandbox_status: SandboxStatus


class PipelineRunDetail(BaseModel):
    created_at: str
    request: PipelineRequest
    response: PipelineResponse
