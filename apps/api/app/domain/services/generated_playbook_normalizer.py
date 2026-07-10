"""Deterministic normalization for model-generated PlaybookScript candidates."""

from __future__ import annotations

import math
import re
from collections.abc import Collection
from copy import deepcopy
from typing import Any

from app.domain.models.playbook import PlaybookScript
from app.domain.services.algorithm_code_library import get_by_id
from app.domain.services.physics_layout_compiler import compile_physics_force_snapshot
from app.domain.services.playbook_quality import estimate_step_frames


def normalize_generated_playbook(
    playbook: PlaybookScript,
    *,
    requested_scene_types: Collection[str] = (),
) -> PlaybookScript:
    """Compile timing plus capability-level renderer-safe semantic visuals."""

    payload = playbook.model_dump(mode="python")
    requested_scenes = set(requested_scene_types)
    horizontal_projectile = "horizontal_projectile" in requested_scenes
    factorial_start = _requested_factorial_start(requested_scenes)
    if horizontal_projectile:
        requested_scenes.add("projectile_motion")
        payload["domain"] = "physics"
        payload.setdefault("initial_data", {})["scene_blueprint"] = [
            "projectile_motion"
        ]
    elif factorial_start is not None:
        requested_scenes.add("recursion_stack")
        payload["domain"] = "code"
        payload.setdefault("initial_data", {})["scene_blueprint"] = ["recursion_stack"]
    cursor = 0
    previous_original_end = 0
    scene_types: list[str] = []
    steps = payload.get("steps") or []

    for step_index, step in enumerate(steps):
        original_end = int(step.get("end_frame") or 0)
        original_duration = max(0, original_end - previous_original_end)
        narration_duration = estimate_step_frames(
            str(step.get("voiceover_text") or ""),
            int(payload.get("fps") or 30),
        )
        cursor += max(original_duration, narration_duration)
        step["end_frame"] = cursor
        previous_original_end = original_end

        snapshot = step.get("snapshot")
        layers = step.get("layers")
        compiled_snapshot: dict[str, Any] | None = None
        if horizontal_projectile:
            compiled_snapshot = _horizontal_projectile_snapshot(step_index, len(steps))
        elif factorial_start is not None:
            compiled_snapshot = _factorial_recursion_snapshot(
                step_index,
                len(steps),
                factorial_start,
            )
        if compiled_snapshot is not None:
            snapshot = compiled_snapshot
            step["snapshot"] = snapshot
            primary_timing = (
                layers[0].get("timing")
                if isinstance(layers, list)
                and layers
                and isinstance(layers[0], dict)
                else None
            )
            layers = [{"body": deepcopy(snapshot)}]
            if primary_timing is not None:
                layers[0]["timing"] = primary_timing
            step["layers"] = layers
            step["code_highlight"] = None
        else:
            _embed_secondary_code_trace(snapshot, layers)
            layers = _without_secondary_code_trace(snapshot, layers)
            if isinstance(layers, list):
                step["layers"] = layers
        scene_type = _apply_snapshot_defaults(snapshot, requested_scenes)
        if scene_type and scene_type not in scene_types:
            scene_types.append(scene_type)
        step["code_highlight"] = _synchronize_code_highlight(
            snapshot,
            scene_type,
            step.get("code_highlight"),
        )
        if not isinstance(layers, list) or not layers:
            layers = [{"body": deepcopy(snapshot)}]
            step["layers"] = layers
        else:
            primary_layer = layers[0] if isinstance(layers[0], dict) else {}
            timing = primary_layer.get("timing")
            layers[0] = {"body": deepcopy(snapshot)}
            if timing is not None:
                layers[0]["timing"] = timing
        for layer in layers[1:]:
            if isinstance(layer, dict):
                _apply_snapshot_defaults(layer.get("body"), requested_scenes)

    if payload.get("steps"):
        payload["total_frames"] = cursor

    if scene_types:
        initial_data = payload.setdefault("initial_data", {})
        existing = initial_data.setdefault("scene_blueprint", [])
        for scene_type in scene_types:
            if scene_type not in existing:
                existing.append(scene_type)

    return PlaybookScript.model_validate(payload)


