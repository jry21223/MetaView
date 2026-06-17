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
            voiceover_text=_voiceover_text(index, snapshot.kind, solution),
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
    rule = MathFormulaSnapshot(
        formula_latex=solution.formula_latex or r"\text{graph algorithm}",
        caption=_rule_caption(solution.kind),
        highlights=[solution.formula_latex] if solution.formula_latex else [],
    )
    table = TableSceneSnapshot(
        columns=_table_columns(solution.kind),
        rows=solution.table_rows,
        active_rows=[max(0, len(solution.table_rows) - 1)] if solution.table_rows else [],
        caption=_table_caption(solution.kind),
    )
    result = MathFormulaSnapshot(
        formula_latex=_result_formula_latex(solution),
        caption=solution.answer_text,
        highlights=[solution.answer_text] if solution.answer_text else [],
    )
    return [graph, rule, table, result]


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


def _rule_caption(kind: str) -> str:
    return {
        "bfs": "队列保存下一层边界，出队后再加入未访问邻居。",
        "dfs": "先沿一条分支走到底，再按递归栈回退。",
        "dijkstra": "每次选择当前距离最小的未确定节点，再松弛边。",
        "topological_sort": "每次取出入度为 0 的节点，并释放后继节点。",
    }.get(kind, "先明确算法不变量，再逐步更新状态。")


def _voiceover_text(index: int, kind: str, solution: GraphAlgorithmSolution) -> str:
    order = solution.path or solution.order
    order_text = " -> ".join(order) if order else "待计算"
    first = order[0] if order else "起点"
    if kind == "graph_scene":
        return (
            f"先看图结构：从 {first} 开始，节点高亮展示算法会关注的访问路线，"
            "我们先把图关系看清楚。"
        )
    if kind == "table_scene":
        return (
            f"过程表逐行记录当前节点和状态变化；到这一轮时，顺序已经推进为 {order_text}，"
            "重点检查队列或候选集合。"
        )
    if index == 1:
        return (
            f"{_rule_caption(solution.kind)} 这一步先抓住规则，再看每一行状态为什么这样更新。"
        )
    return (
        f"最后得到结论：{solution.answer_text}。你可以反过来检查每一步是否都遵守了刚才的规则。"
    )


def _result_formula_latex(solution: GraphAlgorithmSolution) -> str:
    sequence = solution.path or solution.order
    if sequence:
        return r"\mathrm{Result}: " + r" \rightarrow ".join(sequence)
    return solution.formula_latex or r"\text{graph algorithm result}"


def _title(index: int, kind: str) -> str:
    if kind == "graph_scene":
        return "图结构"
    if kind == "table_scene":
        return "过程表"
    if index == 1:
        return "算法规则"
    return "结果"


def _playbook_title(kind: str) -> str:
    return {
        "bfs": "BFS 图遍历",
        "dfs": "DFS 图遍历",
        "dijkstra": "Dijkstra 最短路径",
        "topological_sort": "拓扑排序",
    }.get(kind, "图算法讲解")
