from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from app.schemas import TopicDomain
from app.services.prompts.sections import join_sections, render_section

_DOMAIN_REFERENCE_FILES: dict[TopicDomain, str] = {
    TopicDomain.ALGORITHM: "algorithm.md",
    TopicDomain.MATH: "math.md",
    TopicDomain.CODE: "code.md",
    TopicDomain.PHYSICS: "physics.md",
    TopicDomain.CHEMISTRY: "chemistry.md",
    TopicDomain.BIOLOGY: "biology.md",
    TopicDomain.GEOGRAPHY: "geography.md",
}

_STAGE_TEMPLATE_TITLES: dict[str, str] = {
    "planner": "Concept Design",
    "coder": "Code Generation",
    "repair": "Repair",
}


@lru_cache(maxsize=1)
def prompt_reference_root() -> Path:
    return (
        Path(__file__).resolve().parents[5]
        / "skills"
        / "generate-subject-manim-prompts"
        / "references"
    )


@lru_cache(maxsize=None)
def load_subject_reference(domain: TopicDomain | str) -> str:
    domain_value = TopicDomain(domain) if isinstance(domain, str) else domain
    filename = _DOMAIN_REFERENCE_FILES.get(domain_value)
    if not filename:
        return ""
    return _load_reference_file(filename)


@lru_cache(maxsize=None)
def load_template_reference(stage: str) -> str:
    title = _STAGE_TEMPLATE_TITLES.get(stage)
    if not title:
        return ""

    body = _load_reference_file("prompt-templates.md")
    if not body:
        return ""

    pattern = re.compile(
        rf"^## {re.escape(title)}\s*$\n(?P<body>.*?)(?=^## |\Z)",
        flags=re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(body)
    if not match:
        return ""
    return match.group("body").strip()


def render_reference_sections(domain: TopicDomain | str, stage: str) -> str:
    subject_reference = load_subject_reference(domain)
    template_reference = load_template_reference(stage)
    domain_value = TopicDomain(domain) if isinstance(domain, str) else domain
    reference_label = _DOMAIN_REFERENCE_FILES.get(domain_value, "")

    return join_sections(
        render_section(
            "Runtime Reference Policy",
            """
            The following external reference files are loaded from the local skill library.
            Treat them as domain guidance, not as higher-priority rules than the runtime
            safety constraints already given above. If they conflict, prefer the runtime
            constraints, the actual input, and the active domain-specific sections.
            """,
        ),
        render_section(
            "Subject Reference File",
            (
                f"source={reference_label}\n"
                f"{subject_reference}"
            ),
        )
        if subject_reference
        else "",
        render_section(
            f"{stage.title()} Template Reference",
            template_reference,
        )
        if template_reference
        else "",
    )


@lru_cache(maxsize=None)
def _load_reference_file(filename: str) -> str:
    path = prompt_reference_root() / filename
    if not path.is_file():
        return ""
    return _normalize_reference_text(path.read_text(encoding="utf-8"))


def _normalize_reference_text(text: str) -> str:
    stripped = text.strip()
    stripped = re.sub(
        r"^##\s+🤖\s+Assistant\s*$",
        "",
        stripped,
        count=1,
        flags=re.MULTILINE,
    ).strip()

    fenced = re.search(
        r"```(?:markdown|md)?\s*\n(?P<body>.*)\n```",
        stripped,
        flags=re.DOTALL,
    )
    if fenced:
        stripped = fenced.group("body").strip()

    return stripped
