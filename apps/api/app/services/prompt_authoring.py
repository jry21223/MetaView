from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from textwrap import dedent
from typing import Final

from app.schemas import TopicDomain
from app.services.providers.openai import OpenAICompatibleProvider

REQUIRED_REFERENCE_SECTIONS: Final[tuple[str, ...]] = (
    "Common",
    "Planner",
    "Coder",
    "Critic",
    "Repair",
)


@dataclass(frozen=True)
class SubjectReferenceSeed:
    title: str
    core_objects: str
    key_relations: str
    non_negotiable_truth: str
    critical_transitions: str
    domain_logic_error: str


SUBJECT_REFERENCE_SEEDS: Final[dict[TopicDomain, SubjectReferenceSeed]] = {
    TopicDomain.ALGORITHM: SubjectReferenceSeed(
        title="Algorithm Prompt Guidance",
        core_objects="array cells, pointers, queue/stack, visited set, DP table",
        key_relations="indices, invariants, loop condition, state transition",
        non_negotiable_truth="exact control flow and update order",
        critical_transitions="compare, swap, overwrite, boundary move, push/pop, return",
        domain_logic_error="visual order differs from code order",
    ),
    TopicDomain.MATH: SubjectReferenceSeed(
        title="Math Prompt Guidance",
        core_objects="symbols, axes, geometric entities, shaded regions",
        key_relations="notation definitions, variable dependencies, equation continuity",
        non_negotiable_truth="symbolic correctness and consistent notation",
        critical_transitions="formula transform, graph update, geometric dependency change",
        domain_logic_error="transformed formula not equivalent to previous one",
    ),
    TopicDomain.CODE: SubjectReferenceSeed(
        title="Code Prompt Guidance",
        core_objects="source lines, variables, data structures, call stack",
        key_relations="control flow, mutation order, termination path",
        non_negotiable_truth="source code is ground truth",
        critical_transitions="highlighted line change, variable mutation, recursive call/return",
        domain_logic_error="animation invents behavior not present in code",
    ),
    TopicDomain.PHYSICS: SubjectReferenceSeed(
        title="Physics Prompt Guidance",
        core_objects="bodies, forces, vectors, reference frame, known quantities",
        key_relations="constraints, units, direction, governing laws",
        non_negotiable_truth="physical model before motion",
        critical_transitions="force decomposition, motion update, energy/current/field change",
        domain_logic_error="direction, sign, or unit inconsistency",
    ),
    TopicDomain.CHEMISTRY: SubjectReferenceSeed(
        title="Chemistry Prompt Guidance",
        core_objects="atoms, bonds, charges, phases, reagents/products",
        key_relations="bond changes, stoichiometry, electron/charge balance",
        non_negotiable_truth="species identity and bond logic",
        critical_transitions="bond break/form, intermediate formation, rearrangement",
        domain_logic_error="impossible valence or charge inconsistency",
    ),
    TopicDomain.BIOLOGY: SubjectReferenceSeed(
        title="Biology Prompt Guidance",
        core_objects="organelles, cells, tissues, molecules, populations",
        key_relations="scale, stage order, causal regulation",
        non_negotiable_truth="biological level and process order",
        critical_transitions="stage switch, signal flow, division/expression/metabolism",
        domain_logic_error="mixing scales without explanation",
    ),
    TopicDomain.GEOGRAPHY: SubjectReferenceSeed(
        title="Geography Prompt Guidance",
        core_objects="map, regions, arrows, climate bands, plates, flows",
        key_relations="orientation, legend, time anchor, regional contrast",
        non_negotiable_truth="fixed map frame before change over time",
        critical_transitions=(
            "migration, circulation, tectonic movement, "
            "rainfall/temperature shift"
        ),
        domain_logic_error="map direction or regional labeling inconsistency",
    ),
}


@dataclass(frozen=True)
class GeneratedReferenceArtifact:
    markdown: str
    raw_output: str
    output_path: Path
    wrote_file: bool


def build_reference_authoring_system_prompt() -> str:
    return dedent(
        """
        You are a senior prompt engineer for a staged educational animation runtime.

        Your job is to write one complete markdown reference file for a single subject.
        This file is consumed by a backend that separately assembles planner, coder, critic,
        and repair prompts for Python Manim generation.

        Return only markdown.
        Do not wrap the file in code fences.
        Do not add explanations before or after the file.

        The file must use exactly this top-level structure:
        # <Subject> Prompt Guidance

        ## Common
        - ...

        ## Planner
        - ...

        ## Coder
        - ...

        ## Critic
        - ...

        ## Repair
        - ...

        Writing rules:
        - Keep each section to 4-8 bullet points.
        - Keep bullets short, specific, and operational.
        - `Common` contains domain truths that must not be violated.
        - `Planner` contains scene decomposition, example choice, and risk discovery rules.
        - `Coder` contains layout, object identity, pacing, and synchronization rules.
        - `Critic` contains failure checks and regression checks.
        - `Repair` contains minimum-change repair strategy.
        - Remove redundant generic advice that belongs in shared runtime rules.
        - Prefer domain truth over style language.
        - Do not mention JSON keys, API protocols, provider names, or chat formatting.
        """
    ).strip()


