import type {
  BioCellSceneSnapshot,
  CodeHighlightOverlay,
  GeoMapSceneSnapshot,
  GraphSceneSnapshot,
  MathPlotSnapshot,
  Molecule2DSceneSnapshot,
  PhysicsForceSceneSnapshot,
  PlaybookScript,
} from "../types";

export type SubjectVisualFixtureId =
  | "bfs_graph"
  | "cell_structure"
  | "derivative_tangent"
  | "east_asia_monsoon"
  | "molecule_2d_water"
  | "projectile_motion";

function cellStructureSnapshot(): BioCellSceneSnapshot {
  return {
    kind: "bio_cell_scene",
    pack_id: "biology-basic",
    cell_type: "animal",
    structures: [
      { id: "cell", semantic_role: "cell", label: "cell membrane", x: 50, y: 52, width: 66, height: 50, asset_id: "cell-outline" },
      { id: "nucleus", semantic_role: "nucleus", label: "nucleus", x: 47, y: 48, width: 20, height: 18, asset_id: "nucleus" },
      { id: "mitochondrion", semantic_role: "mitochondrion", label: "mitochondrion", x: 67, y: 59, width: 16, height: 10, asset_id: "mitochondrion" },
      { id: "ribosome", semantic_role: "ribosome", label: "ribosome", x: 36, y: 61, width: 8, height: 7, asset_id: "ribosome" },
      { id: "dna", semantic_role: "dna", label: "DNA", x: 47, y: 48, width: 8, height: 12, asset_id: "dna-helix" },
    ],
    callouts: [
      { id: "nucleus-callout", target_id: "nucleus", label: "stores DNA", side: "left" },
      { id: "mitochondrion-callout", target_id: "mitochondrion", label: "releases energy", side: "right" },
    ],
    caption: "Animal cells contain specialized organelles with distinct functions.",
  };
}

function bfsGraphSnapshot(): GraphSceneSnapshot {
  return {
    kind: "graph_scene",
    pack_id: "algorithm-code-basic",
    asset_id: "bfs-graph-preset",
    nodes: [
      { id: "S", label: "S", x: -3, y: 0 },
      { id: "A", label: "A", x: -1, y: 0 },
      { id: "B", label: "B", x: 1.1, y: -1.3 },
      { id: "C", label: "C", x: 1.1, y: 1.3 },
      { id: "D", label: "D", x: 3, y: 0 },
    ],
    edges: [
      { id: "S-A", source: "S", target: "A" },
      { id: "A-B", source: "A", target: "B" },
      { id: "A-C", source: "A", target: "C" },
      { id: "B-D", source: "B", target: "D" },
      { id: "C-D", source: "C", target: "D" },
    ],
    directed: true,
    current_node_id: "A",
    active_node_ids: ["A"],
    visited_node_ids: ["S"],
    queue_node_ids: ["B", "C"],
    active_edge_ids: ["A-B"],
    caption: "BFS expands the current node and appends unvisited neighbors to the queue.",
  };
}

function bfsCodeHighlight(): CodeHighlightOverlay {
  return {
    language: "typescript",
    lines: [
      "function BFS(start) {",
      "  const queue = [start];",
      "  const visited = new Set([start]);",
      "  const node = queue.shift();",
      "  for (const next of graph[node]) {",
      "    if (!visited.has(next)) queue.push(next);",
      "  }",
      "}",
    ],
    active_lines: [4, 5, 6],
    active_line: 6,
    variables: {
      current: "A",
      queue: "[B, C]",
      visited: "{S, A}",
    },
    operation_label: "enqueue neighbors",
  };
}

function eastAsiaMonsoonSnapshot(): GeoMapSceneSnapshot {
  return {
    kind: "geo_map_scene",
    pack_id: "geography-earth-basic",
    map_region: "east_asia",
    layers: [
      { id: "map", semantic_role: "map_layer", label: "East Asia map", asset_id: "east-asia-land-110m" },
      { id: "land", semantic_role: "land", label: "heated continent" },
      { id: "ocean", semantic_role: "ocean", label: "western Pacific" },
    ],
    flows: [
      {
        id: "summer-monsoon",
        semantic_role: "monsoon_flow",
        from: [78, 68],
        to: [42, 38],
        label: "summer monsoon",
        asset_id: "monsoon-wind-arrow",
        strength: 1.1,
      },
    ],
    pressure_centers: [
      { id: "land-low", kind: "low", x: 38, y: 35, label: "land low" },
      { id: "ocean-high", kind: "high", x: 76, y: 64, label: "ocean high" },
    ],
    particle_preset: "moisture_particles",
    caption: "Land-sea thermal contrast reverses seasonal wind direction.",
  };
}

