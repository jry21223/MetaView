from __future__ import annotations

from typing import Any

from app.domain.models.playbook import (
    BioCellCallout,
    BioCellSceneSnapshot,
    BioCellStructure,
    CodeHighlightOverlay,
    GeoMapFlow,
    GeoMapLayer,
    GeoMapSceneSnapshot,
    GeoPressureCenter,
    GraphSceneEdge,
    GraphSceneNode,
    GraphSceneSnapshot,
    Layer,
    LayerTiming,
    MathPlotCurve,
    MathPlotSnapshot,
    MetaStep,
    Molecule2DAtom,
    Molecule2DBond,
    Molecule2DCallout,
    Molecule2DSceneSnapshot,
    PhysicsForceSceneSnapshot,
    PhysicsSceneObject,
    PhysicsSceneVector,
    PlaybookScript,
)
from app.domain.models.topic import TopicDomain

_FPS = 30
_DEFAULT_FRAMES = 90


def compile_scene_blueprint_to_playbook(blueprint: dict[str, Any]) -> PlaybookScript:
    scene_type = _required_str(blueprint, "sceneType")
    title = str(blueprint.get("title") or scene_type.replace("_", " ").title())
    duration_frames = _duration_frames(blueprint)
    snapshot = _compile_snapshot(scene_type, blueprint)
    code_highlight = _code_highlight(scene_type, blueprint)

    step = MetaStep(
        step_id=str(blueprint.get("id") or scene_type),
        end_frame=duration_frames,
        title=title,
        voiceover_text=getattr(snapshot, "caption", None) or title,
        animation_hint=snapshot.kind,
        snapshot=snapshot,
        layers=[Layer(timing=LayerTiming(), body=snapshot)],
        code_highlight=code_highlight,
        tokens=[],
    )
    visual_intent = [str(item) for item in blueprint.get("visualIntent") or []]
    emphasis_points = [str(item) for item in blueprint.get("emphasisPoints") or []]
    return PlaybookScript(
        fps=_FPS,
        total_frames=duration_frames,
        domain=TopicDomain(_required_str(blueprint, "subject")),
        title=title,
        summary=str(blueprint.get("caption") or title),
        steps=[step],
        parameter_controls=[],
        algorithm_id=scene_type,
        initial_data={
            "scene_blueprint": [scene_type],
            "visual_intent": visual_intent,
            "emphasis_points": emphasis_points,
        },
    )


def _required_str(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"SceneBlueprint requires a non-empty {key}.")
    return value


def _duration_frames(blueprint: dict[str, Any]) -> int:
    duration_frames = blueprint.get("durationFrames")
    if isinstance(duration_frames, int | float):
        return max(1, round(duration_frames))
    duration_seconds = blueprint.get("durationSeconds")
    if isinstance(duration_seconds, int | float):
        return max(1, round(duration_seconds * _FPS))
    return _DEFAULT_FRAMES


def _compile_snapshot(scene_type: str, blueprint: dict[str, Any]):
    if scene_type == "east_asia_monsoon":
        return _east_asia_monsoon_snapshot(blueprint)
    if scene_type == "projectile_motion":
        return _projectile_motion_snapshot(blueprint)
    if scene_type == "cell_structure":
        return _cell_structure_snapshot(blueprint)
    if scene_type == "molecule_2d_water":
        return _water_molecule_snapshot(blueprint)
    if scene_type == "derivative_tangent":
        return _derivative_tangent_snapshot(blueprint)
    if scene_type == "bfs_graph":
        return _bfs_graph_snapshot(blueprint)
    raise ValueError(f"Unsupported SceneBlueprint sceneType: {scene_type}")


