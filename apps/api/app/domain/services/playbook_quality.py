from __future__ import annotations

import re
from typing import Any

from app.domain.models.playbook import (
    AlgorithmArraySnapshot,
    AlgorithmBarsSnapshot,
    CodeHighlightOverlay,
    PlaybookScript,
)
from app.domain.models.review import (
    PlaybookIssueSeverity,
    PlaybookReviewIssue,
    PlaybookReviewStatus,
    PlaybookReviewVerdict,
)

MIN_AGENT_STEPS = 8
MAX_AGENT_STEPS = 14

SUPPORTED_FRONTEND_SNAPSHOT_KINDS = {
    "algorithm_array",
    "algorithm_bars",
    "algorithm_tree",
    "math_plot",
    "math_formula",
    "math_scene",
    "matrix_scene",
    "table_scene",
    "graph_scene",
    "stats_chart_scene",
    "iteration_trace_scene",
    "phase_portrait_scene",
    "complex_plane_scene",
    "optimization_scene",
    "modeling_scene",
    "manifold_scene",
    "solid_geometry_scene",
    "bio_cell_scene",
    "bio_process_scene",
    "molecule_2d_scene",
    "reaction_scene",
    "geo_map_scene",
    "physics_force_scene",
    "motion_scene",
    "katex_overlay",
    "narration_card",
}

_SUBJECT_VISUAL_DOMAINS = {"geography", "biology", "chemistry"}
_ALGORITHM_FALLBACK_KINDS = {"algorithm_array", "algorithm_bars"}

_FORBIDDEN_RENDERING_PATTERNS = (
    "<html",
    "<iframe",
    "<script",
    "manim",
    "server-side video",
    "server video",
    "render_video",
    "ffmpeg",
)


PlaybookCheckReport = PlaybookReviewVerdict


def self_check_playbook(playbook: PlaybookScript, prompt: str) -> PlaybookCheckReport:
    issues: list[PlaybookReviewIssue] = []
    _check_structure(playbook, issues)
    _check_timing(playbook, issues)
    _check_steps(playbook, prompt, issues)
    _check_forbidden_rendering_paths(playbook, issues)
    return playbook_review_verdict_from_issues(
        issues,
        clean_summary="Playbook passed API self-check.",
        warning_summary="Playbook passed API self-check with warnings.",
        blocked_summary="Playbook failed API self-check.",
        actions=["agent:self_check"],
    )


def _check_structure(playbook: PlaybookScript, issues: list[PlaybookReviewIssue]) -> None:
    if not playbook.title.strip():
        issues.append(
            _issue(
                "step.too_shallow",
                PlaybookIssueSeverity.ERROR,
                "title",
                "Playbook title is empty.",
                "Set a short title that names the lesson.",
            )
        )
    if not playbook.summary.strip():
        issues.append(
            _issue(
                "step.too_shallow",
                PlaybookIssueSeverity.WARNING,
                "summary",
                "Playbook summary is empty.",
                "Add a one-sentence summary of the lesson.",
            )
        )
    if len(playbook.steps) < MIN_AGENT_STEPS or len(playbook.steps) > MAX_AGENT_STEPS:
        issues.append(
            _issue(
                "step.too_shallow",
                PlaybookIssueSeverity.ERROR,
                "steps",
                (
                    f"Playbook has {len(playbook.steps)} step(s); launch-safe "
                    f"bounds are {MIN_AGENT_STEPS}-{MAX_AGENT_STEPS}."
                ),
                "Regenerate with a concise but complete step sequence.",
            )
        )


def _check_timing(playbook: PlaybookScript, issues: list[PlaybookReviewIssue]) -> None:
    previous_end = 0
    for index, step in enumerate(playbook.steps):
        if step.end_frame <= previous_end:
            issues.append(
                _issue(
                    "timeline.non_monotonic",
                    PlaybookIssueSeverity.ERROR,
                    f"steps[{index}].end_frame",
                    "Step end_frame values must be strictly increasing.",
                    "Increase each step end_frame beyond the previous step.",
                )
            )
        previous_end = step.end_frame

    if playbook.steps and playbook.total_frames < playbook.steps[-1].end_frame:
        issues.append(
            _issue(
                "timeline.exceeds_total_frames",
                PlaybookIssueSeverity.ERROR,
                "total_frames",
                "total_frames does not cover the final step end_frame.",
                "Set total_frames to at least the last step's end_frame.",
            )
        )


