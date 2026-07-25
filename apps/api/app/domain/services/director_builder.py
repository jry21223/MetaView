from __future__ import annotations

import json
import re
from typing import Any

from app.domain.models.director import (
    DirectorBeat,
    DirectorCameraMotion,
    DirectorIntent,
    DirectorPacing,
    DirectorScript,
    DirectorShotType,
)
from app.domain.models.playbook import AnySnapshot, MetaStep, PlaybookScript

_TOKEN_RE = re.compile(r"[\u4e00-\u9fff]{2,}|[A-Za-z][A-Za-z0-9_]{1,}|[0-9]+(?:\.[0-9]+)?")
_STOPWORDS = {"the", "and", "for", "with", "this", "that", "step", "show", "first", "then"}
_COMPARISON_MARKERS = {"compare", "comparison", "对比", "比较", "versus", "vs"}


def build_default_director(playbook: PlaybookScript, run_id: str) -> DirectorScript:
    """Build deterministic shots from semantic state changes.

    The previous builder mapped broad snapshot kinds to mostly static defaults.
    This planner compares consecutive snapshot payloads, resolves visible focus
    candidates, and only moves the camera when the state change benefits from it.
    """

    beats: list[DirectorBeat] = []
    previous_end = 0
    previous_snapshot: AnySnapshot | None = None
    last_index = len(playbook.steps) - 1

    for index, step in enumerate(playbook.steps):
        start_frame = previous_end
        end_frame = max(step.end_frame, start_frame + 1)
        delta = _semantic_delta(previous_snapshot, step.snapshot)
        intent, shot_type, camera_motion, pacing = _plan_beat(step, delta)

        if index == 0:
            # Opening beat always hooks with a gentle push-in, even when the first
            # snapshot is sparse (e.g. empty arrays before tokens fill in).
            intent = "hook"
            camera_motion = "push_in"
        elif index == last_index and last_index > 0:
            intent = "summary"
            pacing = "slow"
            if delta["spread"] >= 2 or _is_comparison_step(step):
                shot_type = "wide"
                camera_motion = "pull_out"
            else:
                # Terminal summary still eases out so the lesson does not freeze.
                camera_motion = "pull_out"

        focus_target = _resolve_focus_target(step.snapshot, delta)
        beats.append(
            DirectorBeat(
                beat_id=f"beat_{index + 1:02d}",
                step_id=step.step_id,
                start_frame=start_frame,
                end_frame=end_frame,
                intent=intent,
                shot_type=shot_type,
                camera_motion=camera_motion,
                pacing=pacing,
                voiceover_text=None,
                emphasis_terms=_extract_emphasis_terms(step),
                focus_target=focus_target,
            )
        )
        previous_snapshot = step.snapshot
        previous_end = end_frame

    return DirectorScript(run_id=run_id, source="rule", beats=beats)


def _plan_beat(
    step: MetaStep,
    delta: dict[str, Any],
) -> tuple[DirectorIntent, DirectorShotType, DirectorCameraMotion, DirectorPacing]:
    transition = (step.animation_hint or "").strip().lower()
    if _is_comparison_step(step):
        return "compare", "wide", "hold", "normal"
    if delta["identical"]:
        return "explain", _shot_for_density(delta["visible_count"]), "hold", "normal"
    # Formula/overlay beats stay close and steady so KaTeX is readable even when
    # the formula object is newly introduced (added_count == 1).
    if step.snapshot.kind in {"math_formula", "katex_overlay"}:
        return "focus", "close", "hold", "normal"
    if transition in {"focus", "scale"} or delta["added_count"] == 1:
        return "focus", "close", "push_in", "slow"
    if transition in {"morph", "draw"}:
        return "reveal", "medium", "hold", "normal"
    # Snapshot kind changes (formula → scene, array → formula, …) are reveals.
    if (
        delta["previous_kind"] is not None
        and delta["previous_kind"] != delta["kind"]
    ):
        return "reveal", "medium", "hold", "normal"
    if delta["added_count"] > 1 or delta["removed_count"] > 0:
        return "reveal", "medium", "hold", "normal"
    return "explain", _shot_for_density(delta["visible_count"]), "hold", "normal"


def _shot_for_density(visible_count: int) -> DirectorShotType:
    if visible_count <= 1:
        return "close"
    if visible_count >= 6:
        return "wide"
    return "medium"


