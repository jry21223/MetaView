from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.schemas import AgentTrace, CirDocument, ProviderDescriptor, TopicDomain


@dataclass(frozen=True)
class PlanningHints:
    focus: str
    concepts: list[str]
    warnings: list[str]


@dataclass(frozen=True)
class CodingHints:
    target: str
    style_notes: list[str]
    renderer_script: str | None = None


@dataclass(frozen=True)
class CritiqueHints:
    checks: list[str]
    warnings: list[str]
    blocking_issues: list[str]


class ModelProvider(Protocol):
    descriptor: ProviderDescriptor

    def route(
        self,
        prompt: str,
        source_image: str | None = None,
        source_code: str | None = None,
    ) -> tuple[TopicDomain, AgentTrace]:
        ...

    def plan(
        self,
        prompt: str,
        domain: str,
        skill_brief: str,
        source_image: str | None = None,
        source_code: str | None = None,
        source_code_language: str | None = None,
        ui_theme: str | None = None,
    ) -> tuple[PlanningHints, AgentTrace]:
        ...

    def code(self, cir: CirDocument, ui_theme: str | None = None) -> tuple[CodingHints, AgentTrace]:
        ...

    def critique(
        self,
        title: str,
        renderer_script: str,
        domain: TopicDomain,
        ui_theme: str | None = None,
    ) -> tuple[CritiqueHints, AgentTrace]:
        ...

    def repair_code(
        self,
        cir: CirDocument,
        renderer_script: str,
        issues: list[str],
        ui_theme: str | None = None,
    ) -> tuple[CodingHints, AgentTrace]:
        ...
