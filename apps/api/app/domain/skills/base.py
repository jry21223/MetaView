from __future__ import annotations

from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field, model_validator

from app.domain.models.lesson_plan import LessonPlan

SkillExecutionMode = Literal[
    "deterministic",
    "llm_assisted",
    "agent_assisted",
]


class SkillCapability(BaseModel):
    capability_id: str
    description: str
    supported: bool = True
    examples: list[str] = Field(default_factory=list)
    output_schema: str | None = None
    notes: list[str] = Field(default_factory=list)


class SkillManifest(BaseModel):
    skill_id: str
    domain: str
    name: str
    description: str
    execution_mode: SkillExecutionMode
    capabilities: list[SkillCapability]
    unsupported_notes: list[str] = Field(default_factory=list)


class SkillRouteInput(BaseModel):
    prompt: str
    source_code: str | None = None
    language: str | None = None


class SkillRouteMatch(BaseModel):
    skill_id: str
    domain: str
    confidence: float = Field(ge=0.0, le=1.0)
    capability_id: str | None = None
    reason: str = ""
    problem_spec: dict[str, Any] | None = None
    needs_refinement: bool = False

    @model_validator(mode="after")
    def reject_router_answers(self) -> "SkillRouteMatch":
        if self.problem_spec is not None:
            _reject_answer_fields(self.problem_spec, path="problem_spec")
        return self


class SkillExecutionContext(BaseModel):
    run_id: str
    prompt: str
    route_match: SkillRouteMatch | None = None
    lesson_plan: LessonPlan | None = None


class SkillExecutionResult(BaseModel):
    handled: bool
    playbook_json: str | None = None
    lesson_plan: LessonPlan | None = None
    review_actions: list[str] = Field(default_factory=list)
    fallback_reason: str | None = None


class SkillPack(Protocol):
    manifest: SkillManifest

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        ...

    def validate_problem_spec(self, data: dict[str, Any]) -> BaseModel | None:
        ...

    async def execute(
        self,
        context: SkillExecutionContext,
        problem_spec: BaseModel | None,
    ) -> SkillExecutionResult:
        ...


_ANSWER_FIELD_NAMES = frozenset({
    "answer",
    "final_answer",
    "answer_latex",
    "answer_numeric",
    "solution",
})


def _reject_answer_fields(value: Any, *, path: str) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = str(key).strip().lower()
            if normalized in _ANSWER_FIELD_NAMES:
                raise ValueError(f"Router output must not include final answer field: {path}.{key}")
            _reject_answer_fields(child, path=f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_answer_fields(child, path=f"{path}[{index}]")