def _check_steps(
    playbook: PlaybookScript,
    prompt: str,
    issues: list[PlaybookReviewIssue],
) -> None:
    for index, step in enumerate(playbook.steps):
        if not step.voiceover_text.strip():
            issues.append(
                _issue(
                    "step.empty_voiceover",
                    PlaybookIssueSeverity.ERROR,
                    f"steps[{index}].voiceover_text",
                    "Every step must have non-empty voiceover_text.",
                    "Write narration that explains why the step matters and what changes visually.",
                )
            )
        _check_snapshot(step.snapshot, f"steps[{index}].snapshot", issues)
        _check_subject_visual_fallback(
            playbook.domain,
            step.snapshot,
            f"steps[{index}].snapshot",
            issues,
        )
        if not step.layers:
            issues.append(
                _issue(
                    "renderer.contract_risk",
                    PlaybookIssueSeverity.ERROR,
                    f"steps[{index}].layers",
                    "Every step must carry at least one renderer layer.",
                    "Mirror the primary snapshot into layers[0].body.",
                )
            )
        else:
            _check_primary_layer_mirror(
                step.snapshot,
                step.layers[0].body,
                f"steps[{index}].layers[0].body",
                issues,
            )
        for layer_index, layer in enumerate(step.layers):
            _check_snapshot(
                layer.body,
                f"steps[{index}].layers[{layer_index}].body",
                issues,
            )
        if step.code_highlight is not None:
            _check_code_highlight(step.code_highlight, index, issues)
        _check_narration_visual_match(index, step.title, step.voiceover_text, step.snapshot, issues)

    _check_final_step_answers_prompt(playbook, prompt, issues)


def _check_primary_layer_mirror(
    snapshot: Any,
    primary_layer_body: Any,
    path: str,
    issues: list[PlaybookReviewIssue],
) -> None:
    snapshot_kind = getattr(snapshot, "kind", None)
    layer_kind = getattr(primary_layer_body, "kind", None)
    if layer_kind != snapshot_kind:
        issues.append(
            _issue(
                "renderer.contract_risk",
                PlaybookIssueSeverity.ERROR,
                f"{path}.kind",
                (
                    "Primary renderer layer kind must match the step snapshot kind; "
                    f"got {layer_kind!r} for snapshot kind {snapshot_kind!r}."
                ),
                "Mirror the primary snapshot into layers[0].body before adding overlay layers.",
            )
        )
        return

    if _snapshot_json(primary_layer_body) != _snapshot_json(snapshot):
        issues.append(
            _issue(
                "renderer.contract_risk",
                PlaybookIssueSeverity.ERROR,
                path,
                "Primary renderer layer body must deeply equal the step snapshot.",
                "Copy the full primary snapshot into layers[0].body and put overlays after it.",
            )
        )


def _check_snapshot(snapshot: Any, path: str, issues: list[PlaybookReviewIssue]) -> None:
    kind = getattr(snapshot, "kind", None)
    if kind not in SUPPORTED_FRONTEND_SNAPSHOT_KINDS:
        issues.append(
            _issue(
                "snapshot.unsupported_kind",
                PlaybookIssueSeverity.ERROR,
                f"{path}.kind",
                f"Snapshot kind {kind!r} is not registered in the frontend renderer registry.",
                "Use one of the existing renderer-backed snapshot kinds.",
            )
        )
        return
    if not _snapshot_has_meaningful_payload(snapshot):
        issues.append(
            _issue(
                "snapshot.empty_payload",
                PlaybookIssueSeverity.ERROR,
                path,
                f"Snapshot {kind!r} has no meaningful visual payload.",
                (
                    "Add renderer-visible data such as array values, curves, scene objects, "
                    "or formula text."
                ),
            )
        )
    _check_algorithm_indices(snapshot, path, issues)


def _check_subject_visual_fallback(
    domain: str,
    snapshot: Any,
    path: str,
    issues: list[PlaybookReviewIssue],
) -> None:
    normalized_domain = domain.strip().lower()
    kind = getattr(snapshot, "kind", None)
    if normalized_domain in _SUBJECT_VISUAL_DOMAINS and kind in _ALGORITHM_FALLBACK_KINDS:
        issues.append(
            _issue(
                "snapshot.domain_fallback",
                PlaybookIssueSeverity.ERROR,
                f"{path}.kind",
                f"{normalized_domain} playbooks must not fall back to {kind}.",
                (
                    "Use a SceneBlueprint or subject semantic renderer such as geo_map_scene, "
                    "bio_cell_scene, bio_process_scene, molecule_2d_scene, or reaction_scene "
                    "instead of an algorithm array."
                ),
            )
        )


