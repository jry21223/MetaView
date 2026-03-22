from __future__ import annotations

from app.schemas import TopicDomain
from app.services.prompts.code_domain import render_code_prompt_sections
from app.services.prompts.domain_guidance import guidance_for
from app.services.prompts.reference_materials import render_reference_sections
from app.services.prompts.sections import join_sections, render_section
from app.services.prompts.shared_rules import critic_runtime_rules, shared_visual_contract


def build_critic_system_prompt(domain: TopicDomain | str, *, ui_theme: str | None = None) -> str:
    domain_value = TopicDomain(domain) if isinstance(domain, str) else domain
    return join_sections(
        critic_runtime_rules(),
        shared_visual_contract(ui_theme),
        render_section("Domain Guidance", guidance_for(domain_value)),
        render_reference_sections(domain_value, "critic"),
        render_code_prompt_sections("critic", None)
        if domain_value == TopicDomain.CODE
        else "",
    )


def build_critic_user_prompt(
    *,
    title: str,
    renderer_script: str,
    ui_theme: str | None = None,
) -> str:
    lines = [f"title={title}"]
    if ui_theme:
        lines.append(f"ui_theme={ui_theme}")
    lines.append(f"renderer_script={renderer_script}")
    return "\n".join(lines)