def build_reference_authoring_runtime_context() -> str:
    return dedent(
        """
        Runtime context you must respect:
        - The production pipeline is staged: router -> planner -> coder -> critic -> repair.
        - Subject reference files are loaded by stage and only inject `## Common`
          plus the active stage section.
        - Global runtime rules already cover output contracts, Simplified Chinese explanatory text,
          no text/object overlap, and theme-aligned backgrounds.
        - Do not duplicate generic JSON-output requirements, markdown-fence rules,
          or broad Manim boilerplate.
        - The goal of this file is subject truth and stage-specific guidance,
          not provider protocol instructions.
        """
    ).strip()


def build_reference_authoring_user_prompt(
    domain: TopicDomain,
    *,
    current_reference: str,
    notes: str | None = None,
) -> str:
    seed = SUBJECT_REFERENCE_SEEDS[domain]
    extra_notes = notes.strip() if notes and notes.strip() else "None"
    baseline = current_reference.strip() or "(empty)"
    return "\n".join(
        [
            f"Subject: {domain.value}",
            f"File title: {seed.title}",
            "",
            "Domain seed:",
            f"- Core objects: {seed.core_objects}",
            f"- Key relations: {seed.key_relations}",
            f"- Non-negotiable domain truth: {seed.non_negotiable_truth}",
            f"- Critical transitions: {seed.critical_transitions}",
            f"- Domain logic error to prevent: {seed.domain_logic_error}",
            "",
            build_reference_authoring_runtime_context(),
            "",
            "Additional authoring notes:",
            extra_notes,
            "",
            "Current reference file to refine or replace:",
            baseline,
            "",
            "Produce a stronger replacement file for this subject.",
            "Focus on subject fidelity and stage-specific usefulness.",
            "Keep it concise.",
        ]
    ).strip()


def strip_markdown_code_fences(text: str) -> str:
    stripped = dedent(text).strip()
    fenced = re.search(r"```(?:markdown|md)?\s*\n(?P<body>.*)\n```", stripped, re.DOTALL)
    if fenced:
        return fenced.group("body").strip()
    return stripped


def extract_reference_markdown_section(text: str, title: str) -> str:
    pattern = re.compile(
        rf"^## {re.escape(title)}\s*$\n(?P<body>.*?)(?=^## |\Z)",
        flags=re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        return ""
    return match.group("body").strip()


def validate_reference_markdown(domain: TopicDomain, markdown: str) -> str:
    normalized = strip_markdown_code_fences(markdown).strip()
    expected_title = f"# {SUBJECT_REFERENCE_SEEDS[domain].title}"
    if not normalized.startswith(expected_title):
        raise ValueError(f"输出缺少正确标题，预期以 `{expected_title}` 开头。")

    headings = re.findall(r"^##\s+(.+?)\s*$", normalized, flags=re.MULTILINE)
    if tuple(headings) != REQUIRED_REFERENCE_SECTIONS:
        raise ValueError(
            "输出的二级标题不符合要求。"
            f" 当前为 {headings}，预期为 {list(REQUIRED_REFERENCE_SECTIONS)}。"
        )

    for section in REQUIRED_REFERENCE_SECTIONS:
        body = extract_reference_markdown_section(normalized, section)
        bullets = [line for line in body.splitlines() if line.strip().startswith("- ")]
        if len(bullets) < 4:
            raise ValueError(f"`## {section}` 至少需要 4 条 bullet。")
    return normalized


def generate_reference_markdown(
    provider: OpenAICompatibleProvider,
    *,
    domain: TopicDomain,
    current_reference: str,
    notes: str | None = None,
) -> tuple[str, str]:
    content, raw_output = provider.complete_text(
        stage="planning",
        system_prompt=build_reference_authoring_system_prompt(),
        user_prompt=build_reference_authoring_user_prompt(
            domain,
            current_reference=current_reference,
            notes=notes,
        ),
    )
    return validate_reference_markdown(domain, content), raw_output


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def references_root() -> Path:
    return repo_root() / "skills" / "generate-subject-manim-prompts" / "references"


def reference_output_path(domain: TopicDomain) -> Path:
    return references_root() / f"{domain.value}.md"


def load_current_reference(domain: TopicDomain) -> str:
    output_path = reference_output_path(domain)
    if not output_path.is_file():
        return ""
    return output_path.read_text(encoding="utf-8").strip()


def write_reference_markdown(domain: TopicDomain, markdown: str) -> Path:
    output_path = reference_output_path(domain)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(f"{markdown.rstrip()}\n", encoding="utf-8")
    return output_path


def generate_reference_artifact(
    provider: OpenAICompatibleProvider,
    *,
    domain: TopicDomain,
    notes: str | None = None,
    write: bool = False,
) -> GeneratedReferenceArtifact:
    markdown, raw_output = generate_reference_markdown(
        provider,
        domain=domain,
        current_reference=load_current_reference(domain),
        notes=notes,
    )
    output_path = reference_output_path(domain)
    if write:
        output_path = write_reference_markdown(domain, markdown)
    return GeneratedReferenceArtifact(
        markdown=markdown,
        raw_output=raw_output,
        output_path=output_path,
        wrote_file=write,
    )
