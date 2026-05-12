from __future__ import annotations

import json
import logging
import re

from app.domain.models.cir import (
    CirDocument,
    CirStep,
    ExecutionCheckpoint,
    ExecutionMap,
    VisualKind,
)
from app.domain.models.playbook import (
    AlgorithmArraySnapshot,
    AlgorithmBarsSnapshot,
    AlgorithmTreeSnapshot,
    CodeHighlightOverlay,
    MathPlotCurve,
    MathPlotSnapshot,
    MetaStep,
    PlaybookScript,
)
from app.domain.services.algorithm_code_library import get_by_id, infer_id

logger = logging.getLogger(__name__)

_DEFAULT_FPS = 30
_DEFAULT_STEP_FRAMES = 60  # 2 s at 30 fps

# Whitelist for math-plot expressions: digits, identifiers (variables/functions),
# arithmetic operators, parentheses, comma and whitespace. Anything else is
# treated as untrusted and the curve is dropped (defence against the LLM
# emitting non-expression text into the plot field).
_SAFE_EXPR_RE = re.compile(r"^[0-9A-Za-z_+\-*/^%(). ,]+$")


def _infer_algorithm_id(title: str, execution_map: ExecutionMap | None = None) -> str | None:
    # Prefer explicit algorithm_id from execution_map (LLM declared it).
    if execution_map and execution_map.algorithm_id:
        return execution_map.algorithm_id
    return infer_id(title)


def _resolve_source(
    user_source: str | None,
    user_language: str,
    algorithm_id: str | None,
    execution_map: ExecutionMap | None,
) -> tuple[list[str], str]:
    """Return (source_lines, language) using priority: user upload > library > LLM generated."""
    if user_source and user_source.strip():
        return user_source.splitlines(), user_language
    if algorithm_id:
        library_entry = get_by_id(algorithm_id)
        if library_entry:
            return list(library_entry.lines), library_entry.language
    if execution_map and execution_map.algorithm_code:
        lang = getattr(execution_map, "algorithm_language", "pseudocode") or "pseudocode"
        return list(execution_map.algorithm_code), lang
    return [], user_language


def build_playbook(
    cir: CirDocument,
    execution_map: ExecutionMap | None,
    fps: int = _DEFAULT_FPS,
    source_code: str | None = None,
    source_language: str = "python",
) -> PlaybookScript:
    checkpoint_by_step: dict[str, ExecutionCheckpoint] = {}
    if execution_map:
        for cp in execution_map.checkpoints:
            checkpoint_by_step[cp.step_id] = cp

    # Resolve source lines and language using priority chain:
    #   1. User-uploaded source_code (highest fidelity)
    #   2. Pre-baked library code for known algorithms
    #   3. LLM-generated algorithm_code from execution_map
    algorithm_id = _infer_algorithm_id(cir.title, execution_map)
    source_lines, source_language = _resolve_source(
        source_code, source_language, algorithm_id, execution_map
    )

    steps: list[MetaStep] = []
    cumulative = 0
    for i, cir_step in enumerate(cir.steps):
        checkpoint = checkpoint_by_step.get(cir_step.id)
        duration = _step_duration_frames(cir_step, checkpoint, fps)
        cumulative += duration
        snapshot = _build_snapshot(cir_step, checkpoint, execution_map)
        code_highlight = _build_code_highlight(checkpoint, source_lines, source_language)
        narration_tpl = _parse_narration_template(cir_step.narration)
        voiceover = (
            _resolve_plain_text(narration_tpl, cir_step.tokens)
            if narration_tpl
            else (cir_step.narration if isinstance(cir_step.narration, str) else "")
        )
        steps.append(
            MetaStep(
                step_id=cir_step.id,
                end_frame=cumulative,
                title=cir_step.title,
                voiceover_text=voiceover,
                animation_hint=_infer_hint(cir_step, i, len(cir.steps)),
                snapshot=snapshot,
                code_highlight=code_highlight,
                narration_template=narration_tpl,
                tokens=[t.model_dump() for t in cir_step.tokens],
            )
        )

    total_frames = max(cumulative, 1)
    initial_data: dict[str, list[str]] = {}
    if execution_map and execution_map.array_track and execution_map.array_track.values:
        initial_data["array"] = list(execution_map.array_track.values)

    return PlaybookScript(
        fps=fps,
        total_frames=total_frames,
        domain=cir.domain,
        title=cir.title,
        summary=cir.summary,
        steps=steps,
        parameter_controls=execution_map.parameter_controls if execution_map else [],
        algorithm_id=algorithm_id,
        initial_data=initial_data,
    )


