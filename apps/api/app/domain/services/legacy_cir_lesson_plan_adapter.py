from __future__ import annotations

import json
import re
from typing import Any

from app.domain.models.cir import CirDocument, CirStep
from app.domain.models.lesson_plan import LessonPlan, SceneIntent
from app.domain.models.topic import TopicDomain, VisualKind

_VISUAL_ROLES: dict[VisualKind, str] = {
    VisualKind.ARRAY: "array_state",
    VisualKind.FLOW: "process_flow",
    VisualKind.FORMULA: "formula",
    VisualKind.FUNCTION: "function_curve",
    VisualKind.SCENE: "coordinate_scene",
    VisualKind.GRAPH: "graph_structure",
    VisualKind.TEXT: "concept_summary",
    VisualKind.MOTION: "motion_state",
    VisualKind.CIRCUIT: "circuit_structure",
    VisualKind.MOLECULE: "molecular_structure",
    VisualKind.MAP: "map_context",
    VisualKind.CELL: "cell_structure",
}

_STATE_VISUALS = frozenset({
    VisualKind.ARRAY,
    VisualKind.FLOW,
    VisualKind.GRAPH,
    VisualKind.MOTION,
})


def lesson_plan_from_legacy_cir(cir: CirDocument) -> LessonPlan:
    """Project legacy CIR teaching semantics into a renderer-free LessonPlan.

    CIR does not contain prerequisites, misconceptions, fact identifiers, or an
    explicit conclusion.  The adapter therefore keeps those fields conservative
    instead of inventing domain knowledge, and deliberately ignores layout,
    timing, layers, assets, and animation calls.
    """

    title = cir.title.strip() or "Legacy lesson"
    summary = cir.summary.strip() or title
    scenes = [
        _scene_intent(step, index=index, total=len(cir.steps))
        for index, step in enumerate(cir.steps)
    ]
    if not scenes:
        scenes = [
            SceneIntent(
                scene_id="legacy_summary",
                teaching_goal=summary,
                strategy="summary",
                required_fact_ids=[],
                required_visual_roles=["concept_summary"],
                preferred_scene_type=None,
                narration_goal=summary,
            )
        ]
    conclusion = _narration_text(cir.steps[-1]) if cir.steps else ""
    return LessonPlan(
        schema_version="1.0.0",
        domain=cir.domain.value,
        title=title,
        learning_objectives=[summary],
        prerequisites=[],
        misconceptions=[],
        expected_conclusion=conclusion or summary,
        lesson_arc=_lesson_arc(cir),
        scenes=scenes,
    )


def _scene_intent(step: CirStep, *, index: int, total: int) -> SceneIntent:
    narration = _narration_text(step)
    teaching_goal = step.title.strip() or narration or f"Legacy scene {index + 1}"
    return SceneIntent(
        scene_id=step.id,
        teaching_goal=teaching_goal,
        strategy=_scene_strategy(step.visual_kind, index=index, total=total),
        required_fact_ids=[],
        required_visual_roles=[_VISUAL_ROLES[step.visual_kind]],
        preferred_scene_type=None,
        narration_goal=narration or teaching_goal,
    )


def _lesson_arc(cir: CirDocument) -> str:
    kinds = {step.visual_kind for step in cir.steps}
    if cir.domain == TopicDomain.MATH and kinds & {
        VisualKind.FORMULA,
        VisualKind.FUNCTION,
        VisualKind.SCENE,
    }:
        return "derivation"
    if kinds & _STATE_VISUALS:
        return "state_transition"
    return "problem_to_solution"


def _scene_strategy(kind: VisualKind, *, index: int, total: int) -> str:
    if total > 1 and index == 0:
        return "intuition"
    if total > 1 and index == total - 1:
        return "summary"
    if kind in _STATE_VISUALS:
        return "state_transition"
    if kind == VisualKind.FORMULA:
        return "derivation"
    return "demonstration"


def _narration_text(step: CirStep) -> str:
    narration: Any = step.narration
    if isinstance(narration, str):
        stripped = narration.strip()
        if stripped.startswith("["):
            try:
                decoded = json.loads(stripped)
            except json.JSONDecodeError:
                decoded = None
            if isinstance(decoded, list):
                narration = decoded
            else:
                return _resolve_token_placeholders(stripped, step)
        else:
            return _resolve_token_placeholders(stripped, step)
    return _flatten_narration(narration, step).strip()


def _flatten_narration(value: Any, step: CirStep) -> str:
    if isinstance(value, str):
        return _resolve_token_placeholders(value, step)
    if isinstance(value, dict) and isinstance(value.get("t"), str):
        token_id = value["t"]
        return next((token.label for token in step.tokens if token.id == token_id), token_id)
    if isinstance(value, list):
        parts = [_flatten_narration(item, step).strip() for item in value]
        return " ".join(part for part in parts if part)
    return ""


def _resolve_token_placeholders(text: str, step: CirStep) -> str:
    token_labels = {token.id: token.label for token in step.tokens}
    return re.sub(
        r"\{\{([^}]+)\}\}",
        lambda match: token_labels.get(match.group(1), match.group(1)),
        text,
    )


__all__ = ["lesson_plan_from_legacy_cir"]