def _horizontal_projectile_snapshot(step_index: int, step_count: int) -> dict[str, Any]:
    trajectory = [
        (14.0, 22.0),
        (24.0, 24.0),
        (34.0, 30.0),
        (44.0, 40.0),
        (54.0, 54.0),
        (64.0, 72.0),
        (74.0, 94.0),
    ]
    progress = step_index / max(step_count - 1, 1)
    x = 14.0 + 60.0 * progress
    y = 22.0 + 72.0 * progress**2
    snapshot = compile_physics_force_snapshot(
        {
            "packId": "physics-basic",
            "object": {
                "id": "projectile",
                "label": "projectile / 抛体",
                "semanticRole": "projectile",
                "x": x,
                "y": y,
                "radius": 3.2,
                "assetId": "projectile-body-dot",
            },
            "vectors": [
                {
                    "id": "velocity-x",
                    "target": "projectile",
                    "semanticRole": "velocity",
                    "dx": 16.0,
                    "dy": 0.0,
                    "label": "v_x",
                    "magnitude": "v_0 (constant)",
                },
                {
                    "id": "velocity-y",
                    "target": "projectile",
                    "semanticRole": "velocity",
                    "dx": 0.0,
                    "dy": 18.0 * progress,
                    "label": "v_y",
                    "magnitude": "gt (downward)",
                },
                {
                    "id": "gravity",
                    "target": "projectile",
                    "semanticRole": "acceleration",
                    "dx": 0.0,
                    "dy": 12.0,
                    "label": "g",
                    "magnitude": "9.8 m/s^2",
                },
            ],
            "trajectory": trajectory,
            "formulaLatex": (
                r"x=v_0t,\quad y=\frac12gt^2,\quad "
                r"v_x=v_0,\quad v_y=gt"
            ),
            "caption": (
                "平抛 / horizontal projectile：v_x 恒定，v_y=gt 向下增加；"
                "重力使轨迹向下弯成抛物线。"
            ),
        }
    )
    return snapshot.model_dump(mode="python")


def _requested_factorial_start(requested_scene_types: set[str]) -> int | None:
    for scene_type in requested_scene_types:
        match = re.fullmatch(r"factorial_recursion:(\d+)", scene_type)
        if match:
            value = int(match.group(1))
            if 1 <= value <= 8:
                return value
    return None


def _factorial_recursion_snapshot(
    step_index: int,
    step_count: int,
    start_n: int,
) -> dict[str, Any]:
    stages = [
        *(("call", value) for value in range(start_n, 1, -1)),
        ("return", 1),
        *(("return", value) for value in range(2, start_n + 1)),
    ]
    if step_count <= 1:
        stage_index = len(stages) - 1
    else:
        stage_index = round(step_index * (len(stages) - 1) / (step_count - 1))
    phase, current_n = stages[stage_index]
    frames: list[dict[str, Any]] = []
    for depth, value in enumerate(range(start_n, current_n - 1, -1)):
        is_current = value == current_n
        variables = {"n": str(value)}
        state = "active" if is_current else "waiting"
        if is_current and phase == "return":
            state = "returned"
            variables["return"] = str(math.factorial(value))
        frames.append(
            {
                "id": f"factorial-{value}",
                "label": f"factorial({value})",
                "depth": depth,
                "state": state,
                "asset_id": "call-frame" if depth == 0 else "stack-frame",
                "variables": variables,
            }
        )
    returned = math.factorial(current_n) if phase == "return" else None
    if current_n == start_n and returned is not None:
        caption = (
            f"结论：factorial({start_n})={returned}。递归帧返回时将待计算值逐层相乘，"
            "并回溯出栈。"
        )
    elif current_n == 1 and returned is not None:
        caption = "基例 n <= 1 成立：factorial(1) 返回 1，调用栈开始回溯。"
    elif returned is not None:
        caption = f"factorial({current_n}) 返回 {returned}，调用栈继续回溯。"
    else:
        caption = f"factorial({current_n}) 入栈，等待递归调用 factorial({current_n - 1})。"
    return {
        "kind": "call_stack_scene",
        "pack_id": "algorithm-code-basic",
        "asset_id": "recursion-stack-preset",
        "frames": frames,
        "code_trace": {
            "language": "python",
            "lines": [
                "def factorial(n):",
                "    if n <= 1:",
                "        return 1",
                "    return n * factorial(n - 1)",
            ],
            "active_lines": [2 if current_n == 1 else 3],
            "active_line": 2 if current_n == 1 else 3,
            "asset_id": "active-line",
        },
        "current_frame_id": f"factorial-{current_n}",
        "caption": caption,
    }


