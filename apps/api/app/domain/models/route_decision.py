from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

RouteDestination = Literal[
    "deterministic_skill",
    "generic_cir",
    "agent",
    "unsupported",
]


class RouteDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    destination: RouteDestination
    domain: str | None = None
    skill_id: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str = ""
    matched_capability: str | None = None
    problem_spec: dict[str, Any] | None = None
    needs_refinement: bool = False
    unsupported_reason: str | None = None

    @model_validator(mode="after")
    def reject_router_answers(self) -> "RouteDecision":
        if self.problem_spec is not None:
            _reject_answer_fields(self.problem_spec, path="problem_spec")
        return self


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