def _build_code_highlight(
    checkpoint: ExecutionCheckpoint | None,
    source_lines: list[str],
    language: str,
) -> CodeHighlightOverlay | None:
    if not checkpoint or not checkpoint.code_lines or not source_lines:
        return None
    # Filter out-of-range indices (LLM may hallucinate line numbers)
    max_line = len(source_lines) - 1
    active_lines = sorted({i for i in checkpoint.code_lines if 0 <= i <= max_line})
    if not active_lines:
        return None
    return CodeHighlightOverlay(
        language=language,
        lines=source_lines,
        active_lines=active_lines,
        active_line=active_lines[0],
        operation_label=checkpoint.title or None,
    )


def _step_duration_frames(
    cir_step: CirStep,
    checkpoint: ExecutionCheckpoint | None,
    fps: int,
) -> int:
    if checkpoint is not None:
        duration_s = max(0.0, checkpoint.end_s - checkpoint.start_s)
        if duration_s > 0:
            return max(1, round(duration_s * fps))
    if cir_step.start_time is not None and cir_step.end_time is not None:
        duration_s = max(0.0, cir_step.end_time - cir_step.start_time)
        if duration_s > 0:
            return max(1, round(duration_s * fps))
    return _DEFAULT_STEP_FRAMES


def _try_parse_number(value: str) -> float | None:
    try:
        return float(value.strip())
    except (AttributeError, TypeError, ValueError):
        return None


def _build_snapshot(
    cir_step: CirStep,
    checkpoint: ExecutionCheckpoint | None,
    execution_map: ExecutionMap | None,
) -> (
    AlgorithmArraySnapshot
    | AlgorithmBarsSnapshot
    | AlgorithmTreeSnapshot
    | MathPlotSnapshot
):
    if cir_step.visual_kind == VisualKind.GRAPH:
        return _build_tree_snapshot(cir_step, checkpoint)
    if cir_step.visual_kind == VisualKind.FUNCTION:
        plot = _build_math_plot_snapshot(cir_step)
        if plot is not None:
            return plot
        # No usable plot data → degrade to the array view rather than a blank.
    # ARRAY, FLOW, TEXT, FORMULA, MOTION, CIRCUIT, MOLECULE, MAP, CELL fall through to array
    return _build_array_snapshot(cir_step, checkpoint, execution_map)


def _sanitize_expression(expression: str | None) -> str | None:
    """Return a trimmed expression if it passes the safe-character whitelist."""
    if not expression:
        return None
    text = expression.strip()
    if not text or len(text) > 200 or not _SAFE_EXPR_RE.match(text):
        return None
    return text


