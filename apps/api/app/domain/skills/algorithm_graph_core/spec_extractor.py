from __future__ import annotations

import re

from app.domain.skills.algorithm_graph_core.problem_spec import (
    AlgorithmGraphProblemSpec,
    GraphEdgeSpec,
)

_NODE = r"[A-Za-z][A-Za-z0-9_]*"
_WEIGHTED_EDGE_RE = re.compile(
    rf"(?P<source>{_NODE})\s*->\s*(?P<target>{_NODE})\s*=\s*(?P<weight>-?\d+(?:\.\d+)?)"
)
_DIRECTED_EDGE_RE = re.compile(rf"(?P<source>{_NODE})\s*->\s*(?P<target>{_NODE})")
_UNDIRECTED_EDGE_RE = re.compile(rf"(?P<source>{_NODE})\s*-\s*(?P<target>{_NODE})")


def try_extract_algorithm_graph(prompt: str) -> AlgorithmGraphProblemSpec | None:
    normalized = _normalize(prompt)
    kind = _detect_kind(normalized)
    if kind is None:
        return None

    directed = kind in {"dijkstra", "topological_sort"} or "有向" in normalized
    edges = _extract_edges(normalized, weighted=kind == "dijkstra", directed=directed)
    if not edges:
        return None

    nodes = _stable_nodes(edges)
    start = _extract_start(normalized, nodes) if kind in {"bfs", "dfs", "dijkstra"} else None
    target = _extract_target(normalized, nodes) if kind == "dijkstra" else None
    if kind in {"bfs", "dfs"} and start is None:
        start = nodes[0]
    if kind == "dijkstra" and (start is None or target is None):
        return None

    try:
        return AlgorithmGraphProblemSpec(
            kind=kind,
            nodes=nodes,
            edges=edges,
            start=start,
            target=target,
            directed=directed,
        )
    except ValueError:
        return None


def _normalize(prompt: str) -> str:
    return (
        prompt.strip()
        .replace("，", ",")
        .replace("；", ",")
        .replace("。", ",")
        .replace("：", ":")
    )


def _detect_kind(prompt: str) -> str | None:
    lower = prompt.lower()
    if "dijkstra" in lower or "最短路" in prompt or "最短路径" in prompt:
        return "dijkstra"
    if "拓扑" in prompt or "topological" in lower:
        return "topological_sort"
    if "bfs" in lower or "广度优先" in prompt:
        return "bfs"
    if "dfs" in lower or "深度优先" in prompt:
        return "dfs"
    return None


def _extract_edges(prompt: str, *, weighted: bool, directed: bool) -> list[GraphEdgeSpec]:
    if weighted:
        matches = list(_WEIGHTED_EDGE_RE.finditer(prompt))
        return [
            GraphEdgeSpec(
                source=match.group("source"),
                target=match.group("target"),
                weight=float(match.group("weight")),
            )
            for match in matches
        ]
    if directed:
        matches = list(_DIRECTED_EDGE_RE.finditer(prompt))
        return [
            GraphEdgeSpec(source=match.group("source"), target=match.group("target"))
            for match in matches
        ]
    matches = list(_UNDIRECTED_EDGE_RE.finditer(prompt))
    return [
        GraphEdgeSpec(source=match.group("source"), target=match.group("target"))
        for match in matches
    ]


def _stable_nodes(edges: list[GraphEdgeSpec]) -> list[str]:
    nodes: list[str] = []
    seen: set[str] = set()
    for edge in edges:
        for node in (edge.source, edge.target):
            if node not in seen:
                seen.add(node)
                nodes.append(node)
    return nodes


def _extract_start(prompt: str, nodes: list[str]) -> str | None:
    patterns = [
        rf"求\s*(?P<node>{_NODE})\s*到\s*{_NODE}",
        rf"从\s*(?P<node>{_NODE})\s*(?:开始|出发)",
        rf"起点\s*(?P<node>{_NODE})",
        rf"source\s*(?P<node>{_NODE})",
    ]
    for pattern in patterns:
        match = re.search(pattern, prompt, flags=re.IGNORECASE)
        if match and match.group("node") in nodes:
            return match.group("node")
    return None


def _extract_target(prompt: str, nodes: list[str]) -> str | None:
    patterns = [
        rf"到\s*(?P<node>{_NODE})\s*(?:的)?\s*(?:最短路|最短路径)",
        rf"target\s*(?P<node>{_NODE})",
    ]
    for pattern in patterns:
        match = re.search(pattern, prompt, flags=re.IGNORECASE)
        if match and match.group("node") in nodes:
            return match.group("node")
    return None
