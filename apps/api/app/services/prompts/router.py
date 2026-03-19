from __future__ import annotations


def build_router_system_prompt(enabled_domains: list[str]) -> str:
    joined = ", ".join(enabled_domains)
    return (
        "You are a domain router for an educational visualization platform. "
        "Return strict JSON with keys: domain and reason. "
        f"Allowed domains: {joined}. "
        "If source code is present, prioritize the code domain "
        "when the task is to explain or animate code behavior."
    )


def build_router_user_prompt(
    *,
    prompt: str,
    source_code: str | None = None,
) -> str:
    lines = [f"prompt={prompt}"]
    if source_code:
        lines.append(f"source_code_present=yes\nsource_code_excerpt={source_code[:1200]}")
    return "\n".join(lines)