def _semantic_delta(previous: AnySnapshot | None, current: AnySnapshot) -> dict[str, Any]:
    current_data = current.model_dump(mode="json", exclude_none=True)
    previous_data = (
        previous.model_dump(mode="json", exclude_none=True) if previous is not None else {}
    )
    current_objects = _visible_objects(current_data)
    previous_objects = _visible_objects(previous_data)
    current_ids = set(current_objects)
    previous_ids = set(previous_objects)
    return {
        "identical": previous is not None
        and json.dumps(previous_data, sort_keys=True, ensure_ascii=False)
        == json.dumps(current_data, sort_keys=True, ensure_ascii=False),
        "added": sorted(current_ids - previous_ids),
        "removed": sorted(previous_ids - current_ids),
        "added_count": len(current_ids - previous_ids),
        "removed_count": len(previous_ids - current_ids),
        "visible_count": len(current_ids),
        "spread": _object_spread(current_objects),
        "objects": current_objects,
        "kind": getattr(current, "kind", None),
        "previous_kind": getattr(previous, "kind", None) if previous is not None else None,
    }


def _visible_objects(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    objects: dict[str, dict[str, Any]] = {}
    for key in (
        "objects",
        "points",
        "curves",
        "segments",
        "regions",
        "nodes",
        "edges",
        "frames",
        "structures",
        "steps",
        "reactants",
        "products",
        "vectors",
        "flows",
        "pressure_centers",
        "pointers",
    ):
        values = data.get(key)
        if not isinstance(values, list):
            continue
        for index, value in enumerate(values):
            if not isinstance(value, dict):
                continue
            object_id = str(
                value.get("id")
                or value.get("semantic_role")
                or value.get("label")
                or f"{key}:{index}"
            )
            objects[object_id] = value
    if not objects and data.get("formula_latex"):
        objects["formula"] = {"label": data.get("formula_latex")}
    # Algorithm array fixtures store values outside the generic list keys above.
    array_values = data.get("array_values")
    if isinstance(array_values, list):
        for index, value in enumerate(array_values):
            objects.setdefault(f"array:{index}", {"label": str(value)})
    return objects


def _object_spread(objects: dict[str, dict[str, Any]]) -> int:
    quadrants: set[tuple[int, int]] = set()
    for value in objects.values():
        x = value.get("x")
        y = value.get("y")
        if isinstance(x, int | float) and isinstance(y, int | float):
            quadrants.add((0 if x < 0 else 1, 0 if y < 0 else 1))
    return len(quadrants)


def _resolve_focus_target(snapshot: AnySnapshot, delta: dict[str, Any]) -> str | None:
    explicit = getattr(snapshot, "focus_target", None)
    if isinstance(explicit, str) and explicit in delta["objects"]:
        return explicit
    for object_id in delta["added"]:
        if object_id in delta["objects"]:
            return object_id
    accented = [
        object_id
        for object_id, value in delta["objects"].items()
        if str(value.get("emphasis") or "").lower() == "accent"
    ]
    return accented[0] if accented else None


def _is_comparison_step(step: MetaStep) -> bool:
    text = f"{step.title} {step.voiceover_text}".lower()
    return any(marker in text for marker in _COMPARISON_MARKERS)


def _extract_emphasis_terms(step: MetaStep) -> list[str]:
    candidates = [step.title, *_snapshot_text(step.snapshot)]
    seen: set[str] = set()
    terms: list[str] = []
    for raw in candidates:
        for token in _TOKEN_RE.findall(raw or ""):
            normalized = token.strip()
            key = normalized.lower()
            if key in _STOPWORDS or key in seen:
                continue
            seen.add(key)
            terms.append(normalized)
            if len(terms) >= 4:
                return terms
    return terms


def _snapshot_text(snapshot: AnySnapshot) -> list[str]:
    data = snapshot.model_dump(mode="json", exclude_none=True)
    values: list[str] = []
    for key in ("formula_latex", "caption", "operation_label", "text", "latex"):
        value = data.get(key)
        if isinstance(value, str):
            values.append(value)
    for key in ("curves", "points", "objects", "vectors", "nodes", "frames"):
        entries = data.get(key)
        if isinstance(entries, list):
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                for field in ("label", "expression", "expression_y", "semantic_role"):
                    value = entry.get(field)
                    if isinstance(value, str):
                        values.append(value)
    return values