def _snapshot_json(snapshot: Any) -> dict[str, Any]:
    if hasattr(snapshot, "model_dump"):
        return snapshot.model_dump(mode="json", exclude_none=True)
    if isinstance(snapshot, dict):
        return {key: value for key, value in snapshot.items() if value is not None}
    return {}


def _snapshot_has_meaningful_payload(snapshot: Any) -> bool:
    kind = getattr(snapshot, "kind", "")
    data = snapshot.model_dump(mode="json", exclude_none=True)
    if kind in {"algorithm_array", "algorithm_bars"}:
        return bool(data.get("array_values"))
    if kind == "algorithm_tree":
        return bool(data.get("nodes") or data.get("edges"))
    if kind == "math_plot":
        return any(curve.get("expression") for curve in data.get("curves", []))
    if kind == "math_formula":
        return bool(str(data.get("formula_latex", "")).strip())
    if kind == "math_scene":
        return any(
            data.get(key)
            for key in (
                "points",
                "curves",
                "regions",
                "vector_field",
                "segments",
                "annotations",
                "formula_latex",
                "caption",
            )
        )
    if kind == "matrix_scene":
        return bool(data.get("matrix"))
    if kind == "table_scene":
        return bool(data.get("columns") or data.get("rows"))
    if kind == "graph_scene":
        return bool(data.get("nodes") or data.get("edges"))
    if kind == "stats_chart_scene":
        return bool(data.get("series"))
    if kind == "iteration_trace_scene":
        return bool(data.get("iterations"))
    if kind == "phase_portrait_scene":
        return bool(data.get("trajectories") or data.get("equilibria") or data.get("vector_field"))
    if kind == "complex_plane_scene":
        return bool(data.get("points") or data.get("contours") or data.get("mapping_grid"))
    if kind == "optimization_scene":
        return bool(
            data.get("objective")
            or data.get("feasible_region")
            or data.get("iterates")
            or data.get("optimum")
        )
    if kind == "modeling_scene":
        return bool(data.get("variables") or data.get("relations") or data.get("simulation_series"))
    if kind == "manifold_scene":
        return bool(
            data.get("chart_name") or data.get("param_surface") or data.get("tangent_vectors")
        )
    if kind == "solid_geometry_scene":
        return bool(
            data.get("points")
            or data.get("edges")
            or data.get("planes")
            or data.get("vectors")
            or data.get("visible_elements")
        )
    if kind == "bio_cell_scene":
        return bool(data.get("structures") or data.get("callouts"))
    if kind == "bio_process_scene":
        return bool(data.get("steps") or data.get("connections") or data.get("callouts"))
    if kind == "molecule_2d_scene":
        return bool(data.get("atoms") or data.get("bonds") or data.get("molecule_asset_id"))
    if kind == "reaction_scene":
        return bool(
            data.get("reactants")
            or data.get("products")
            or data.get("arrows")
            or data.get("electron_flows")
            or data.get("formula_latex")
        )
    if kind == "geo_map_scene":
        return bool(data.get("layers") or data.get("flows") or data.get("pressure_centers"))
    if kind == "physics_force_scene":
        return bool(data.get("objects") or data.get("vectors") or data.get("trajectory"))
    if kind == "motion_scene":
        return bool(data.get("objects") or data.get("tracks"))
    if kind == "katex_overlay":
        return bool(str(data.get("latex", "")).strip())
    if kind == "narration_card":
        return bool(str(data.get("text", "")).strip())
    return False


def _check_algorithm_indices(
    snapshot: Any,
    path: str,
    issues: list[PlaybookReviewIssue],
) -> None:
    if not isinstance(snapshot, (AlgorithmArraySnapshot, AlgorithmBarsSnapshot)):
        return
    count = len(snapshot.array_values)
    indices = [
        *snapshot.active_indices,
        *snapshot.swap_indices,
        *snapshot.sorted_indices,
        *snapshot.pointers.values(),
    ]
    if any(index < 0 or index >= count for index in indices):
        issues.append(
            _issue(
                "algorithm.invalid_state_transition",
                PlaybookIssueSeverity.ERROR,
                path,
                "Algorithm snapshot references an array index outside array_values.",
                "Keep active, swap, sorted, and pointer indices within the array length.",
            )
        )