def _embed_secondary_code_trace(snapshot: Any, layers: Any) -> None:
    if (
        not isinstance(snapshot, dict)
        or snapshot.get("kind") != "call_stack_scene"
        or isinstance(snapshot.get("code_trace"), dict)
        or not isinstance(layers, list)
    ):
        return

    for layer in layers[1:]:
        body = layer.get("body") if isinstance(layer, dict) else None
        if not isinstance(body, dict) or body.get("kind") != "code_trace_scene":
            continue
        snapshot["code_trace"] = {
            "language": body.get("language"),
            "lines": deepcopy(body.get("lines") or []),
            "active_lines": deepcopy(body.get("active_lines") or []),
            "active_line": int(body.get("active_line") or 0),
            "asset_id": body.get("active_line_asset_id") or body.get("asset_id"),
        }
        return


def _without_secondary_code_trace(snapshot: Any, layers: Any) -> Any:
    if (
        not isinstance(snapshot, dict)
        or snapshot.get("kind") != "call_stack_scene"
        or not isinstance(layers, list)
    ):
        return layers
    return [
        layer
        for index, layer in enumerate(layers)
        if index == 0
        or not isinstance(layer, dict)
        or not isinstance(layer.get("body"), dict)
        or layer["body"].get("kind") != "code_trace_scene"
    ]


def _apply_snapshot_defaults(
    snapshot: Any,
    requested_scene_types: set[str],
) -> str | None:
    if not isinstance(snapshot, dict):
        return None
    kind = snapshot.get("kind")
    if kind == "math_plot" and _is_derivative_tangent(snapshot):
        snapshot["pack_id"] = snapshot.get("pack_id") or "math-basic"
        snapshot["asset_id"] = snapshot.get("asset_id") or "derivative-tangent-preset"
        return "derivative_tangent"
    if kind == "graph_scene" and "bfs_graph" in requested_scene_types:
        snapshot["pack_id"] = snapshot.get("pack_id") or "algorithm-code-basic"
        snapshot["asset_id"] = snapshot.get("asset_id") or "bfs-graph-preset"
        _normalize_bfs_assets(snapshot)
        return "bfs_graph"
    if kind == "call_stack_scene":
        snapshot["pack_id"] = snapshot.get("pack_id") or "algorithm-code-basic"
        snapshot["asset_id"] = snapshot.get("asset_id") or "recursion-stack-preset"
        _normalize_call_stack(
            snapshot,
            factorial="recursion_stack" in requested_scene_types,
        )
        code_trace = snapshot.get("code_trace")
        if isinstance(code_trace, dict):
            code_trace["asset_id"] = code_trace.get("asset_id") or "active-line"
        return "recursion_stack"
    if kind == "code_trace_scene":
        snapshot["pack_id"] = snapshot.get("pack_id") or "algorithm-code-basic"
        snapshot["active_line_asset_id"] = (
            snapshot.get("active_line_asset_id") or "active-line"
        )
        return None
    if (
        kind == "physics_force_scene"
        and "projectile_motion" in requested_scene_types
        and snapshot.get("trajectory")
    ):
        snapshot["pack_id"] = snapshot.get("pack_id") or "physics-basic"
        projectile_id = _projectile_subject_id(snapshot)
        for item in snapshot.get("objects") or []:
            if isinstance(item, dict) and item.get("id") == projectile_id:
                item["asset_id"] = item.get("asset_id") or "projectile-body-dot"
        return "projectile_motion"
    return None


