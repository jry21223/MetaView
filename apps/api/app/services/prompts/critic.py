from __future__ import annotations

from app.schemas import TopicDomain
from app.services.prompts.code_domain import render_code_prompt_sections
from app.services.prompts.domain_guidance import guidance_for
from app.services.prompts.reference_materials import render_reference_sections
from app.services.prompts.sections import join_sections, render_section
from app.services.prompts.shared_rules import critic_runtime_rules


def build_critic_system_prompt(domain: TopicDomain | str) -> str:
    domain_value = TopicDomain(domain) if isinstance(domain, str) else domain
    return join_sections(
        critic_runtime_rules(),
        render_section("Domain Guidance", guidance_for(domain_value)),
        render_reference_sections(domain_value, "critic"),
        render_code_prompt_sections("critic", None)
        if domain_value == TopicDomain.CODE
        else "",
    )


def build_critic_user_prompt(*, title: str, renderer_script: str) -> str:
    return f"title={title}\nrenderer_script={renderer_script}"
