from __future__ import annotations

from app.schemas import TopicDomain
from app.services.prompts.code_domain import (
    build_code_prompt_profile_from_cir,
    describe_code_prompt_profile,
    render_code_prompt_sections,
)
from app.services.prompts.domain_guidance import guidance_for
from app.services.prompts.reference_materials import render_reference_sections
from app.services.prompts.sections import join_sections, render_section
from app.services.prompts.shared_rules import coder_runtime_rules, shared_visual_contract


def build_coder_system_prompt(
    domain: TopicDomain | str,
    *,
    title: str | None = None,
    summary: str | None = None,
    cir_json: str | None = None,
    ui_theme: str | None = None,
) -> str:
    domain_value = TopicDomain(domain) if isinstance(domain, str) else domain
    profile = (
        build_code_prompt_profile_from_cir(
            title=title,
            summary=summary,
            cir_json=cir_json,
        )
        if domain_value == TopicDomain.CODE
        else None
    )
    return join_sections(
        coder_runtime_rules(),
        shared_visual_contract(ui_theme),
        render_section("Domain Guidance", guidance_for(domain_value)),
        render_reference_sections(domain_value, "coder"),
        render_code_prompt_sections("coder", profile)
        if domain_value == TopicDomain.CODE
        else "",
    )


def build_coder_user_prompt(
    *,
    title: str,
    domain: str,
    summary: str,
    cir_json: str,
    ui_theme: str | None = None,
) -> str:
    lines = [
        f"title={title}",
        f"domain={domain}",
        f"summary={summary}",
    ]
    if ui_theme:
        lines.append(f"ui_theme={ui_theme}")
    if domain == TopicDomain.CODE.value:
        lines.append(
            describe_code_prompt_profile(
                build_code_prompt_profile_from_cir(
                    title=title,
                    summary=summary,
                    cir_json=cir_json,
                )
            )
        )
    lines.append(f"cir={cir_json}")
    return "\n".join(lines)