def _east_asia_monsoon_snapshot(blueprint: dict[str, Any]) -> GeoMapSceneSnapshot:
    return GeoMapSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "geography-earth-basic"),
        map_region="east_asia",
        layers=[
            GeoMapLayer(
                id="map",
                semantic_role="map_layer",
                label="East Asia map",
                asset_id="east-asia-land-110m",
            ),
            GeoMapLayer(id="land", semantic_role="land", label="heated continent"),
            GeoMapLayer(
                id="ocean",
                semantic_role="ocean",
                label="western Pacific",
                asset_id="east-asia-ocean-background",
            ),
        ],
        flows=[
            GeoMapFlow(
                id="summer-monsoon",
                semantic_role="monsoon_flow",
                **{"from": (78, 68)},
                to=(42, 38),
                label="summer monsoon",
                asset_id="monsoon-wind-arrow",
                strength=1.1,
            ),
        ],
        pressure_centers=[
            GeoPressureCenter(id="land-low", kind="low", x=38, y=35, label="land low"),
            GeoPressureCenter(id="ocean-high", kind="high", x=76, y=64, label="ocean high"),
        ],
        particle_preset="moisture_particles",
        caption=str(
            blueprint.get("caption")
            or "Land-sea thermal contrast reverses seasonal wind direction."
        ),
    )


def _projectile_motion_snapshot(blueprint: dict[str, Any]) -> PhysicsForceSceneSnapshot:
    return PhysicsForceSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "physics-basic"),
        objects=[
            PhysicsSceneObject(
                id="body", label="projectile", x=30, y=42, asset_id="projectile-body-dot"
            ),
        ],
        vectors=[
            PhysicsSceneVector(
                id="vx", target="body", semantic_role="velocity", dx=28, dy=0, label="v_x"
            ),
            PhysicsSceneVector(
                id="vy", target="body", semantic_role="velocity", dx=0, dy=18, label="v_y"
            ),
            PhysicsSceneVector(
                id="g", target="body", semantic_role="acceleration", dx=0, dy=24, label="g"
            ),
            PhysicsSceneVector(
                id="force", target="body", semantic_role="force", dx=-16, dy=8, label="F"
            ),
        ],
        trajectory=[(18, 34), (31.5, 36.8), (45, 45), (58.5, 58.8), (72, 78)],
        formula_latex="x=v_0t,\\quad y=\\frac12gt^2",
        caption=str(
            blueprint.get("caption")
            or "Horizontal velocity stays constant while vertical acceleration bends the path."
        ),
    )


def _cell_structure_snapshot(blueprint: dict[str, Any]) -> BioCellSceneSnapshot:
    return BioCellSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "biology-basic"),
        cell_type="animal",
        structures=[
            BioCellStructure(
                id="cell",
                semantic_role="cell",
                label="cell membrane",
                x=50,
                y=52,
                width=66,
                height=50,
                asset_id="cell-outline",
            ),
            BioCellStructure(
                id="nucleus",
                semantic_role="nucleus",
                label="nucleus",
                x=47,
                y=48,
                width=20,
                height=18,
                asset_id="nucleus",
            ),
            BioCellStructure(
                id="mitochondrion",
                semantic_role="mitochondrion",
                label="mitochondrion",
                x=67,
                y=59,
                width=16,
                height=10,
                asset_id="mitochondrion",
            ),
            BioCellStructure(
                id="ribosome",
                semantic_role="ribosome",
                label="ribosome",
                x=36,
                y=61,
                width=8,
                height=7,
                asset_id="ribosome",
            ),
            BioCellStructure(
                id="dna",
                semantic_role="dna",
                label="DNA",
                x=47,
                y=48,
                width=8,
                height=12,
                asset_id="dna-helix",
            ),
        ],
        callouts=[
            BioCellCallout(
                id="nucleus-callout", target_id="nucleus", label="stores DNA", side="left"
            ),
            BioCellCallout(
                id="mitochondrion-callout",
                target_id="mitochondrion",
                label="releases energy",
                side="right",
            ),
        ],
        caption=str(
            blueprint.get("caption")
            or "Animal cells contain specialized organelles with distinct functions."
        ),
    )


