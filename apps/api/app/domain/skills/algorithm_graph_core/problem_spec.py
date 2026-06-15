from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

GraphAlgorithmKind = Literal["bfs", "dfs", "dijkstra", "topological_sort"]


class GraphEdgeSpec(BaseModel):
    source: str
    target: str
    weight: float | None = None


class AlgorithmGraphProblemSpec(BaseModel):
    kind: GraphAlgorithmKind
    nodes: list[str] = Field(default_factory=list)
    edges: list[GraphEdgeSpec] = Field(default_factory=list)
    start: str | None = None
    target: str | None = None
    directed: bool = False

    @model_validator(mode="after")
    def validate_graph_spec(self) -> "AlgorithmGraphProblemSpec":
        if not self.nodes:
            raise ValueError("nodes are required")
        if len(self.nodes) > 12:
            raise ValueError("graph has more than 12 nodes")
        if not self.edges:
            raise ValueError("edges are required")
        node_set = set(self.nodes)
        for edge in self.edges:
            if edge.source not in node_set or edge.target not in node_set:
                raise ValueError("edge references unknown node")
        if self.kind in {"bfs", "dfs", "dijkstra"}:
            if self.start is None:
                raise ValueError("start node is required")
            if self.start not in node_set:
                raise ValueError("start node is not in graph")
        if self.kind == "dijkstra":
            if self.target is None:
                raise ValueError("target node is required")
            if self.target not in node_set:
                raise ValueError("target node is not in graph")
        return self

