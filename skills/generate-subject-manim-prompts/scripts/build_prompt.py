#!/usr/bin/env python3
"""Inspect staged subject references for Manim prompt authoring."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


SUBJECT_FILES = {
    "algorithm": "algorithm.md",
    "math": "math.md",
    "code": "code.md",
    "physics": "physics.md",
    "chemistry": "chemistry.md",
    "biology": "biology.md",
    "geography": "geography.md",
}

TEMPLATE_SECTIONS = {
    "planner": "Concept Design",
    "coder": "Code Generation",
    "critic": "Review",
    "repair": "Repair",
}

REFERENCE_SECTIONS = {
    "common": "Common",
    "planner": "Planner",
    "coder": "Coder",
    "critic": "Critic",
    "repair": "Repair",
}


def reference_root() -> Path:
    return Path(__file__).resolve().parents[1] / "references"


def load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8").strip()


def extract_markdown_section(text: str, title: str) -> str:
    pattern = re.compile(
        rf"^## {re.escape(title)}\s*$\n(?P<body>.*?)(?=^## |\Z)",
        flags=re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(text)
    return match.group("body").strip() if match else ""


def load_subject_stage(subject: str, stage: str) -> dict[str, str]:
    body = load_text(reference_root() / SUBJECT_FILES[subject])
    return {
        "common": extract_markdown_section(body, REFERENCE_SECTIONS["common"]),
        stage: extract_markdown_section(body, REFERENCE_SECTIONS[stage]),
    }


def load_template_stage(stage: str) -> str:
    template_body = load_text(reference_root() / "prompt-templates.md")
    return extract_markdown_section(template_body, TEMPLATE_SECTIONS[stage])


def build_prompts(
    subject: str,
    topic: str,
    content: str,
    ui_theme: str,
) -> dict[str, object]:
    return {
        "subject": subject,
        "topic": topic,
        "content": content,
        "ui_theme": ui_theme,
        "how_to_use": [
            "planner 用于先产出分镜和风险，不直接写代码",
            "coder 只在拿到已确认的 plan 后生成 Manim 代码",
            "critic 只做审查，不返回修复代码",
            "repair 只做最小修复，不推翻原场景",
        ],
        "stages": {
            stage: {
                "subject_reference": load_subject_stage(subject, stage),
                "template_reference": load_template_stage(stage),
                "user_seed": {
                    "subject": subject,
                    "topic": topic,
                    "content": content,
                    "ui_theme": ui_theme,
                },
            }
            for stage in ("planner", "coder", "critic", "repair")
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect staged subject references for Manim prompt authoring.",
    )
    parser.add_argument(
        "--subject",
        required=True,
        choices=sorted(SUBJECT_FILES),
        help="Primary subject domain.",
    )
    parser.add_argument("--topic", required=True, help="Topic to animate.")
    parser.add_argument("--content", required=True, help="Teaching content or problem statement.")
    parser.add_argument(
        "--ui-theme",
        default="dark",
        choices=["dark", "light"],
        help="Target product theme that the scene should visually match.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    prompts = build_prompts(
        subject=args.subject,
        topic=args.topic,
        content=args.content,
        ui_theme=args.ui_theme,
    )
    print(json.dumps(prompts, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
