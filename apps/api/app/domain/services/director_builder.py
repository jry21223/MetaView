from __future__ import annotations

import re

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


def _beat_style(
    snapshot: AnySnapshot,
) -> tuple[DirectorIntent, DirectorShotType, DirectorCameraMotion, DirectorPacing]:
    if snapshot.kind in {"math_formula", "math_plot", "katex_overlay"}:
        return "focus", "close", "hold", "normal"
    if snapshot.kind in {"math_scene", "motion_scene", "solid_geometry_scene"}:
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
        case "narration_card":
            return [snapshot.text]
        case "katex_overlay":
            return [snapshot.latex]
        case _:
            return []
