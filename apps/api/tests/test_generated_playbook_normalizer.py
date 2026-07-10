from __future__ import annotations

from typing import Any

import pytest

from app.domain.models.playbook import PlaybookScript
from app.domain.services.generated_playbook_normalizer import normalize_generated_playbook
from app.domain.services.playbook_quality import estimate_step_frames
from app.domain.services.scene_blueprint_compiler import compile_scene_blueprint_to_playbook


@pytest.mark.parametrize(
    ("scene_type", "subject", "required_assets"),
    [
        ("derivative_tangent", "math", {"derivative-tangent-preset"}),
        ("bfs_graph", "algorithm", {"bfs-graph-preset"}),
        ("recursion_stack", "algorithm", {"recursion-stack-preset", "active-line"}),
        ("projectile_motion", "physics", {"projectile-body-dot"}),
    ],
)
def test_normalizer_compiles_timeline_scene_metadata_and_assets(
    scene_type: str,
    subject: str,
    required_assets: set[str],
) -> None:
    source = compile_scene_blueprint_to_playbook(
        {
            "id": scene_type,
            "subject": subject,
            "sceneType": scene_type,
            "title": scene_type,
        }
    )
    payload = source.model_dump(mode="python")
    payload["initial_data"].pop("scene_blueprint", None)
    for index, step in enumerate(payload["steps"], start=1):
        step["end_frame"] = index * 30
        _clear_asset_ids(step["snapshot"])
        if scene_type == "bfs_graph":
            for node in step["snapshot"].get("nodes") or []:
                node["asset_id"] = "node-default"
            for edge in step["snapshot"].get("edges") or []:
                edge["asset_id"] = "edge-default"
        step["layers"] = []
        step["code_highlight"] = None
    payload["total_frames"] = len(payload["steps"]) * 30

    normalized = normalize_generated_playbook(
        PlaybookScript.model_validate(payload),
        requested_scene_types={scene_type},
    )

    assert normalized.initial_data["scene_blueprint"] == [scene_type]
    assert required_assets.issubset(_asset_ids(normalized.model_dump(mode="python")))
    previous_end = 0
    for step in normalized.steps:
        assert step.layers[0].body == step.snapshot
        assert step.end_frame - previous_end >= estimate_step_frames(
            step.voiceover_text,
            normalized.fps,
        )
        previous_end = step.end_frame
    assert normalized.total_frames == normalized.steps[-1].end_frame
    if scene_type in {"bfs_graph", "recursion_stack"}:
        assert all(step.code_highlight is not None for step in normalized.steps)
    if scene_type == "bfs_graph":
        for step in normalized.steps:
            snapshot = step.snapshot
            assert snapshot.kind == "graph_scene"
            assert step.code_highlight is not None
            assert step.code_highlight.variables["current"] == (
                snapshot.current_node_id or next(iter(snapshot.active_node_ids), "done")
            )
            assert step.code_highlight.variables["queue"] == (
                f"[{', '.join(dict.fromkeys([*snapshot.queue_node_ids, *snapshot.frontier_node_ids]))}]"
            )
            assert {node.asset_id for node in snapshot.nodes} <= {
                "graph-node",
                "queue-frame",
                "visited-node",
            }
            assert {edge.asset_id for edge in snapshot.edges} <= {None, "edge-active"}


def test_normalizer_does_not_label_dfs_state_as_bfs() -> None:
    source = compile_scene_blueprint_to_playbook(
        {
            "id": "depth_first_search",
            "subject": "algorithm",
            "sceneType": "bfs_graph",
            "title": "DFS",
        }
    )
    payload = source.model_dump(mode="python")
    payload["algorithm_id"] = "depth_first_search"
    payload["initial_data"].pop("scene_blueprint", None)
    for step in payload["steps"]:
        step["code_highlight"] = None
        for snapshot in [step["snapshot"], *(layer["body"] for layer in step["layers"])]:
            _clear_asset_ids(snapshot)
            if snapshot.get("kind") == "graph_scene":
                snapshot["visited_node_ids"] = [snapshot["nodes"][0]["id"]]
                snapshot["queue_node_ids"] = []
                snapshot["frontier_node_ids"] = []

    normalized = normalize_generated_playbook(PlaybookScript.model_validate(payload))
    normalized_payload = normalized.model_dump(mode="python")

    assert "bfs_graph" not in normalized.initial_data.get("scene_blueprint", [])
    assert "bfs-graph-preset" not in _asset_ids(normalized_payload)
    assert all(step.code_highlight is None for step in normalized.steps)