def _build_math_plot_snapshot(cir_step: CirStep) -> MathPlotSnapshot | None:
    spec = cir_step.plot
    if spec is None:
        return None

    curves: list[MathPlotCurve] = []
    for raw in spec.curves:
        safe = _sanitize_expression(raw.expression)
        if safe is None:
            logger.warning("Dropping unsafe/empty plot expression in step %s", cir_step.id)
            continue
        emphasis = raw.emphasis if raw.emphasis in ("primary", "secondary", "accent") else "primary"
        curves.append(MathPlotCurve(expression=safe, label=raw.label, emphasis=emphasis))

    if not curves:
        return None

    x_min, x_max = spec.x_min, spec.x_max
    if not (x_min < x_max):  # guard against degenerate / inverted ranges
        x_min, x_max = -10.0, 10.0

    marker_x = spec.marker_x
    if marker_x is not None:
        marker_x = max(x_min, min(x_max, marker_x))

    shade_from, shade_to = spec.shade_from, spec.shade_to
    if shade_from is not None and shade_to is not None:
        shade_from = max(x_min, min(x_max, shade_from))
        shade_to = max(x_min, min(x_max, shade_to))
        if shade_from > shade_to:
            shade_from, shade_to = shade_to, shade_from

    return MathPlotSnapshot(
        curves=curves,
        x_min=x_min,
        x_max=x_max,
        y_min=spec.y_min,
        y_max=spec.y_max,
        marker_x=marker_x,
        shade_from=shade_from,
        shade_to=shade_to,
        x_label=spec.x_label or "x",
        y_label=spec.y_label or "y",
        formula_latex=spec.formula_latex,
    )


def _build_array_snapshot(
    cir_step: CirStep,
    checkpoint: ExecutionCheckpoint | None,
    execution_map: ExecutionMap | None,
) -> AlgorithmArraySnapshot | AlgorithmBarsSnapshot:
    # Prefer array_track values when available
    array_values: list[str] = []
    if execution_map and execution_map.array_track:
        array_values = list(execution_map.array_track.values)
    if not array_values:
        array_values = [t.label for t in cir_step.tokens]

    active_indices: list[int] = []
    swap_indices: list[int] = []
    pointers: dict[str, int] = {}

    # Tokens with emphasis "accent" mark sorted positions (always applied)
    sorted_indices = [i for i, t in enumerate(cir_step.tokens) if t.emphasis == "accent"]

    if checkpoint:
        active_indices = list(checkpoint.array_focus_indices)
        if checkpoint.swap_indices:
            # LLM explicitly told us which indices are being swapped
            swap_indices = list(checkpoint.swap_indices)
        elif len(active_indices) == 2 and any(
            kw in checkpoint.title.lower() for kw in ("swap", "exchange", "交换", "互换")
        ):
            # Fall back to heuristic only when the step title signals an actual swap
            swap_indices = list(active_indices)
        # Extract pointer names from token ids that look like "ptr_X" or "idx_X"
        for t in cir_step.tokens:
            m = re.match(r"^(?:ptr|idx|pointer|index)_?(.+)$", t.id, re.IGNORECASE)
            if m and t.value and t.value.isdigit():
                pointers[m.group(1)] = int(t.value)

    # When every element is numeric, render as height-encoded bar blocks (issue #31).
    parsed = [_try_parse_number(v) for v in array_values]
    if array_values and all(n is not None for n in parsed):
        return AlgorithmBarsSnapshot(
            array_values=array_values,
            numeric_values=[n for n in parsed if n is not None],
            active_indices=active_indices,
            swap_indices=swap_indices,
            sorted_indices=sorted_indices,
            pointers=pointers,
        )

    return AlgorithmArraySnapshot(
        array_values=array_values,
        active_indices=active_indices,
        swap_indices=swap_indices,
        sorted_indices=sorted_indices,
        pointers=pointers,
    )


