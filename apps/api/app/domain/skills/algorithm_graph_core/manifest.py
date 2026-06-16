from __future__ import annotations

from app.domain.skills.base import SkillCapability, SkillManifest

ALGORITHM_GRAPH_CORE_MANIFEST = SkillManifest(
    skill_id="algorithm_graph_core",
    domain="algorithm",
    name="Graph Algorithm Core",
    description=(
        "Deterministic graph traversal and shortest-path skill for small classroom "
        "graphs using existing graph/table/math snapshots."
    ),
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="algorithm_graph_core.bfs",
            description="Stable breadth-first traversal from a specified start node.",
            examples=["用 BFS 遍历图 A-B, A-C, B-D，从 A 开始"],
            output_schema="AlgorithmGraphProblemSpec",
        ),
        SkillCapability(
            capability_id="algorithm_graph_core.dfs",
            description="Stable depth-first traversal from a specified start node.",
            examples=["用 DFS 遍历图 A-B, A-C, B-D，从 A 开始"],
            output_schema="AlgorithmGraphProblemSpec",
        ),
        SkillCapability(
            capability_id="algorithm_graph_core.dijkstra",
            description="Dijkstra shortest path on directed graphs with nonnegative weights.",
            examples=["解释 Dijkstra：A->B=2, B->C=1，求 A 到 C 最短路"],
            output_schema="AlgorithmGraphProblemSpec",
        ),
        SkillCapability(
            capability_id="algorithm_graph_core.topological_sort",
            description="Stable topological ordering for directed acyclic graphs.",
            examples=["对有向图 A->B, A->C, B->D 做拓扑排序"],
            output_schema="AlgorithmGraphProblemSpec",
        ),
    ],
    unsupported_notes=[
        "Graphs larger than 12 nodes are intentionally not handled.",
        "Dijkstra requests with negative weights fall back instead of switching algorithms.",
        "Topological sort requests with cycles fall back with a reason.",
        "The skill does not generate final answers during routing.",
    ],
)