def _water_molecule_snapshot(blueprint: dict[str, Any]) -> Molecule2DSceneSnapshot:
    return Molecule2DSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "chemistry-basic"),
        molecule_id="water",
        molecule_asset_id="water-molecule-preset",
        atoms=[
            Molecule2DAtom(id="o", element="O", x=50, y=42, asset_id="atom-core", label="oxygen"),
            Molecule2DAtom(
                id="h1", element="H", x=35, y=62, asset_id="atom-core", label="hydrogen"
            ),
            Molecule2DAtom(
                id="h2", element="H", x=65, y=62, asset_id="atom-core", label="hydrogen"
            ),
        ],
        bonds=[
            Molecule2DBond(id="oh1", **{"from": "o"}, to="h1", order=1, asset_id="bond-line"),
            Molecule2DBond(id="oh2", **{"from": "o"}, to="h2", order=1, asset_id="bond-line"),
        ],
        callouts=[
            Molecule2DCallout(id="bent-shape", target_id="o", label="bent geometry", side="top"),
            Molecule2DCallout(id="polar-bond", target_id="h2", label="polar bonds", side="right"),
        ],
        formula_latex="H_2O",
        caption=str(
            blueprint.get("caption")
            or "Water is a bent polar molecule built from structured atom and bond data."
        ),
    )


def _derivative_tangent_snapshot(blueprint: dict[str, Any]) -> MathPlotSnapshot:
    return MathPlotSnapshot(
        pack_id=str(blueprint.get("packId") or "math-basic"),
        asset_id="derivative-tangent-preset",
        curves=[
            MathPlotCurve(
                expression="x^2", label="f(x)=x^2", emphasis="primary", semantic_role="curve"
            ),
            MathPlotCurve(
                expression="2*x - 1",
                label="tangent slope = 2",
                emphasis="accent",
                semantic_role="tangent",
            ),
        ],
        x_min=-1,
        x_max=3,
        y_min=-1,
        y_max=5,
        marker_x=1,
        shade_from=0.85,
        shade_to=1.15,
        x_label="x",
        y_label="f(x)",
        formula_latex="f'(1)=2",
        caption=str(
            blueprint.get("caption") or "The derivative at x=1 is the slope of the tangent line."
        ),
    )


def _bfs_graph_snapshot(blueprint: dict[str, Any]) -> GraphSceneSnapshot:
    return GraphSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "algorithm-code-basic"),
        asset_id="bfs-graph-preset",
        nodes=[
            GraphSceneNode(id="S", label="S", x=-3, y=0),
            GraphSceneNode(id="A", label="A", x=-1, y=0),
            GraphSceneNode(id="B", label="B", x=1.1, y=-1.3),
            GraphSceneNode(id="C", label="C", x=1.1, y=1.3),
            GraphSceneNode(id="D", label="D", x=3, y=0),
        ],
        edges=[
            GraphSceneEdge(id="S-A", source="S", target="A"),
            GraphSceneEdge(id="A-B", source="A", target="B"),
            GraphSceneEdge(id="A-C", source="A", target="C"),
            GraphSceneEdge(id="B-D", source="B", target="D"),
            GraphSceneEdge(id="C-D", source="C", target="D"),
        ],
        directed=True,
        current_node_id="A",
        active_node_ids=["A"],
        visited_node_ids=["S"],
        queue_node_ids=["B", "C"],
        active_edge_ids=["A-B"],
        caption=str(
            blueprint.get("caption")
            or "BFS expands the current node and appends unvisited neighbors to the queue."
        ),
    )


def _code_highlight(scene_type: str, blueprint: dict[str, Any]) -> CodeHighlightOverlay | None:
    if scene_type != "bfs_graph":
        return None
    visual_intent = ", ".join(str(item) for item in blueprint.get("visualIntent") or [])
    return CodeHighlightOverlay(
        language="typescript",
        lines=[
            "function BFS(start) {",
            "  const queue = [start];",
            "  const visited = new Set([start]);",
            "  const node = queue.shift();",
            "  for (const next of graph[node]) {",
            "    if (!visited.has(next)) queue.push(next);",
            "  }",
            "}",
        ],
        active_lines=[4, 5, 6],
        active_line=6,
        variables={
            "intent": visual_intent,
            "current": "A",
            "queue": "[B, C]",
            "visited": "{S, A}",
        },
        operation_label="enqueue neighbors",
    )
