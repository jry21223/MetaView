from __future__ import annotations

import json
from collections import Counter
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.domain.models.playbook import PlaybookScript


class VisualProgressionIssue(BaseModel):
    code: str
    severity: Literal["warning", "error"]
    path: str
    message: str
    suggestion: str
    step_index: int | None = None


class VisualProgressionReport(BaseModel):
    status: Literal["clean", "warnings", "blocked"]
    issues: list[VisualProgressionIssue] = Field(default_factory=list)
    metrics: dict[str, float | int] = Field(default_factory=dict)


def validate_visual_progression(playbook: PlaybookScript) -> VisualProgressionReport:
    """Deterministic post-compile visual-state gate.

    This gate is intentionally renderer-independent and cheap enough for every
    Agent run. It detects the most common false-success pattern: many narrated
    steps that compile to the same visible state. Rendered-frame/VLM inspection
    can consume the same issue codes as an additional deployment stage.
    """

    issues: list[VisualProgressionIssue] = []
    signatures = [_snapshot_signature(step.snapshot) for step in playbook.steps]
    consecutive_identical = 0
    for index in range(1, len(signatures)):
        if signatures[index] != signatures[index - 1]:
            continue
        consecutive_identical += 1
        previous = playbook.steps[index - 1]
        current = playbook.steps[index]
        if previous.voiceover_text.strip() != current.voiceover_text.strip():
            issues.append(
                VisualProgressionIssue(
                    code="scene.progression_missing",
                    severity="error",
                    path=f"steps[{index}].snapshot",
                    step_index=index,
                    message=(
                        "Consecutive narrated steps compile to an identical visible snapshot."
                    ),
                    suggestion=(
                        "Patch the corresponding SceneSequenceBlueprint checkpoint so it "
                        "changes a semantic object, state field, or visible emphasis."
                    ),
                )
            )

    counts = Counter(signatures)
    max_repeat = max(counts.values(), default=0)
    repeated_ratio = max_repeat / len(signatures) if signatures else 0.0
    if len(signatures) >= 4 and repeated_ratio > 0.5:
        issues.append(
            VisualProgressionIssue(
                code="scene.repeated_snapshot_ratio",
                severity="error",
                path="steps",
                message=(
                    f"One visible state is reused by {max_repeat}/{len(signatures)} steps."
                ),
                suggestion=(
                    "Use checkpoint state deltas rather than copying one SceneBlueprint "
                    "snapshot across the lesson."
                ),
            )
        )

    sparse_steps = 0
    for index, step in enumerate(playbook.steps):
        payload_count = _visible_payload_count(
            step.snapshot.model_dump(mode="json", exclude_none=True)
        )
        if payload_count > 0:
            continue
        sparse_steps += 1
        issues.append(
            VisualProgressionIssue(
                code="visual.content_too_sparse",
                severity="error",
                path=f"steps[{index}].snapshot",
                step_index=index,
                message="The step has no countable renderer-visible object or formula.",
                suggestion="Compile at least one semantic visual object for this checkpoint.",
            )
        )

    transition_without_delta = 0
    for index, step in enumerate(playbook.steps[1:], start=1):
        hint = (step.animation_hint or "").lower()
        if hint in {"morph", "reveal", "compare", "focus", "draw", "slide", "scale"}:
            if signatures[index] == signatures[index - 1]:
                transition_without_delta += 1
                issues.append(
                    VisualProgressionIssue(
                        code="scene.narration_transition_missing",
                        severity="warning",
                        path=f"steps[{index}].animation_hint",
                        step_index=index,
                        message=(
                            f"Transition {hint!r} is declared but the "
                            "semantic snapshot does not change."
                        ),
                        suggestion="Remove the transition or add the missing semantic state delta.",
                    )
                )

    status: Literal["clean", "warnings", "blocked"]
    if any(issue.severity == "error" for issue in issues):
        status = "blocked"
    elif issues:
        status = "warnings"
    else:
        status = "clean"
    return VisualProgressionReport(
        status=status,
        issues=issues,
        metrics={
            "step_count": len(playbook.steps),
            "distinct_snapshot_count": len(counts),
            "consecutive_identical_count": consecutive_identical,
            "max_repeated_snapshot_ratio": round(repeated_ratio, 4),
            "sparse_step_count": sparse_steps,
            "transition_without_delta_count": transition_without_delta,
        },
    )


def _snapshot_signature(snapshot: Any) -> str:
    data = snapshot.model_dump(mode="json", exclude_none=True)
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _visible_payload_count(data: dict[str, Any]) -> int:
    count = 0
    for key in (
        "array_values",
        "nodes",
        "edges",
        "curves",
        "points",
        "segments",
        "regions",
        "objects",
        "vectors",
        "trajectory",
        "frames",
        "lines",
        "series",
        "iterations",
        "structures",
        "steps",
        "atoms",
        "bonds",
        "reactants",
        "products",
        "flows",
        "pressure_centers",
        "tracks",
    ):
        value = data.get(key)
        if isinstance(value, list):
            count += len(value)
    for key in ("formula_latex", "latex", "text", "caption"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            count += 1
    return count
