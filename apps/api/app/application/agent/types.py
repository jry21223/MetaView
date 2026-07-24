from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.domain.models.coverage import CoverageDecision
from app.domain.models.lesson_plan import LessonPlan


class AgentConstraints(BaseModel):
    # The API owns retry/repair. A sidecar request is exactly one model attempt.
    max_self_repair_attempts: int = Field(default=0, ge=0, le=2)
    max_reviewer_repair_attempts: int = Field(default=1, ge=0, le=2)
    legacy_single_enabled: bool = True
    executable_tools_available: bool = True
    strict_tool_inventory: bool = True
    repair_strategy: Literal["path_scoped_patch"] = "path_scoped_patch"
    max_tool_events: int = Field(default=512, ge=32, le=2048)


class ToolManifest(BaseModel):
    name: str
    description: str
    args_schema: dict[str, Any] = Field(default_factory=dict)
    domain: str
    deterministic: bool = True


class ToolEvent(BaseModel):
    sequence: int
    timestamp: str
    tool: str
    attempt_id: str
    ok: bool
    duration_ms: int = 0
    args: Any = None
    error: str | None = None
    state_before: str | None = None
    state_after: str | None = None


class RuntimeEvent(BaseModel):
    sequence: int
    timestamp: str
    event: str
    detail: dict[str, Any] | None = None


class ToolExecutionResult(BaseModel):
    tool: str
    ok: bool
    result: dict[str, Any] | list[Any] | str | int | float | bool | None = None
    error: dict[str, Any] | None = None


class AgentRequest(BaseModel):
    run_id: str
    prompt: str
    source_code: str | None = None
    language: str | None = None
    route_decision: dict[str, Any] = Field(default_factory=dict)
    coverage_decision: CoverageDecision | None = None
    lesson_plan: LessonPlan | None = None
    provider_config: dict[str, Any] | None = None
    playbook_schema: dict[str, Any] = Field(default_factory=dict)
    constraints: AgentConstraints = Field(default_factory=AgentConstraints)
    available_tools: list[ToolManifest] = Field(default_factory=list)


class AgentResult(BaseModel):
    playbook: dict[str, Any]
    provider: str
    tool_events: list[dict[str, Any]] = Field(default_factory=list)
    runtime_events: list[dict[str, Any]] = Field(default_factory=list)
    review: dict[str, Any] | None = None
    artifacts: dict[str, Any] = Field(default_factory=dict)
