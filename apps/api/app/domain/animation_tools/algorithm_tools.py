"""Algorithm animation tools."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.domain.animation_tools.registry import register
from app.domain.models.cir import LayerKind, LayerSpec, LayerTimingSpec, NarrationCardSpec
from app.domain.models.playbook import GraphSceneEdge, GraphSceneNode, GraphSceneSnapshot


class GraphTraversalEdgeArgs(BaseModel):
    source: str = Field(min_length=1)
    target: str = Field(min_length=1)
    label: str | None = None
    weight: float | None = None


class AlgorithmGraphTraversalArgs(BaseModel):
    nodes: list[str] = Field(min_length=1)
    edges: list[GraphTraversalEdgeArgs] = Field(default_factory=list)
    active_node_ids: list[str] = Field(default_factory=list)
    active_edge_ids: list[str] = Field(default_factory=list)
    directed: bool = False
    weighted: bool = False
    caption: str | None = None


@register("algorithm.graph_traversal")
def graph_traversal(args: dict) -> list[LayerSpec]:
    parsed = AlgorithmGraphTraversalArgs.model_validate(args)
    snapshot = GraphSceneSnapshot(
        nodes=[
            GraphSceneNode(
                id=node,
                label=node,
                emphasis="primary" if node in parsed.active_node_ids else "secondary",
            )
            for node in parsed.nodes
        ],
        edges=[
            GraphSceneEdge(
                source=edge.source,
                target=edge.target,
                label=edge.label,
                weight=edge.weight,
                emphasis=(
                    "accent"
                    if f"{edge.source}->{edge.target}" in parsed.active_edge_ids
                    else "secondary"
                ),
            )
            for edge in parsed.edges
        ],
        directed=parsed.directed,
        weighted=parsed.weighted,
        active_node_ids=parsed.active_node_ids,
        active_edge_ids=parsed.active_edge_ids,
        caption=parsed.caption,
    )
    layers = [
        LayerSpec(
            kind=LayerKind.GRAPH_SCENE,
            graph_scene=snapshot,
            timing=LayerTimingSpec(z_order=0),
        )
    ]
    if parsed.caption:
        layers.append(
            LayerSpec(
                kind=LayerKind.NARRATION_CARD,
                timing=LayerTimingSpec(enter_at=0.2, exit_at=1.0, z_order=1),
                narration_card=NarrationCardSpec(text=parsed.caption, position="bottom"),
            )
        )
    return layers
