from __future__ import annotations

import math

from app.domain.models.playbook import (
    GraphSceneEdge,
    GraphSceneNode,
    GraphSceneSnapshot,
    Layer,
    LayerTiming,
    MathFormulaSnapshot,
    MetaStep,
    PlaybookScript,
    TableSceneSnapshot,
)
from app.domain.models.topic import TopicDomain
from app.domain.skills.algorithm_graph_core.graph_kernel import GraphAlgorithmSolution

_FPS = 30
_STEP_FRAMES = 90


def build_algorithm_graph_playbook(
    run_id: str,  # noqa: ARG001
    solution: GraphAlgorithmSolution,
) -> PlaybookScript:
    snapshots = _snapshots(solution)
    steps = [
        MetaStep(
            step_id=f"algorithm_graph_core_{index + 1:02d}",
            end_frame=(index + 1) * _STEP_FRAMES,
            title=_title(index, snapshot.kind),
            voiceover_text=getattr(snapshot, "caption", None) or solution.answer_text,
            animation_hint=snapshot.kind,
            snapshot=snapshot,
            layers=[Layer(timing=LayerTiming(), body=snapshot)],
            tokens=[],
        )
        for index, snapshot in enumerate(snapshots)
    ]
    return PlaybookScript(
        fps=_FPS,
        total_frames=len(steps) * _STEP_FRAMES,
        domain=TopicDomain.ALGORITHM,
        title=_playbook_title(solution.kind),
        summary="使用确定性图算法 kernel 生成可渲染步骤。",
        steps=steps,
        parameter_controls=[],
        algorithm_id=solution.kind,
        initial_data={"nodes": solution.nodes},
    )


def _snapshots(
    solution: GraphAlgorithmSolution,
) -> list[GraphSceneSnapshot | TableSceneSnapshot | MathFormulaSnapshot]:
    graph = _graph_snapshot(solution)
    table = TableSceneSnapshot(
        columns=_table_columns(solution.kind),
        rows=solution.table_rows,
        active_rows=[max(0, len(solution.table_rows) - 1)] if solution.table_rows else [],
        caption=_table_caption(solution.kind),
    )
    formula = MathFormulaSnapshot(
        formula_latex=solution.formula_latex or r"\text{graph algorithm}",
        caption=solution.answer_text,
        highlights=[solution.formula_latex] if solution.formula_latex else [],
    )
    return [graph, table, formula]


def _graph_snapshot(solution: GraphAlgorithmSolution) -> GraphSceneSnapshot:
    positions = _node_positions(solution.nodes)
    active_nodes = solution.path or solution.order
    active_edge_ids = _active_edge_ids(solution, active_nodes)
    return GraphSceneSnapshot(
        nodes=[
            GraphSceneNode(
                id=node,
                label=node,
                x=positions[node][0],
                y=positions[node][1],
                emphasis="primary" if node in active_nodes else "secondary",
            )
            for node in solution.nodes
        ],
        edges=[
            GraphSceneEdge(
                source=edge.source,
                target=edge.target,
                label=str(_clean_weight(edge.weight)) if edge.weight is not None else None,
                weight=edge.weight,
                emphasis=(
                    "accent"
                    if _edge_id(edge.source, edge.target) in active_edge_ids
                    else "secondary"
                ),
            )
            for edge in solution.edges
        ],
        directed=solution.directed,
        weighted=any(edge.weight is not None for edge in solution.edges),
        active_node_ids=active_nodes,
        active_edge_ids=active_edge_ids,
        caption=solution.answer_text,
    )


def _node_positions(nodes: list[str]) -> dict[str, tuple[float, float]]:
    count = len(nodes)
    radius = 2.4
    if count == 1:
        return {nodes[0]: (0.0, 0.0)}
    return {
        node: (
            round(radius * math.cos((2 * math.pi * index / count) - math.pi / 2), 3),
            round(radius * math.sin((2 * math.pi * index / count) - math.pi / 2), 3),
        )
        for index, node in enumerate(nodes)
    }


def _active_edge_ids(solution: GraphAlgorithmSolution, active_nodes: list[str]) -> list[str]:
    ids: list[str] = []
    for source, target in zip(active_nodes, active_nodes[1:], strict=False):
        if _has_edge(solution, source, target):
            ids.append(_edge_id(source, target))
        elif not solution.directed and _has_edge(solution, target, source):
            ids.append(_edge_id(target, source))
    return ids


def _has_edge(solution: GraphAlgorithmSolution, source: str, target: str) -> bool:
    return any(edge.source == source and edge.target == target for edge in solution.edges)


def _edge_id(source: str, target: str) -> str:
    return f"{source}->{target}"


def _clean_weight(weight: float | None) -> int | float | None:
    if weight is None:
        return None
    if weight == int(weight):
        return int(weight)
    return round(weight, 6)


def _table_columns(kind: str) -> list[str]:
    if kind == "bfs":
        return ["当前节点", "已访问顺序", "新入队", "队列"]
    if kind == "dfs":
        return ["当前节点", "深度", "已访问顺序"]
    if kind == "dijkstra":
        return ["确定节点", "最短距离", "候选堆"]
    return ["取出节点", "拓扑序", "释放节点"]


def _table_caption(kind: str) -> str:
    return {
        "bfs": "按队列先进先出记录 BFS 的访问过程。",
        "dfs": "按递归深度记录 DFS 的访问过程。",
        "dijkstra": "每次确定当前最小距离节点并松弛相邻边。",
        "topological_sort": "不断取出入度为 0 的节点形成拓扑序。",
    }.get(kind, "记录图算法过程。")


def _title(index: int, kind: str) -> str:
    if kind == "graph_scene":
        return "图结构"
    if kind == "table_scene":
        return "过程表"
    return ["算法规则", "过程说明", "结果"][min(index, 2)]


def _playbook_title(kind: str) -> str:
    return {
        "bfs": "BFS 图遍历",
        "dfs": "DFS 图遍历",
        "dijkstra": "Dijkstra 最短路径",
        "topological_sort": "拓扑排序",
    }.get(kind, "图算法讲解")
