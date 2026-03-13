from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field


class TopicDomain(str, Enum):
    ALGORITHM = "algorithm"
    MATH = "math"


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


class AgentDiagnostic(BaseModel):
    agent: str
    message: str


class PipelineResponse(BaseModel):
    request_id: str = Field(default_factory=lambda: str(uuid4()))
    cir: CirDocument
    renderer_script: str
    diagnostics: list[AgentDiagnostic] = Field(default_factory=list)

