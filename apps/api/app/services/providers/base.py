from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.schemas import AgentTrace, ProviderDescriptor


@dataclass(frozen=True)
class PlanningHints:
    focus: str
    concepts: list[str]
    warnings: list[str]


@dataclass(frozen=True)
class CodingHints:
    target: str
    style_notes: list[str]


@dataclass(frozen=True)
class CritiqueHints:
    checks: list[str]
    warnings: list[str]


class ModelProvider(Protocol):
    descriptor: ProviderDescriptor

    def plan(self, prompt: str, domain: str) -> tuple[PlanningHints, AgentTrace]:
        ...

    def code(self, title: str, step_count: int) -> tuple[CodingHints, AgentTrace]:
        ...

    def critique(self, title: str, renderer_script: str) -> tuple[CritiqueHints, AgentTrace]:
        ...

