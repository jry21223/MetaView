from __future__ import annotations

from typing import Any

from app.domain.models.playbook import (
    CodeHighlightOverlay,
    CodeTracePointer,
    CodeTraceSceneSnapshot,
    GraphSceneEdge,
    GraphSceneNode,
    GraphSceneSnapshot,
)

_DEFAULT_BINARY_SEARCH_VALUES = ["2", "4", "7", "11", "18", "25", "31"]
_DEFAULT_BINARY_SEARCH_TARGET = "11"
_DEFAULT_BFS_NODES = [
    {"id": "S", "label": "S", "x": -3, "y": 0},
    {"id": "A", "label": "A", "x": -1, "y": 0},
    {"id": "B", "label": "B", "x": 1.1, "y": -1.3},
    {"id": "C", "label": "C", "x": 1.1, "y": 1.3},
    {"id": "D", "label": "D", "x": 3, "y": 0},
]
_DEFAULT_BFS_EDGES = [
    {"id": "S-A", "source": "S", "target": "A"},
    {"id": "A-B", "source": "A", "target": "B"},
    {"id": "A-C", "source": "A", "target": "C"},
    {"id": "B-D", "source": "B", "target": "D"},
    {"id": "C-D", "source": "C", "target": "D"},
]


def _string_list(
    blueprint: dict[str, Any],
    camel_key: str,
    snake_key: str,
    default: list[str],
) -> list[str]:
    value = blueprint.get(camel_key) or blueprint.get(snake_key)
    if isinstance(value, list):
        return [str(item) for item in value]
    return list(default)


def _graph_nodes(blueprint: dict[str, Any]) -> list[GraphSceneNode]:
    nodes = blueprint.get("graphNodes") or blueprint.get("graph_nodes") or _DEFAULT_BFS_NODES
    if not isinstance(nodes, list) or not nodes:
        nodes = _DEFAULT_BFS_NODES
    count = max(1, len(nodes))
    compiled: list[GraphSceneNode] = []
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            continue
        node_id = str(node.get("id") or f"node-{index + 1}")
        x = float(node["x"]) if isinstance(node.get("x"), int | float) else -3 + index * (6 / count)
        y = float(node["y"]) if isinstance(node.get("y"), int | float) else 0
        compiled.append(
            GraphSceneNode(
                id=node_id,
                label=str(node.get("label") or node_id),
                x=x,
                y=y,
            )
        )
    return compiled


def _graph_edges(blueprint: dict[str, Any]) -> list[GraphSceneEdge]:
    edges = blueprint.get("graphEdges") or blueprint.get("graph_edges") or _DEFAULT_BFS_EDGES
    if not isinstance(edges, list) or not edges:
        edges = _DEFAULT_BFS_EDGES
    compiled: list[GraphSceneEdge] = []
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        if not source or not target:
            continue
        weight = float(edge["weight"]) if isinstance(edge.get("weight"), int | float) else None
        compiled.append(
            GraphSceneEdge(
                id=str(edge.get("id") or f"{source}-{target}"),
                source=source,
                target=target,
                label=str(edge["label"]) if edge.get("label") is not None else None,
                weight=weight,
            )
        )
    return compiled


def compile_bfs_graph_snapshot(blueprint: dict[str, Any]) -> GraphSceneSnapshot:
    current_node_id = str(blueprint.get("currentNodeId") or blueprint.get("current_node_id") or "A")
    return GraphSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "algorithm-code-basic"),
        asset_id="bfs-graph-preset",
        nodes=_graph_nodes(blueprint),
        edges=_graph_edges(blueprint),
        directed=True,
        current_node_id=current_node_id,
        active_node_ids=_string_list(
            blueprint,
            "activeNodeIds",
            "active_node_ids",
            [current_node_id],
        ),
        active_edge_ids=_string_list(blueprint, "activeEdgeIds", "active_edge_ids", ["A-B"]),
        visited_node_ids=_string_list(blueprint, "visitedNodeIds", "visited_node_ids", ["S"]),
        queue_node_ids=_string_list(blueprint, "queueNodeIds", "queue_node_ids", ["B", "C"]),
        frontier_node_ids=_string_list(blueprint, "frontierNodeIds", "frontier_node_ids", []),
        caption=str(
            blueprint.get("caption")
            or "BFS expands the current node and appends unvisited neighbors to the queue."
        ),
    )


def binary_search_lines() -> list[str]:
    return [
        "function binarySearch(nums, target) {",
        "  let low = 0, high = nums.length - 1;",
        "  const mid = Math.floor((low + high) / 2);",
        "  if (nums[mid] === target) return mid;",
        "  return nums[mid] < target ? searchRight() : searchLeft();",
        "}",
    ]


def _array_values(blueprint: dict[str, Any]) -> list[str]:
    values = blueprint.get("arrayValues") or blueprint.get("array_values")
    if isinstance(values, list) and values:
        return [str(value) for value in values]
    return list(_DEFAULT_BINARY_SEARCH_VALUES)


def _target(blueprint: dict[str, Any], values: list[str]) -> str:
    value = blueprint.get("target")
    if value is not None and str(value).strip():
        return str(value)
    return _DEFAULT_BINARY_SEARCH_TARGET or values[(len(values) - 1) // 2]


def compile_binary_search_code_trace_snapshot(
    blueprint: dict[str, Any],
) -> CodeTraceSceneSnapshot:
    values = _array_values(blueprint)
    target = _target(blueprint, values)
    low = 0
    high = max(0, len(values) - 1)
    mid = (low + high) // 2
    active_lines = [2, 3] if values[mid] == target else [2, 4]

    return CodeTraceSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "algorithm-code-basic"),
        asset_id="binary-search-trace-preset",
        language="typescript",
        lines=binary_search_lines(),
        active_lines=active_lines,
        active_line=2,
        array_values=values,
        active_indices=[mid],
        search_range=(low, high),
        pointers=[
            CodeTracePointer(id="low", label="low", index=low),
            CodeTracePointer(id="mid", label="mid", index=mid),
            CodeTracePointer(id="high", label="high", index=high),
        ],
        variables={
            "target": target,
            "low": str(low),
            "mid": str(mid),
            "high": str(high),
        },
        caption=str(
            blueprint.get("caption")
            or "Binary search checks the middle element before discarding half the range."
        ),
    )


def compile_binary_search_code_highlight(
    blueprint: dict[str, Any],
) -> CodeHighlightOverlay:
    values = _array_values(blueprint)
    target = _target(blueprint, values)
    low = 0
    high = max(0, len(values) - 1)
    mid = (low + high) // 2
    active_lines = [2, 3] if values[mid] == target else [2, 4]
    visual_intent = ", ".join(str(item) for item in blueprint.get("visualIntent") or [])

    return CodeHighlightOverlay(
        language="typescript",
        lines=binary_search_lines(),
        active_lines=active_lines,
        active_line=2,
        variables={
            "intent": visual_intent,
            "target": target,
            "low": str(low),
            "mid": str(mid),
            "high": str(high),
        },
        operation_label="compare midpoint",
    )
