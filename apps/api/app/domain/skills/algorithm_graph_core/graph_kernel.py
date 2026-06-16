from __future__ import annotations

import heapq
from collections import deque
from dataclasses import dataclass, field
from math import inf

from app.domain.skills.algorithm_graph_core.problem_spec import (
    AlgorithmGraphProblemSpec,
    GraphEdgeSpec,
)


@dataclass(frozen=True)
class GraphAlgorithmSolution:
    kind: str
    nodes: list[str]
    edges: list[GraphEdgeSpec]
    directed: bool
    order: list[str] = field(default_factory=list)
    path: list[str] = field(default_factory=list)
    distances: dict[str, float] = field(default_factory=dict)
    table_rows: list[list[str]] = field(default_factory=list)
    formula_latex: str | None = None
    answer_text: str = ""


def solve_graph_problem(spec: AlgorithmGraphProblemSpec) -> GraphAlgorithmSolution:
    if spec.kind == "bfs":
        return _solve_bfs(spec)
    if spec.kind == "dfs":
        return _solve_dfs(spec)
    if spec.kind == "dijkstra":
        return _solve_dijkstra(spec)
    if spec.kind == "topological_sort":
        return _solve_topological_sort(spec)
    raise ValueError("unsupported graph algorithm")


def _solve_bfs(spec: AlgorithmGraphProblemSpec) -> GraphAlgorithmSolution:
    adjacency = _adjacency(spec)
    start = _require(spec.start)
    queue: deque[str] = deque([start])
    visited = {start}
    order: list[str] = []
    rows: list[list[str]] = []

    while queue:
        node = queue.popleft()
        order.append(node)
        enqueued: list[str] = []
        for neighbor, _weight in adjacency[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
                enqueued.append(neighbor)
        rows.append([node, ", ".join(order), ", ".join(enqueued) or "-", ", ".join(queue) or "-"])

    return GraphAlgorithmSolution(
        kind=spec.kind,
        nodes=spec.nodes,
        edges=spec.edges,
        directed=spec.directed,
        order=order,
        table_rows=rows,
        formula_latex=r"\mathrm{BFS}: Q \leftarrow \text{frontier queue}",
        answer_text=f"BFS 遍历顺序：{' -> '.join(order)}",
    )


def _solve_dfs(spec: AlgorithmGraphProblemSpec) -> GraphAlgorithmSolution:
    adjacency = _adjacency(spec)
    start = _require(spec.start)
    order: list[str] = []
    rows: list[list[str]] = []

    def visit(node: str, depth: int) -> None:
        order.append(node)
        rows.append([node, str(depth), ", ".join(order)])
        for neighbor, _weight in adjacency[node]:
            if neighbor not in order:
                visit(neighbor, depth + 1)

    visit(start, 0)
    return GraphAlgorithmSolution(
        kind=spec.kind,
        nodes=spec.nodes,
        edges=spec.edges,
        directed=spec.directed,
        order=order,
        table_rows=rows,
        formula_latex=r"\mathrm{DFS}: \text{visit before backtrack}",
        answer_text=f"DFS 遍历顺序：{' -> '.join(order)}",
    )


def _solve_dijkstra(spec: AlgorithmGraphProblemSpec) -> GraphAlgorithmSolution:
    if any((edge.weight or 0) < 0 for edge in spec.edges):
        raise ValueError("negative weights are unsupported for Dijkstra")
    adjacency = _adjacency(spec)
    start = _require(spec.start)
    target = _require(spec.target)
    distances = {node: inf for node in spec.nodes}
    previous: dict[str, str | None] = {node: None for node in spec.nodes}
    distances[start] = 0.0
    heap: list[tuple[float, int, str]] = [(0.0, spec.nodes.index(start), start)]
    visited: set[str] = set()
    rows: list[list[str]] = []

    while heap:
        distance, _order, node = heapq.heappop(heap)
        if node in visited:
            continue
        visited.add(node)
        rows.append([node, _display_number(distance), _display_frontier(heap)])
        if node == target:
            break
        for neighbor, weight in adjacency[node]:
            edge_weight = 1 if weight is None else weight
            candidate = distance + float(edge_weight)
            if candidate < distances[neighbor]:
                distances[neighbor] = candidate
                previous[neighbor] = node
                heapq.heappush(heap, (candidate, spec.nodes.index(neighbor), neighbor))

    if distances[target] == inf:
        raise ValueError("target is unreachable")
    path = _reconstruct_path(previous, target)
    return GraphAlgorithmSolution(
        kind=spec.kind,
        nodes=spec.nodes,
        edges=spec.edges,
        directed=spec.directed,
        path=path,
        distances={node: _clean_number(value) for node, value in distances.items() if value < inf},
        table_rows=rows,
        formula_latex=r"d(v)=\min(d(v), d(u)+w(u,v))",
        answer_text=f"最短路径：{' -> '.join(path)}，距离 {_display_number(distances[target])}",
    )


def _solve_topological_sort(spec: AlgorithmGraphProblemSpec) -> GraphAlgorithmSolution:
    adjacency = _adjacency(spec)
    indegree = {node: 0 for node in spec.nodes}
    for edge in spec.edges:
        indegree[edge.target] += 1
    queue: deque[str] = deque([node for node in spec.nodes if indegree[node] == 0])
    order: list[str] = []
    rows: list[list[str]] = []

    while queue:
        node = queue.popleft()
        order.append(node)
        released: list[str] = []
        for neighbor, _weight in adjacency[node]:
            indegree[neighbor] -= 1
            if indegree[neighbor] == 0:
                queue.append(neighbor)
                released.append(neighbor)
        rows.append([node, ", ".join(order), ", ".join(released) or "-"])

    if len(order) != len(spec.nodes):
        raise ValueError("topological sort requires an acyclic directed graph")
    return GraphAlgorithmSolution(
        kind=spec.kind,
        nodes=spec.nodes,
        edges=spec.edges,
        directed=True,
        order=order,
        table_rows=rows,
        formula_latex=r"\text{repeatedly remove in-degree }0\text{ nodes}",
        answer_text=f"拓扑序：{' -> '.join(order)}",
    )


def _adjacency(spec: AlgorithmGraphProblemSpec) -> dict[str, list[tuple[str, float | None]]]:
    adjacency: dict[str, list[tuple[str, float | None]]] = {node: [] for node in spec.nodes}
    for edge in spec.edges:
        adjacency[edge.source].append((edge.target, edge.weight))
        if not spec.directed:
            adjacency[edge.target].append((edge.source, edge.weight))
    node_index = {node: index for index, node in enumerate(spec.nodes)}
    for neighbors in adjacency.values():
        neighbors.sort(key=lambda item: node_index[item[0]])
    return adjacency


def _require(value: str | None) -> str:
    if value is None:
        raise ValueError("required node is missing")
    return value


def _reconstruct_path(previous: dict[str, str | None], target: str) -> list[str]:
    path: list[str] = []
    current: str | None = target
    while current is not None:
        path.append(current)
        current = previous[current]
    path.reverse()
    return path


def _display_frontier(heap: list[tuple[float, int, str]]) -> str:
    if not heap:
        return "-"
    return ", ".join(
        f"{node}:{_display_number(distance)}" for distance, _index, node in sorted(heap)
    )


def _display_number(value: float) -> str:
    cleaned = _clean_number(value)
    return str(cleaned)


def _clean_number(value: float) -> int | float:
    if value == int(value):
        return int(value)
    return round(value, 6)