def _normalize_call_stack(snapshot: dict[str, Any], *, factorial: bool) -> None:
    frames = [frame for frame in snapshot.get("frames") or [] if isinstance(frame, dict)]
    for index, frame in enumerate(frames):
        depth = frame.get("depth")
        frame["asset_id"] = "call-frame" if depth == 0 or index == 0 else "stack-frame"
        variables = frame.setdefault("variables", {})
        if not isinstance(variables, dict):
            variables = {}
            frame["variables"] = variables
        if "n" not in variables:
            match = re.search(
                r"factorial\s*\(\s*(-?\d+)\s*\)|factorial[-_ ](-?\d+)",
                f"{frame.get('label', '')} {frame.get('id', '')}",
                flags=re.IGNORECASE,
            )
            if match is None and factorial:
                match = re.search(
                    r"(?<!\d)(-?\d+)(?!\d)",
                    f"{frame.get('label', '')} {frame.get('id', '')}",
                )
            if match:
                variables["n"] = next(group for group in match.groups() if group is not None)
        if any(_is_return_value_key(key) for key in variables):
            frame["state"] = "returned"

    current = next(
        (
            frame
            for frame in frames
            if str(frame.get("id")) == str(snapshot.get("current_frame_id"))
        ),
        None,
    )
    if current is None:
        current = next(
            (
                frame
                for frame in frames
                if str(frame.get("state") or "").casefold() == "active"
            ),
            frames[-1] if frames else None,
        )
    snapshot["current_frame_id"] = current.get("id") if current else None

    current_depth = current.get("depth") if current else None
    if isinstance(current_depth, int):
        snapshot["frames"] = [
            frame
            for frame in frames
            if not isinstance(frame.get("depth"), int)
            or int(frame["depth"]) <= current_depth
        ]


def _is_return_value_key(key: Any) -> bool:
    return str(key).strip().casefold() in {
        "return",
        "result",
        "return_value",
        "result_value",
        "retval",
    }


def _normalize_bfs_assets(snapshot: dict[str, Any]) -> None:
    current = str(
        snapshot.get("current_node_id")
        or next(iter(snapshot.get("active_node_ids") or []), "")
    )
    queue = {
        str(node_id)
        for node_id in [
            *(snapshot.get("queue_node_ids") or []),
            *(snapshot.get("frontier_node_ids") or []),
        ]
    }
    visited = {str(node_id) for node_id in snapshot.get("visited_node_ids") or []}
    for node in snapshot.get("nodes") or []:
        if not isinstance(node, dict) or node.get("id") is None:
            continue
        node_id = str(node["id"])
        if node_id in queue:
            node["asset_id"] = "queue-frame"
        elif node_id in visited and node_id != current:
            node["asset_id"] = "visited-node"
        else:
            node["asset_id"] = "graph-node"

    active_edges = {str(edge_id) for edge_id in snapshot.get("active_edge_ids") or []}
    for edge in snapshot.get("edges") or []:
        if not isinstance(edge, dict):
            continue
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        aliases = {
            str(edge.get("id") or ""),
            f"{source}-{target}",
            f"{source}->{target}",
        }
        edge["asset_id"] = "edge-active" if active_edges & aliases else None


def _is_derivative_tangent(snapshot: dict[str, Any]) -> bool:
    for curve in snapshot.get("curves") or []:
        if not isinstance(curve, dict):
            continue
        role = str(curve.get("semantic_role") or "").casefold()
        label = str(curve.get("label") or "").casefold()
        if role == "tangent" or "tangent" in label or "切线" in label:
            return snapshot.get("marker_x") is not None
    return False