def _build_tree_snapshot(
    cir_step: CirStep,
    checkpoint: ExecutionCheckpoint | None,
) -> AlgorithmTreeSnapshot:
    nodes: list[dict] = []
    edges: list[dict] = []
    seen_edges: set[tuple[str, str]] = set()

    for token in cir_step.tokens:
        nodes.append({"id": token.id, "label": token.label})

    if cir_step.edges:
        # Prefer explicit edges from the LLM over heuristic inference
        for e in cir_step.edges:
            key = (e.from_id, e.to_id)
            if key not in seen_edges:
                seen_edges.add(key)
                edges.append({"from_id": e.from_id, "to_id": e.to_id})
    else:
        # Fallback heuristic: infer edges from token id naming conventions
        for token in cir_step.tokens:
            m = re.match(r"^(.+)_child_(.+)$", token.id)
            if m:
                parent_id = m.group(1)
                key = (parent_id, token.id)
                if key not in seen_edges:
                    seen_edges.add(key)
                    edges.append({"from_id": parent_id, "to_id": token.id})
            if token.value and token.value.startswith("parent:"):
                parent_id = token.value[7:]
                key = (parent_id, token.id)
                if key not in seen_edges:
                    seen_edges.add(key)
                    edges.append({"from_id": parent_id, "to_id": token.id})

    active_node_ids: list[str] = []
    visited_node_ids: list[str] = []
    if checkpoint:
        active_node_ids = list(checkpoint.focus_tokens)

    # Tokens with emphasis "secondary" that appeared in previous steps → visited heuristic
    visited_node_ids = [t.id for t in cir_step.tokens if t.emphasis == "secondary"]

    return AlgorithmTreeSnapshot(
        nodes=nodes,
        edges=edges,
        active_node_ids=active_node_ids,
        visited_node_ids=visited_node_ids,
        path_edge_ids=[],
    )


_HINT_MAP: dict[VisualKind, str] = {
    VisualKind.ARRAY: "compare",
    VisualKind.GRAPH: "highlight",
    VisualKind.FLOW: "reveal",
    VisualKind.FORMULA: "reveal",
    VisualKind.FUNCTION: "reveal",
    VisualKind.TEXT: "reveal",
    VisualKind.MOTION: "enter",
    VisualKind.CIRCUIT: "highlight",
    VisualKind.MOLECULE: "transform",
    VisualKind.MAP: "reveal",
    VisualKind.CELL: "reveal",
}


def _infer_hint(cir_step: CirStep, index: int, total: int) -> str:
    if index == 0:
        return "enter"
    if index == total - 1:
        return "reveal"
    return _HINT_MAP.get(cir_step.visual_kind, "highlight")


def _parse_narration_template(raw: str | list) -> list | None:
    """Parse LLM narration into a structured template array for dynamic resolution.

    Accepts:
    1. list — already parsed JSON array from LLM (real API often outputs array type directly)
    2. str starting with '[' — JSON-encoded array embedded in a string
    3. str with {{token_id}} placeholders — converted to simplified template
    4. plain str — returns None (falls back to voiceover_text)
    """
    if isinstance(raw, list):
        return raw

    stripped = raw.strip()
    if stripped.startswith("["):
        try:
            result = json.loads(stripped)
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass
        logger.warning("narration looks like JSON array but failed to parse; falling back")
        return None

    if "{{" in stripped:
        parts: list = []
        for segment in re.split(r"(\{\{[^}]+\}\})", stripped):
            m = re.match(r"\{\{([^}]+)\}\}", segment)
            if m:
                parts.append({"t": m.group(1)})
            elif segment:
                parts.append(segment)
        return parts if parts else None

    return None


def _resolve_plain_text(template: list, tokens: list) -> str:
    """Flatten a narration template into a readable plain-text string.

    Token refs are substituted with their labels; conditional branches take
    the first non-empty branch (default branch last).
    """
    token_map = {t.id: t.label for t in tokens}
    parts: list[str] = []
    for seg in template:
        if isinstance(seg, str):
            parts.append(seg)
        elif isinstance(seg, dict) and "t" in seg:
            parts.append(token_map.get(seg["t"], seg["t"]))
        elif isinstance(seg, list):
            for branch in seg:
                if isinstance(branch, list) and len(branch) >= 2:
                    text = _resolve_plain_text(branch[1], tokens)
                    if text:
                        parts.append(text)
                        break
    return "".join(parts)