function molecule2DWaterSnapshot(): Molecule2DSceneSnapshot {
  return {
    kind: "molecule_2d_scene",
    pack_id: "chemistry-basic",
    molecule_id: "water",
    molecule_asset_id: "water-molecule-preset",
    atoms: [
      { id: "o", element: "O", x: 50, y: 42, asset_id: "atom-core", label: "oxygen" },
      { id: "h1", element: "H", x: 35, y: 62, asset_id: "atom-core", label: "hydrogen" },
      { id: "h2", element: "H", x: 65, y: 62, asset_id: "atom-core", label: "hydrogen" },
    ],
    bonds: [
      { id: "oh1", from: "o", to: "h1", order: 1, asset_id: "bond-line" },
      { id: "oh2", from: "o", to: "h2", order: 1, asset_id: "bond-line" },
    ],
    callouts: [
      { id: "bent-shape", target_id: "o", label: "bent geometry", side: "top" },
      { id: "polar-bond", target_id: "h2", label: "polar bonds", side: "right" },
    ],
    formula_latex: "H_2O",
    caption: "Water is a bent polar molecule built from structured atom and bond data.",
  };
}

function derivativeTangentSnapshot(): MathPlotSnapshot {
  return {
    kind: "math_plot",
    pack_id: "math-basic",
    asset_id: "derivative-tangent-preset",
    curves: [
      { expression: "x^2", label: "f(x)=x^2", emphasis: "primary", semantic_role: "curve" },
      { expression: "2*x - 1", label: "tangent slope = 2", emphasis: "accent", semantic_role: "tangent" },
    ],
    x_min: -1,
    x_max: 3,
    y_min: -1,
    y_max: 5,
    marker_x: 1,
    shade_from: 0.85,
    shade_to: 1.15,
    x_label: "x",
    y_label: "f(x)",
    formula_latex: "f'(1)=2",
    caption: "The derivative at x=1 is the slope of the tangent line.",
  };
}

function projectileMotionSnapshot(): PhysicsForceSceneSnapshot {
  return {
    kind: "physics_force_scene",
    pack_id: "physics-basic",
    objects: [
      { id: "body", label: "projectile", x: 30, y: 42, asset_id: "projectile-body-dot" },
    ],
    vectors: [
      { id: "vx", target: "body", semantic_role: "velocity", dx: 28, dy: 0, label: "v_x" },
      { id: "vy", target: "body", semantic_role: "velocity", dx: 0, dy: 18, label: "v_y" },
      { id: "g", target: "body", semantic_role: "acceleration", dx: 0, dy: 24, label: "g" },
      { id: "force", target: "body", semantic_role: "force", dx: -16, dy: 8, label: "F" },
    ],
    trajectory: [[18, 34], [32, 42], [50, 57], [72, 78]],
    formula_latex: "x=v_0t,\\quad y=\\frac12gt^2",
    caption: "Horizontal velocity stays constant while vertical acceleration bends the path.",
  };
}

function scriptFor(
  id: SubjectVisualFixtureId,
  domain: "algorithm" | "biology" | "chemistry" | "geography" | "math" | "physics",
  title: string,
  snapshot: BioCellSceneSnapshot | GeoMapSceneSnapshot | GraphSceneSnapshot | MathPlotSnapshot | Molecule2DSceneSnapshot | PhysicsForceSceneSnapshot,
  codeHighlight?: CodeHighlightOverlay | null,
): PlaybookScript {
  return {
    schema_version: "1.0.0",
    fps: 30,
    total_frames: 90,
    domain,
    title,
    summary: title,
    parameter_controls: [],
    steps: [
      {
        step_id: id,
        end_frame: 90,
        title,
        voiceover_text: snapshot.caption ?? title,
        snapshot,
        code_highlight: codeHighlight ?? null,
        tokens: [],
      },
    ],
  };
}

export const subjectVisualFixtures: Record<SubjectVisualFixtureId, PlaybookScript> = {
  bfs_graph: scriptFor(
    "bfs_graph",
    "algorithm",
    "BFS graph",
    bfsGraphSnapshot(),
    bfsCodeHighlight(),
  ),
  cell_structure: scriptFor(
    "cell_structure",
    "biology",
    "Cell structure",
    cellStructureSnapshot(),
  ),
  derivative_tangent: scriptFor(
    "derivative_tangent",
    "math",
    "Derivative tangent",
    derivativeTangentSnapshot(),
  ),
  east_asia_monsoon: scriptFor(
    "east_asia_monsoon",
    "geography",
    "East Asia monsoon",
    eastAsiaMonsoonSnapshot(),
  ),
  molecule_2d_water: scriptFor(
    "molecule_2d_water",
    "chemistry",
    "Water molecule",
    molecule2DWaterSnapshot(),
  ),
  projectile_motion: scriptFor(
    "projectile_motion",
    "physics",
    "Projectile motion",
    projectileMotionSnapshot(),
  ),
};

export function getSubjectVisualFixture(id: SubjectVisualFixtureId): PlaybookScript {
  return subjectVisualFixtures[id];
}
