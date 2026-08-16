from __future__ import annotations

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
_STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "step",
    "show",
    "shows",
    "first",
    "then",
}


def build_default_director(playbook: PlaybookScript, run_id: str) -> DirectorScript:
    beats: list[DirectorBeat] = []
    previous_end = 0
    last_index = len(playbook.steps) - 1

    for index, step in enumerate(playbook.steps):
        start_frame = previous_end
        end_frame = max(step.end_frame, start_frame + 1)
        intent, shot_type, camera_motion, pacing = _beat_style(step.snapshot)

        if index == 0:
            intent = "hook"
            camera_motion = "push_in"
        if index == last_index and last_index > 0:
            intent = "summary"
            shot_type = "wide"
            camera_motion = "pull_out"
            pacing = "slow"

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
                focus_target=getattr(step.snapshot, "focus_target", None),
            )
        )
        previous_end = end_frame

    return DirectorScript(run_id=run_id, source="rule", beats=beats)


def remap_director_beats_to_playbook(
    director: DirectorScript,
    original_playbook: PlaybookScript,
    stretched_playbook: dict[str, Any],
) -> DirectorScript:
    """Align director beat frames to a (possibly audio-stretched) playbook timeline.

    Audio export stretches each step's ``end_frame`` so the step lasts at
    least as long as its narration (see ``export_video._stretch_end_frames``).
    Beats built against the original timeline then drift away from the
    rendered step boundaries, so re-map every beat onto the stretched boundary
    of its step, preserving its relative position *within* the original step
    (so a hand-edited director with several short beats per step keeps its
    pacing instead of stretching every beat to the full step). Semantics fields
    (intent, shot type, camera motion, pacing, emphasis terms, ...) are
    preserved. Beats whose ``step_id`` is absent from the playbook keep their
    original frames.
    """

    def _bounds_from_objects(
        steps: list[Any],
    ) -> dict[str, tuple[int, int]]:
        bounds: dict[str, tuple[int, int]] = {}
        cumulative = 0
        for step in steps:
            end_frame = int(step.end_frame)
            bounds[step.step_id] = (cumulative, end_frame)
            cumulative = end_frame
        return bounds

    def _bounds_from_dicts(
        steps: list[dict[str, Any]],
    ) -> dict[str, tuple[int, int]]:
        bounds: dict[str, tuple[int, int]] = {}
        cumulative = 0
        for step in steps:
            end_frame = int(step["end_frame"])
            bounds[str(step["step_id"])] = (cumulative, end_frame)
            cumulative = end_frame
        return bounds

    original_bounds = _bounds_from_objects(original_playbook.steps)
    stretched_bounds = _bounds_from_dicts(stretched_playbook.get("steps", []))

    remapped: list[DirectorBeat] = []
    for beat in director.beats:
        stretched = stretched_bounds.get(beat.step_id)
        if stretched is None:
            remapped.append(beat)
            continue
        original = original_bounds.get(beat.step_id)
        if original is None or original[1] <= original[0]:
            remapped.append(
                beat.model_copy(update={"start_frame": stretched[0], "end_frame": stretched[1]})
            )
            continue
        old_duration = original[1] - original[0]
        rel_start = min(1.0, max(0.0, (beat.start_frame - original[0]) / old_duration))
        rel_end = min(1.0, max(0.0, (beat.end_frame - original[0]) / old_duration))
        new_duration = stretched[1] - stretched[0]
        new_start = stretched[0] + round(rel_start * new_duration)
        new_end = stretched[0] + round(rel_end * new_duration)
        if new_end <= new_start:
            new_end = new_start + 1
        remapped.append(
            beat.model_copy(update={"start_frame": new_start, "end_frame": new_end})
        )
    return director.model_copy(update={"beats": remapped})


def _beat_style(
    snapshot: AnySnapshot,
) -> tuple[DirectorIntent, DirectorShotType, DirectorCameraMotion, DirectorPacing]:
    if snapshot.kind in {
        "math_formula",
        "math_plot",
        "katex_overlay",
        "table_scene",
        "matrix_scene",
    }:
        return "focus", "close", "hold", "normal"
    if snapshot.kind in {
        "math_scene",
        "motion_scene",
        "solid_geometry_scene",
        "graph_scene",
        "stats_chart_scene",
        "iteration_trace_scene",
        "phase_portrait_scene",
        "complex_plane_scene",
        "optimization_scene",
        "modeling_scene",
        "manifold_scene",
    }:
        return "reveal", "medium", "hold", "normal"
    if snapshot.kind == "narration_card":
        return "summary", "wide", "hold", "normal"
    return "explain", "medium", "hold", "normal"


def _extract_emphasis_terms(step: MetaStep) -> list[str]:
    candidates = [step.title]
    candidates.extend(_snapshot_text(step.snapshot))
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
    match snapshot.kind:
        case "math_formula":
            return [snapshot.formula_latex, snapshot.caption or ""]
        case "math_plot":
            curve_text = [curve.expression for curve in snapshot.curves]
            return [snapshot.formula_latex or "", *curve_text]
        case "math_scene":
            return [snapshot.formula_latex or "", snapshot.caption or ""]
        case "solid_geometry_scene":
            return [snapshot.formula_latex or "", snapshot.caption or ""]
        case "matrix_scene":
            return [
                snapshot.formula_latex or "",
                snapshot.caption or "",
                snapshot.operation_label or "",
            ]
        case "table_scene":
            return [snapshot.caption or ""]
        case (
            "stats_chart_scene"
            | "iteration_trace_scene"
            | "phase_portrait_scene"
            | "complex_plane_scene"
            | "optimization_scene"
            | "modeling_scene"
            | "manifold_scene"
        ):
            return [snapshot.formula_latex or "", snapshot.caption or ""]
        case "graph_scene":
            return [snapshot.caption or ""]
        case "narration_card":
            return [snapshot.text]
        case "katex_overlay":
            return [snapshot.latex]
        case _:
            return []
