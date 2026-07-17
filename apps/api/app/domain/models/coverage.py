from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

CoverageMode = Literal[
    "specialized",
    "composable",
    "experimental",
    "unsupported",
]
CoverageFallbackPolicy = Literal[
    "use_skill",
    "compose",
    "limited_visual",
    "text_only",
    "reject",
]
NonBlankString = Annotated[str, Field(min_length=1)]


class CoverageDecision(BaseModel):
    """Canonical capability boundary resolved before content generation."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    mode: CoverageMode
    domain: NonBlankString | None
    confidence: float = Field(ge=0.0, le=1.0)
    matched_skill_ids: list[NonBlankString]
    available_tool_ids: list[NonBlankString]
    missing_capabilities: list[NonBlankString]
    fallback_policy: CoverageFallbackPolicy
    reason: NonBlankString

    @model_validator(mode="after")
    def validate_capability_boundary(self) -> "CoverageDecision":
        for field_name in (
            "matched_skill_ids",
            "available_tool_ids",
            "missing_capabilities",
        ):
            values = getattr(self, field_name)
            if len(values) != len(set(values)):
                raise ValueError(f"{field_name} values must be unique")

        if self.mode == "specialized":
            if self.fallback_policy != "use_skill":
                raise ValueError("specialized coverage must use the use_skill policy")
            if not self.matched_skill_ids:
                raise ValueError("specialized coverage requires a matched SkillPack")
            if self.missing_capabilities:
                raise ValueError("specialized coverage cannot have missing capabilities")
        elif self.mode == "composable":
            if self.fallback_policy != "compose":
                raise ValueError("composable coverage must use the compose policy")
            if not self.available_tool_ids:
                raise ValueError("composable coverage requires available tools")
            if self.missing_capabilities:
                raise ValueError("composable coverage cannot have missing capabilities")
        elif self.mode == "experimental":
            if self.fallback_policy not in {"limited_visual", "text_only"}:
                raise ValueError(
                    "experimental coverage must use limited_visual or text_only"
                )
            if not self.missing_capabilities:
                raise ValueError("experimental coverage must name missing capabilities")
        else:
            if self.fallback_policy != "reject":
                raise ValueError("unsupported coverage must use the reject policy")
            if not self.missing_capabilities:
                raise ValueError("unsupported coverage must name missing capabilities")
        return self


__all__ = ["CoverageDecision", "CoverageFallbackPolicy", "CoverageMode"]