def _default_code_highlight(
    snapshot: Any,
    scene_type: str | None,
) -> dict[str, Any] | None:
    if not isinstance(snapshot, dict):
        return None
    if scene_type == "bfs_graph" and snapshot.get("kind") == "graph_scene":
        code = get_by_id("bfs")
        if code is None:
            return None
        current = str(
            snapshot.get("current_node_id")
            or next(iter(snapshot.get("active_node_ids") or []), "done")
        )
        queue = list(
            dict.fromkeys(
                [
                    *(str(item) for item in snapshot.get("queue_node_ids") or []),
                    *(str(item) for item in snapshot.get("frontier_node_ids") or []),
                ]
            )
        )
        visited = [str(item) for item in snapshot.get("visited_node_ids") or []]
        active_line = 5 if snapshot.get("active_edge_ids") else 3
        if current == "done":
            active_line = 2
        return {
            "language": code.language,
            "lines": list(code.lines),
            "active_lines": [active_line],
            "active_line": active_line,
            "variables": {
                "current": current,
                "queue": f"[{', '.join(queue)}]",
                "visited": f"{{{', '.join(visited)}}}",
            },
            "operation_label": "scan neighbors" if active_line == 5 else "dequeue current",
        }
    if snapshot.get("kind") == "call_stack_scene":
        trace = snapshot.get("code_trace")
        if not isinstance(trace, dict) or not trace.get("lines"):
            return None
        current_frame_id = snapshot.get("current_frame_id")
        current_frame = next(
            (
                frame
                for frame in snapshot.get("frames") or []
                if isinstance(frame, dict) and frame.get("id") == current_frame_id
            ),
            None,
        )
        return {
            "language": str(trace.get("language") or "text"),
            "lines": [str(line) for line in trace.get("lines") or []],
            "active_lines": list(trace.get("active_lines") or []),
            "active_line": int(trace.get("active_line") or 0),
            "variables": {
                str(key): str(value)
                for key, value in (current_frame or {}).get("variables", {}).items()
            },
            "operation_label": str((current_frame or {}).get("state") or "call stack"),
        }
    if snapshot.get("kind") == "code_trace_scene" and snapshot.get("lines"):
        return {
            "language": str(snapshot.get("language") or "text"),
            "lines": [str(line) for line in snapshot.get("lines") or []],
            "active_lines": list(snapshot.get("active_lines") or []),
            "active_line": int(snapshot.get("active_line") or 0),
            "variables": {
                str(key): str(value)
                for key, value in (snapshot.get("variables") or {}).items()
            },
        }
    return None


def _synchronize_code_highlight(
    snapshot: Any,
    scene_type: str | None,
    existing: Any,
) -> Any:
    canonical = _default_code_highlight(snapshot, scene_type)
    if canonical is None:
        return existing
    if not isinstance(existing, dict):
        return canonical
    return {**existing, **canonical}


def _projectile_subject_id(snapshot: dict[str, Any]) -> str | None:
    objects = [item for item in snapshot.get("objects") or [] if isinstance(item, dict)]
    object_ids = {str(item.get("id")) for item in objects if item.get("id") is not None}
    velocity_targets = {
        str(vector.get("target"))
        for vector in snapshot.get("vectors") or []
        if isinstance(vector, dict)
        and "velocity" in str(vector.get("semantic_role") or "").casefold()
        and str(vector.get("target")) in object_ids
    }
    if len(velocity_targets) == 1:
        return next(iter(velocity_targets))

    named_candidates = [
        str(item["id"])
        for item in objects
        if item.get("id") is not None
        and any(
            alias in f"{item.get('id', '')} {item.get('label', '')}".casefold()
            for alias in ("projectile", "ball", "小球", "物体")
        )
    ]
    if len(named_candidates) == 1:
        return named_candidates[0]
    if len(objects) == 1 and objects[0].get("id") is not None:
        return str(objects[0]["id"])
    return None