def test_normalizer_synchronizes_explicit_code_highlight_to_snapshot() -> None:
    source = compile_scene_blueprint_to_playbook(
        {
            "id": "bfs_graph",
            "subject": "algorithm",
            "sceneType": "bfs_graph",
            "title": "BFS",
        }
    )
    payload = source.model_dump(mode="python")
    explicit = {
        "language": "python",
        "lines": ["node = queue.popleft()"],
        "active_lines": [0],
        "active_line": 0,
        "variables": {"node": "S"},
        "operation_label": "dequeue",
    }
    payload["steps"][0]["code_highlight"] = explicit

    normalized = normalize_generated_playbook(
        PlaybookScript.model_validate(payload),
        requested_scene_types={"bfs_graph"},
    )

    assert normalized.steps[0].code_highlight is not None
    code = normalized.steps[0].code_highlight
    snapshot = normalized.steps[0].snapshot
    assert code.language == "pseudocode"
    assert code.lines[0] == "procedure BFS(graph, start):"
    assert code.variables == {
        "current": snapshot.current_node_id,
        "queue": f"[{', '.join(snapshot.queue_node_ids)}]",
        "visited": f"{{{', '.join(snapshot.visited_node_ids)}}}",
    }


def test_normalizer_synchronizes_stale_recursion_code_variables() -> None:
    source = compile_scene_blueprint_to_playbook(
        {
            "id": "recursion_stack",
            "subject": "code",
            "sceneType": "recursion_stack",
            "title": "Factorial recursion",
        }
    )
    payload = source.model_dump(mode="python")
    payload["steps"][0]["code_highlight"]["variables"] = {"n": "999"}
    snapshot_payload = payload["steps"][0]["snapshot"]
    snapshot_payload["current_frame_id"] = "missing-frame"
    snapshot_payload["frames"][0]["variables"] = {}
    snapshot_payload["frames"][0]["asset_id"] = "frame-default"

    normalized = normalize_generated_playbook(
        PlaybookScript.model_validate(payload),
        requested_scene_types={"recursion_stack"},
    )

    code = normalized.steps[0].code_highlight
    snapshot = normalized.steps[0].snapshot
    assert code is not None
    assert snapshot.kind == "call_stack_scene"
    assert snapshot.current_frame_id == "factorial-4"
    assert snapshot.frames[0].asset_id == "call-frame"
    assert code.variables == {"n": "4"}
    assert code.lines == snapshot.code_trace.lines
    assert code.active_line == snapshot.code_trace.active_line


def test_normalizer_embeds_secondary_trace_and_prunes_unwound_frames() -> None:
    code_lines = [
        "def factorial(n):",
        "    if n <= 1:",
        "        return 1",
        "    return n * factorial(n - 1)",
    ]
    all_frames = [
        {
            "id": "f4",
            "label": "factorial(4)",
            "depth": 0,
            "state": "waiting",
            "variables": {"n": "4"},
        },
        {
            "id": "f3",
            "label": "factorial(3)",
            "depth": 1,
            "state": "waiting",
            "variables": {"n": "3"},
        },
        {
            "id": "f2",
            "label": "factorial(2)",
            "depth": 2,
            "state": "returned",
            "variables": {"n": "2", "return": "2"},
        },
    ]
    steps = []
    for index, (current_id, frame_count) in enumerate(
        [("f4", 1), ("f3", 2), ("f2", 3), ("f3", 3), ("f4", 3)],
        start=1,
    ):
        frames = [dict(frame) for frame in all_frames[:frame_count]]
        for frame in frames:
            frame["state"] = "active" if frame["id"] == current_id else frame["state"]
        snapshot = {
            "kind": "call_stack_scene",
            "frames": frames,
            "current_frame_id": current_id,
            "caption": "factorial(4) call stack",
        }
        trace = {
            "kind": "code_trace_scene",
            "language": "python",
            "lines": code_lines,
            "active_lines": [3],
            "active_line": 3,
            "active_line_asset_id": "active-line",
            "variables": {},
        }
        steps.append(
            {
                "step_id": f"factorial-{index}",
                "end_frame": index * 30,
                "title": f"factorial {current_id}",
                "voiceover_text": f"Current recursive frame is {current_id}.",
                "snapshot": snapshot,
                "layers": [{"body": snapshot}, {"body": trace}],
                "code_highlight": None,
            }
        )

    normalized = normalize_generated_playbook(
        PlaybookScript.model_validate(
            {
                "fps": 30,
                "total_frames": 150,
                "domain": "code",
                "title": "Factorial recursion",
                "summary": "Trace factorial(4) down and back up.",
                "steps": steps,
            }
        ),
        requested_scene_types={"recursion_stack"},
    )

    assert [len(step.snapshot.frames) for step in normalized.steps] == [1, 2, 3, 2, 1]
    for step in normalized.steps:
        snapshot = step.snapshot
        assert snapshot.kind == "call_stack_scene"
        assert snapshot.code_trace is not None
        assert snapshot.code_trace.lines == code_lines
        assert snapshot.code_trace.active_line == 3
        assert snapshot.code_trace.asset_id == "active-line"
        assert step.code_highlight is not None
        current = next(
            frame for frame in snapshot.frames if frame.id == snapshot.current_frame_id
        )
        assert step.code_highlight.variables["n"] == current.variables["n"]
        assert step.layers[0].body == snapshot
        assert [layer.body.kind for layer in step.layers] == ["call_stack_scene"]


