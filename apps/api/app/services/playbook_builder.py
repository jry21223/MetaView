from __future__ import annotations

import re

from app.schemas import (
    AlgorithmArraySnapshot,
    AlgorithmTreeSnapshot,
    CirDocument,
    CirStep,
    ExecutionCheckpoint,
    ExecutionMap,
    MetaStep,
    PlaybookScript,
    VisualKind,
)

_DEFAULT_FPS = 30
_DEFAULT_STEP_FRAMES = 60  # 2 s at 30 fps


def build_playbook(
    cir: CirDocument,
    execution_map: ExecutionMap | None,
    fps: int = _DEFAULT_FPS,
) -> PlaybookScript:
    checkpoint_by_step: dict[str, ExecutionCheckpoint] = {}
    if execution_map:
        for cp in execution_map.checkpoints:
            checkpoint_by_step[cp.step_id] = cp

    steps: list[MetaStep] = []
    cumulative = 0
    for i, cir_step in enumerate(cir.steps):
        duration = _step_duration_frames(cir_step, checkpoint_by_step.get(cir_step.id), fps)
        cumulative += duration
        snapshot = _build_snapshot(cir_step, checkpoint_by_step.get(cir_step.id), execution_map)
        steps.append(
            MetaStep(
                step_id=cir_step.id,
                end_frame=cumulative,
                title=cir_step.title,
                voiceover_text=cir_step.narration,
                animation_hint=_infer_hint(cir_step, i, len(cir.steps)),
                snapshot=snapshot,
            )
        )

    total_frames = max(cumulative, 1)
    return PlaybookScript(
        fps=fps,
        total_frames=total_frames,
        domain=cir.domain,
        title=cir.title,
        summary=cir.summary,
        steps=steps,
        parameter_controls=execution_map.parameter_controls if execution_map else [],
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


def _build_snapshot(
    cir_step: CirStep,
    checkpoint: ExecutionCheckpoint | None,
    execution_map: ExecutionMap | None,
) -> AlgorithmArraySnapshot | AlgorithmTreeSnapshot:
    if cir_step.visual_kind == VisualKind.GRAPH:
        return _build_tree_snapshot(cir_step, checkpoint)
    # ARRAY, FLOW, TEXT, FORMULA, MOTION, CIRCUIT, MOLECULE, MAP, CELL all fall through to array
    return _build_array_snapshot(cir_step, checkpoint, execution_map)


def _build_array_snapshot(
    cir_step: CirStep,
    checkpoint: ExecutionCheckpoint | None,
    execution_map: ExecutionMap | None,
) -> AlgorithmArraySnapshot:
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
        if len(active_indices) == 2:
            swap_indices = list(active_indices)
        # Extract pointer names from token ids that look like "ptr_X" or "idx_X"
        for t in cir_step.tokens:
            m = re.match(r"^(?:ptr|idx|pointer|index)_?(.+)$", t.id, re.IGNORECASE)
            if m and t.value and t.value.isdigit():
                pointers[m.group(1)] = int(t.value)

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
        # Infer parent→child edges from token id patterns like "node_1_2" (parent 1, child 2)
        m = re.match(r"^(.+)_child_(.+)$", token.id)
        if m:
            parent_id, child_id = m.group(1), token.id
            key = (parent_id, child_id)
            if key not in seen_edges:
                seen_edges.add(key)
                edges.append({"from_id": parent_id, "to_id": child_id})
        # Also check value field like "parent:root_id"
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
