from __future__ import annotations

from app.schemas import TopicDomain
from app.services.prompts.code_domain import (
    build_code_prompt_profile_from_source,
    describe_code_prompt_profile,
    render_code_prompt_sections,
)
from app.services.prompts.domain_guidance import guidance_for
from app.services.prompts.reference_materials import render_reference_sections
from app.services.prompts.sections import join_sections, render_section
from app.services.prompts.shared_rules import planner_runtime_rules, shared_visual_contract


def build_planner_system_prompt(
    domain: TopicDomain | str,
    *,
    source_code: str | None = None,
    source_code_language: str | None = None,
    ui_theme: str | None = None,
) -> str:
    domain_value = TopicDomain(domain) if isinstance(domain, str) else domain
    profile = (
        build_code_prompt_profile_from_source(source_code, source_code_language)
        if domain_value == TopicDomain.CODE
        else None
    )
    return join_sections(
        planner_runtime_rules(),
        shared_visual_contract(ui_theme),
        render_section("Domain Guidance", guidance_for(domain_value)),
        render_reference_sections(domain_value, "planner"),
        render_code_prompt_sections("planner", profile)
        if domain_value == TopicDomain.CODE
        else "",
    )


def build_planner_user_prompt(
    *,
    prompt: str,
    domain: str,
    skill_brief: str,
    source_code: str | None = None,
    source_code_language: str | None = None,
    ui_theme: str | None = None,
) -> str:
    lines = [f"domain={domain}", f"prompt={prompt}", skill_brief]
    if ui_theme:
        lines.append(f"ui_theme={ui_theme}")
    if source_code:
        profile = build_code_prompt_profile_from_source(source_code, source_code_language)
        lines.append(f"source_code_language={source_code_language or 'unknown'}")
        lines.append(describe_code_prompt_profile(profile))
        lines.append(f"source_code={source_code}")
    return "\n".join(lines)