def test_normalizer_recovers_factorial_n_and_marks_returned_frame() -> None:
    source = compile_scene_blueprint_to_playbook(
        {
            "id": "recursion_stack",
            "subject": "code",
            "sceneType": "recursion_stack",
            "title": "Factorial recursion",
        }
    )
    payload = source.model_dump(mode="python")
    snapshot = payload["steps"][0]["snapshot"]
    snapshot["frames"] = [
        {
            "id": "f4",
            "label": "f(4)",
            "depth": 0,
            "state": "active",
            "variables": {"return": "24", "child_return": "6"},
        }
    ]
    snapshot["current_frame_id"] = "f4"
    payload["steps"][0]["layers"] = [{"body": snapshot}]

    normalized = normalize_generated_playbook(
        PlaybookScript.model_validate(payload),
        requested_scene_types={"recursion_stack"},
    )

    frame = normalized.steps[0].snapshot.frames[0]
    assert frame.variables["n"] == "4"
    assert frame.state == "returned"


def test_normalizer_compiles_factorial_recursion_state_machine() -> None:
    source = compile_scene_blueprint_to_playbook(
        {
            "id": "recursion_stack",
            "subject": "code",
            "sceneType": "recursion_stack",
            "title": "Factorial recursion",
        }
    )

    normalized = normalize_generated_playbook(
        source,
        requested_scene_types={"recursion_stack", "factorial_recursion:4"},
    )

    frame_counts = [len(step.snapshot.frames) for step in normalized.steps]
    assert any(
        left < right for left, right in zip(frame_counts, frame_counts[1:], strict=False)
    )
    assert any(
        left > right for left, right in zip(frame_counts, frame_counts[1:], strict=False)
    )
    returns: dict[int, int] = {}
    for step in normalized.steps:
        snapshot = step.snapshot
        assert snapshot.kind == "call_stack_scene"
        assert [layer.body.kind for layer in step.layers] == ["call_stack_scene"]
        assert step.code_highlight is not None
        current = next(frame for frame in snapshot.frames if frame.id == snapshot.current_frame_id)
        assert step.code_highlight.variables == current.variables
        if "return" in current.variables:
            returns[int(current.variables["n"])] = int(current.variables["return"])
    assert returns == {1: 1, 2: 2, 3: 6, 4: 24}
    assert normalized.steps[-1].snapshot.frames[0].state == "returned"


