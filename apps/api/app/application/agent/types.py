from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.domain.models.coverage import CoverageDecision
from app.domain.models.lesson_plan import LessonPlan


class AgentConstraints(BaseModel):
    max_self_repair_attempts: int = 2
    max_reviewer_repair_attempts: int = 1
    legacy_single_enabled: bool = True
    executable_tools_available: bool = True


class ToolManifest(BaseModel):
    name: str
    description: str
    args_schema: dict[str, Any] = Field(default_factory=dict)
    domain: str
    deterministic: bool = True


class ToolEvent(BaseModel):
    tool: str
    ok: bool
    detail: dict[str, Any] | None = None


class RuntimeEvent(BaseModel):
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
