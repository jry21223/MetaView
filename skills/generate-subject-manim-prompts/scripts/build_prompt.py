#!/usr/bin/env python3
"""Build subject-specific prompt bundles for Python Manim generation."""

from __future__ import annotations

import argparse
import json
import textwrap


SUBJECT_GUIDANCE = {
    "math": (
        "Separate concept design from code, preserve MathTex continuity, "
        "define notation and diagrams before transformations, and pace the "
        "scene like a lesson rather than a demo reel."
    ),
    "algorithm": (
        "Define state, invariants, and transition events before code. Keep "
        "logical state and visual state synchronized after every update."
    ),
    "physics": (
        "State the physical model, units, and assumptions before animation. "
        "Keep vectors, equations, and motion consistent with the model."
    ),
    "chemistry": (
        "Define species, representation style, and reaction conditions first. "
        "Keep atom identity, bond changes, and labels consistent."
    ),
    "biology": (
        "Make biological scale and stage order explicit. Prefer stepwise "
        "process explanation over dense all-at-once diagrams."
    ),
    "geography": (
        "Establish map scope, scale, legend, and time markers first. Reveal "
        "spatial patterns one at a time with stable encoding."
    ),
}


def build_prompts(
    subject: str,
    topic: str,
    goal: str,
    audience: str,
    style: str,
    runtime_seconds: int,
) -> dict[str, object]:
    guidance = SUBJECT_GUIDANCE[subject]

    concept_system = (
        "You are a subject-specialized animation planner. Design a teaching-first "
        "Manim scene plan before any code is written. Keep the plan executable, "
        "visually concrete, and aligned with the target audience."
    )
    concept_user = textwrap.dedent(
        f"""
        Topic: {topic}
        Goal: {goal}
        Audience: {audience}
        Target runtime: {runtime_seconds} seconds
        Style: {style}

        Subject constraints:
        {guidance}

        Return:
        1. Learning objective
        2. Visual storyline in 4-8 beats
        3. Object list with labels, formulas or state variables, colors, and layout
        4. Timing notes per beat
        5. Risks that could make the final Manim code invalid or visually confusing
        """
    ).strip()

    code_system = (
        "You are a Python Manim CE engineer. Write executable code from an "
        "approved animation plan. Output exactly one Python code block and "
        "nothing else."
    )
    code_user = textwrap.dedent(
        f"""
        Implement the approved plan below as one Manim scene.

        Topic: {topic}
        Goal: {goal}
        Audience: {audience}
        Style: {style}

        Approved plan:
        [PASTE_APPROVED_PLAN_HERE]

        Subject constraints:
        {guidance}

        Constraints:
        - Use from manim import *
        - Use standard Manim CE classes unless helpers are explicitly supplied
        - No placeholder comments, pseudo-code, or missing variables
        - Keep coordinates, colors, labels, durations, and data concrete
        - Favor reliability and clarity over flashy but fragile effects
        """
    ).strip()

    repair_system = (
        "You are repairing an existing Python Manim CE script. Keep working "
        "parts intact and make the smallest change set that restores correctness "
        "and execution."
    )
    repair_user = textwrap.dedent(
        f"""
        Fix the following Python Manim scene.

        Topic: {topic}
        Goal: {goal}
        Intended audience: {audience}
        Subject constraints:
        {guidance}

        Original intent:
        [PASTE_INTENT_OR_STORYBOARD_HERE]

        Current code:
        [PASTE_CODE_HERE]

        Observed error or visual mismatch:
        [PASTE_ERROR_LOG_OR_ISSUE_HERE]

        Requirements:
        - Explain the root cause briefly
        - Return one corrected Python code block
        - Preserve scene structure unless it directly causes the failure
        """
    ).strip()

    return {
        "subject": subject,
        "topic": topic,
        "goal": goal,
        "concept_design": {
            "system": concept_system,
            "user": concept_user,
        },
        "code_generation": {
            "system": code_system,
            "user": code_user,
        },
        "repair": {
            "system": repair_system,
            "user": repair_user,
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build subject-specific prompt bundles for Python Manim.",
    )
    parser.add_argument(
        "--subject",
        required=True,
        choices=sorted(SUBJECT_GUIDANCE),
        help="Primary subject domain.",
    )
    parser.add_argument("--topic", required=True, help="Topic to animate.")
    parser.add_argument("--goal", required=True, help="Main teaching goal.")
    parser.add_argument(
        "--audience",
        default="general learners",
        help="Target audience or grade level.",
    )
    parser.add_argument(
        "--style",
        default="clean educational animation",
        help="Desired visual or teaching style.",
    )
    parser.add_argument(
        "--runtime-seconds",
        type=int,
        default=45,
        help="Target runtime for the scene.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    prompts = build_prompts(
        subject=args.subject,
        topic=args.topic,
        goal=args.goal,
        audience=args.audience,
        style=args.style,
        runtime_seconds=args.runtime_seconds,
    )
    print(json.dumps(prompts, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