def test_normalizer_compiles_horizontal_projectile_to_renderer_coordinates() -> None:
    source = compile_scene_blueprint_to_playbook(
        {
            "id": "projectile_motion",
            "subject": "physics",
            "sceneType": "projectile_motion",
            "title": "Horizontal projectile",
        }
    )
    payload = source.model_dump(mode="python")
    replacement_kinds = ["math_formula", "narration_card"]
    for index, step in enumerate(payload["steps"]):
        if index % 2 == 0:
            snapshot = {
                "kind": "math_formula",
                "formula_latex": "y=x",
                "caption": "unsupported for this capability",
            }
        else:
            snapshot = {
                "kind": "narration_card",
                "text": "fallback card",
            }
        assert snapshot["kind"] in replacement_kinds
        step["snapshot"] = snapshot
        step["layers"] = [{"body": snapshot}, {"body": snapshot}]
        step["code_highlight"] = {
            "language": "python",
            "lines": ["wrong()"],
            "active_lines": [0],
            "active_line": 0,
            "variables": {},
        }

    normalized = normalize_generated_playbook(
        PlaybookScript.model_validate(payload),
        requested_scene_types={"horizontal_projectile"},
    )

    assert normalized.domain.value == "physics"
    assert normalized.initial_data["scene_blueprint"] == ["projectile_motion"]
    vertical_dy: list[float] = []
    for step in normalized.steps:
        snapshot = step.snapshot
        assert snapshot.kind == "physics_force_scene"
        assert len(snapshot.objects) == 1
        projectile = snapshot.objects[0]
        assert projectile.id == "projectile"
        assert projectile.asset_id == "projectile-body-dot"
        assert 0.0 <= projectile.x <= 100.0
        assert 0.0 <= projectile.y <= 100.0
        assert all(0.0 <= coordinate <= 100.0 for point in snapshot.trajectory for coordinate in point)
        assert [point[0] for point in snapshot.trajectory] == sorted(
            point[0] for point in snapshot.trajectory
        )
        trajectory_slopes = [
            (right[1] - left[1]) / (right[0] - left[0])
            for left, right in zip(snapshot.trajectory, snapshot.trajectory[1:], strict=False)
        ]
        assert trajectory_slopes == sorted(trajectory_slopes)

        vectors = {vector.id: vector for vector in snapshot.vectors}
        assert (vectors["velocity-x"].dx, vectors["velocity-x"].dy) == (16.0, 0.0)
        assert vectors["velocity-y"].dx == 0.0
        assert vectors["velocity-y"].dy >= 0.0
        vertical_dy.append(vectors["velocity-y"].dy)
        assert (vectors["gravity"].dx, vectors["gravity"].dy) == (0.0, 12.0)
        assert all(vector.target == "projectile" for vector in snapshot.vectors)
        assert snapshot.formula_latex == (
            r"x=v_0t,\quad y=\frac12gt^2,\quad v_x=v_0,\quad v_y=gt"
        )
        assert "抛物线" in (snapshot.caption or "")
        assert step.code_highlight is None
        assert len(step.layers) == 1
        assert step.layers[0].body == snapshot

    assert vertical_dy == sorted(vertical_dy)
    assert vertical_dy[0] == 0.0
    assert vertical_dy[-1] == 18.0


def test_normalizer_assigns_projectile_asset_only_to_velocity_target() -> None:
    source = compile_scene_blueprint_to_playbook(
        {
            "id": "projectile_motion",
            "subject": "physics",
            "sceneType": "projectile_motion",
            "title": "Projectile",
        }
    )
    payload = source.model_dump(mode="python")
    payload["initial_data"].pop("scene_blueprint", None)
    for step in payload["steps"]:
        for snapshot in [step["snapshot"], *(layer["body"] for layer in step["layers"])]:
            if snapshot.get("kind") != "physics_force_scene":
                continue
            _clear_asset_ids(snapshot)
            snapshot["objects"].append(
                {"id": "target", "label": "target", "x": 4.0, "y": 0.0}
            )

    normalized = normalize_generated_playbook(
        PlaybookScript.model_validate(payload),
        requested_scene_types={"projectile_motion"},
    )

    for step in normalized.model_dump(mode="python")["steps"]:
        snapshot = step["snapshot"]
        if snapshot.get("kind") != "physics_force_scene":
            continue
        assets_by_id = {item["id"]: item.get("asset_id") for item in snapshot["objects"]}
        assert assets_by_id["body"] == "projectile-body-dot"
        assert assets_by_id["target"] is None


def _clear_asset_ids(value: Any) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if key.endswith("asset_id"):
                value[key] = None
            else:
                _clear_asset_ids(item)
    elif isinstance(value, list):
        for item in value:
            _clear_asset_ids(item)


def _asset_ids(value: Any) -> set[str]:
    result: set[str] = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if key.endswith("asset_id") and isinstance(item, str):
                result.add(item)
            result.update(_asset_ids(item))
    elif isinstance(value, list):
        for item in value:
            result.update(_asset_ids(item))
    return result
