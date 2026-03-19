from __future__ import annotations

from textwrap import dedent


def normalized_block(text: str) -> str:
    return dedent(text).strip()


def render_section(title: str, body: str) -> str:
    return f"## {title}\n{normalized_block(body)}"


def join_sections(*sections: str) -> str:
    return "\n\n".join(section for section in sections if section.strip())