def _check_code_highlight(
    code: CodeHighlightOverlay,
    step_index: int,
    issues: list[PlaybookReviewIssue],
) -> None:
    line_count = len(code.lines)
    active_lines = [*code.active_lines, code.active_line]
    if any(line < 0 or line >= line_count for line in active_lines):
        issues.append(
            _issue(
                "code.line_out_of_range",
                PlaybookIssueSeverity.ERROR,
                f"steps[{step_index}].code_highlight.active_lines",
                "Code highlight references a line outside the provided source lines.",
                "Keep active_lines and active_line within the zero-based lines array.",
            )
        )


def _check_narration_visual_match(
    index: int,
    title: str,
    voiceover: str,
    snapshot: Any,
    issues: list[PlaybookReviewIssue],
) -> None:
    visual_tokens = _tokens_for_snapshot(snapshot) | _tokens_for_text(title)
    narration_tokens = _tokens_for_text(voiceover)
    if visual_tokens and narration_tokens and not (visual_tokens & narration_tokens):
        issues.append(
            _issue(
                "snapshot.narration_mismatch",
                PlaybookIssueSeverity.WARNING,
                f"steps[{index}].voiceover_text",
                "Step narration does not appear to reference the visual snapshot.",
                (
                    "Mention the key visual object, formula, array state, or scene element "
                    "in the narration."
                ),
            )
        )


def _check_final_step_answers_prompt(
    playbook: PlaybookScript,
    prompt: str,
    issues: list[PlaybookReviewIssue],
) -> None:
    if not playbook.steps:
        return
    prompt_tokens = _tokens_for_text(prompt)
    if len(prompt_tokens) < 3:
        return
    final = playbook.steps[-1]
    final_tokens = (
        _tokens_for_text(final.title)
        | _tokens_for_text(final.voiceover_text)
        | _tokens_for_text(playbook.summary)
    )
    if final_tokens and not (prompt_tokens & final_tokens):
        issues.append(
            _issue(
                "step.does_not_answer_prompt",
                PlaybookIssueSeverity.WARNING,
                "steps[-1]",
                "The final step may not answer the user's prompt.",
                "Make the final narration explicitly state the requested conclusion or result.",
            )
        )


def _check_forbidden_rendering_paths(
    playbook: PlaybookScript,
    issues: list[PlaybookReviewIssue],
) -> None:
    raw = playbook.model_dump_json().lower()
    for pattern in _FORBIDDEN_RENDERING_PATTERNS:
        if pattern in raw:
            issues.append(
                _issue(
                    "renderer.contract_risk",
                    PlaybookIssueSeverity.ERROR,
                    "playbook",
                    f"Playbook mentions forbidden rendering path {pattern!r}.",
                    "Use only PlaybookScript consumed by the frontend Remotion renderer.",
                )
            )


def _tokens_for_snapshot(snapshot: Any) -> set[str]:
    kind = str(getattr(snapshot, "kind", ""))
    data = snapshot.model_dump(mode="json", exclude_none=True)
    tokens = set(kind.split("_"))
    tokens.update(_tokens_for_text(_text_payload(data)))
    if kind.startswith("algorithm"):
        tokens.add("array")
    if kind.startswith("math"):
        tokens.add("math")
    return {token for token in tokens if len(token) >= 2}


def _text_payload(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(_text_payload(item) for item in value.values())
    if isinstance(value, list):
        return " ".join(_text_payload(item) for item in value)
    return ""


def _tokens_for_text(text: str) -> set[str]:
    tokens = {token for token in re.findall(r"[a-zA-Z0-9_]+", text.lower()) if len(token) >= 2}
    tokens.update(re.findall(r"[\u4e00-\u9fff]", text))
    return tokens


def playbook_review_verdict_from_issues(
    issues: list[PlaybookReviewIssue],
    *,
    clean_summary: str,
    warning_summary: str,
    blocked_summary: str,
    actions: list[str] | None = None,
) -> PlaybookReviewVerdict:
    if any(issue.severity == PlaybookIssueSeverity.ERROR for issue in issues):
        status = PlaybookReviewStatus.BLOCKED
        summary = blocked_summary
    elif issues:
        status = PlaybookReviewStatus.WARNINGS
        summary = warning_summary
    else:
        status = PlaybookReviewStatus.CLEAN
        summary = clean_summary
    return PlaybookReviewVerdict(
        status=status,
        summary=summary,
        issues=issues,
        actions=actions or [],
    )


def _issue(
    code: str,
    severity: PlaybookIssueSeverity,
    path: str,
    message: str,
    suggestion: str,
) -> PlaybookReviewIssue:
    return PlaybookReviewIssue(
        code=code,
        severity=severity,
        path=path,
        message=message,
        suggestion=suggestion,
        requires_repair=severity == PlaybookIssueSeverity.ERROR,
    )
