import { resolveAssetById, resolveAssetByRole, resolveAssetForRenderer } from "../assets/assetResolver";
import { visualQualityGate, type VisualQualityWarning } from "../assets/visualQualityGate";
import {
  resolveMoleculePresetBySmilesForRenderer,
  resolveMoleculePresetForRenderer,
} from "../kits/chemistry/moleculePresetResolver";
import type { SubjectVisualKitSubject } from "../assets/assetRegistry";
import type {
  AnySnapshot,
  BioCellSceneSnapshot,
  BioProcessSceneSnapshot,
  CodeHighlightOverlay,
  GeoMapFlow,
  GeoMapSceneSnapshot,
  GeoPressureCenter,
  GraphSceneSnapshot,
  MathPlotSnapshot,
  MetaStep,
  Molecule2DSceneSnapshot,
  PhysicsForceSceneSnapshot,
  PhysicsSceneVector,
  PlaybookScript,
  ReactionSceneSnapshot,
} from "../types";

type GeoSceneType = "geo_map_scene" | "east_asia_monsoon";
type PhysicsSceneType = "physics_force_scene" | "projectile_motion";
type BiologySceneType = "bio_cell_scene" | "bio_process_scene" | "cell_structure" | "dna_replication";
type ChemistrySceneType =
  | "molecule_2d_scene"
  | "molecule_2d_water"
  | "molecule_2d_methane"
  | "reaction_scene"
  | "reaction_synthesis_water";
type MathSceneType = "math_plot" | "derivative_tangent";
type AlgorithmSceneType = "graph_scene" | "bfs_graph";
type SceneBlueprintSubject = "algorithm" | "biology" | "chemistry" | "geography" | "math" | "physics";
type SupportedRendererKind =
  | "bio_cell_scene"
  | "bio_process_scene"
  | "geo_map_scene"
  | "graph_scene"
  | "math_plot"
  | "molecule_2d_scene"
  | "reaction_scene"
  | "physics_force_scene";

interface SceneBlueprintBase {
  id?: string;
  subject: SceneBlueprintSubject;
  sceneType:
    | AlgorithmSceneType
    | BiologySceneType
    | ChemistrySceneType
    | GeoSceneType
    | MathSceneType
    | PhysicsSceneType;
  title: string;
  visualIntent: string[];
  emphasisPoints?: string[];
  packId?: string;
  durationFrames?: number;
  caption?: string;
}

export interface GeoFlowIntent {
  id?: string;
  semanticRole?: "wind" | "monsoon_flow" | string;
  from?: [number, number];
  to?: [number, number];
  label?: string;
  assetId?: string;
  strength?: number;
}

export interface GeographySceneBlueprint extends SceneBlueprintBase {
  subject: "geography";
  sceneType: GeoSceneType;
  mapRegion?: "east_asia" | "world" | string;
  flows?: GeoFlowIntent[];
  pressureCenters?: GeoPressureCenter[];
  particlePreset?: GeoMapSceneSnapshot["particle_preset"];
}

export interface PhysicsObjectIntent {
  id?: string;
  label?: string;
  semanticRole?: "projectile" | "object" | "block" | string;
  assetId?: string;
  x?: number;
  y?: number;
  radius?: number;
}

export interface PhysicsVectorIntent {
  id?: string;
  target?: string;
  semanticRole: "force" | "velocity" | "acceleration" | string;
  dx: number;
  dy: number;
  label?: string;
  magnitude?: string;
}

export interface PhysicsForceSceneBlueprint extends SceneBlueprintBase {
  subject: "physics";
  sceneType: PhysicsSceneType;
  object?: PhysicsObjectIntent;
  vectors?: PhysicsVectorIntent[];
  trajectory?: Array<[number, number]>;
  formulaLatex?: string;
}

export interface BiologySceneBlueprint extends SceneBlueprintBase {
  subject: "biology";
  sceneType: BiologySceneType;
  cellType?: BioCellSceneSnapshot["cell_type"];
}

export interface ChemistrySceneBlueprint extends SceneBlueprintBase {
  subject: "chemistry";
  sceneType: ChemistrySceneType;
  moleculeId?: string;
  smiles?: string;
}

export interface MathSceneBlueprint extends SceneBlueprintBase {
  subject: "math";
  sceneType: MathSceneType;
}

export interface AlgorithmSceneBlueprint extends SceneBlueprintBase {
  subject: "algorithm";
  sceneType: AlgorithmSceneType;
}

export type SceneBlueprint =
  | AlgorithmSceneBlueprint
  | BiologySceneBlueprint
  | ChemistrySceneBlueprint
  | GeographySceneBlueprint
  | MathSceneBlueprint
  | PhysicsForceSceneBlueprint;

export interface SceneBlueprintCompileResult {
  playbookScript: PlaybookScript;
  warnings: VisualQualityWarning[];
}

const DEFAULT_GEO_PACK_ID = "geography-earth-basic";
const DEFAULT_PHYSICS_PACK_ID = "physics-basic";
const DEFAULT_BIOLOGY_PACK_ID = "biology-basic";
const DEFAULT_CORE_PACK_ID = "core-visual-basic";
const DEFAULT_CHEMISTRY_PACK_ID = "chemistry-basic";
const DEFAULT_MATH_PACK_ID = "math-basic";
const DEFAULT_ALGORITHM_PACK_ID = "algorithm-code-basic";
const DEFAULT_DURATION_FRAMES = 90;

function normalizeDurationFrames(durationFrames: number | undefined): number {
  if (typeof durationFrames !== "number" || !Number.isFinite(durationFrames)) return DEFAULT_DURATION_FRAMES;
  return Math.max(1, Math.round(durationFrames));
}

function stepIdFor(blueprint: SceneBlueprint): string {
  const source = blueprint.id ?? `${blueprint.subject}_${blueprint.sceneType}`;
  return source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || `${blueprint.subject}_scene`;
}

function resolveAssetIdByRole(
  rendererKind: SupportedRendererKind,
  subject: SubjectVisualKitSubject,
  packId: string,
  semanticRole: string,
  fallbacks: string[] = [],
): string | undefined {
  for (const role of [semanticRole, ...fallbacks]) {
    const asset =
      resolveAssetForRenderer(rendererKind, role, packId) ??
      resolveAssetByRole(subject, role, packId) ??
      resolveAssetForRenderer(rendererKind, role) ??
      resolveAssetByRole(subject, role);
    if (asset) return asset.id;
  }
  return undefined;
}

function resolveExplicitOrRoleAssetId(
  explicitAssetId: string | undefined,
  rendererKind: SupportedRendererKind,
  subject: SubjectVisualKitSubject,
  packId: string,
  semanticRole: string,
  fallbacks: string[] = [],
): string | undefined {
  if (explicitAssetId) return explicitAssetId;
  return resolveAssetIdByRole(rendererKind, subject, packId, semanticRole, fallbacks);
}

function defaultGeoFlow(): GeoFlowIntent & Required<Pick<GeoFlowIntent, "id" | "semanticRole" | "from" | "to" | "label" | "strength">> {
  return {
    id: "summer-monsoon",
    semanticRole: "monsoon_flow",
    from: [78, 68],
    to: [42, 38],
    label: "summer monsoon",
    strength: 1.1,
  };
}

function compileGeoFlows(flows: GeoFlowIntent[] | undefined, packId: string): GeoMapFlow[] {
  const sourceFlows = flows?.length ? flows : [defaultGeoFlow()];
  return sourceFlows.map((flow, index) => {
    const semanticRole = flow.semanticRole ?? "monsoon_flow";
    return {
      id: flow.id ?? `flow-${index + 1}`,
      semantic_role: semanticRole,
      from: flow.from ?? defaultGeoFlow().from,
      to: flow.to ?? defaultGeoFlow().to,
      label: flow.label ?? (semanticRole === "monsoon_flow" ? "summer monsoon" : semanticRole),
      asset_id: resolveExplicitOrRoleAssetId(
        flow.assetId,
        "geo_map_scene",
        "geography",
        packId,
        semanticRole,
        ["wind"],
      ),
      strength: flow.strength ?? 1,
    };
  });
}

function defaultPressureCenters(): GeoPressureCenter[] {
  return [
    { id: "land-low", kind: "low", x: 38, y: 35, label: "land low" },
    { id: "ocean-high", kind: "high", x: 76, y: 64, label: "ocean high" },
  ];
}

function compileGeographySnapshot(blueprint: GeographySceneBlueprint): GeoMapSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_GEO_PACK_ID;
  const mapAssetId = resolveAssetIdByRole("geo_map_scene", "geography", packId, "map_layer", ["land"]);
  const landAssetId = resolveAssetIdByRole("geo_map_scene", "geography", packId, "land", ["map_layer"]);
  const oceanAssetId = resolveAssetIdByRole("geo_map_scene", "geography", packId, "ocean");
  const mapRegion = blueprint.mapRegion ?? "east_asia";

  return {
    kind: "geo_map_scene",
    pack_id: packId,
    map_region: mapRegion,
    layers: [
      {
        id: "map",
        semantic_role: "map_layer",
        label: mapRegion === "east_asia" ? "East Asia map" : `${mapRegion} map`,
        asset_id: mapAssetId,
      },
      {
        id: "land",
        semantic_role: "land",
        label: "heated continent",
        asset_id: landAssetId === mapAssetId ? undefined : landAssetId,
      },
      {
        id: "ocean",
        semantic_role: "ocean",
        label: "western Pacific",
        asset_id: oceanAssetId,
      },
    ],
    flows: compileGeoFlows(blueprint.flows, packId),
    pressure_centers: blueprint.pressureCenters ?? defaultPressureCenters(),
    particle_preset: blueprint.particlePreset ?? "moisture_particles",
    caption: blueprint.caption ?? "Land-sea thermal contrast reverses seasonal wind direction.",
  };
}

function compileBiologySnapshot(blueprint: BiologySceneBlueprint): BioCellSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_BIOLOGY_PACK_ID;
  const cellAssetId = resolveAssetIdByRole("bio_cell_scene", "biology", packId, "cell");
  const nucleusAssetId = resolveAssetIdByRole("bio_cell_scene", "biology", packId, "nucleus");
  const mitochondrionAssetId = resolveAssetIdByRole("bio_cell_scene", "biology", packId, "mitochondrion");
  const ribosomeAssetId = resolveAssetIdByRole("bio_cell_scene", "biology", packId, "ribosome");
  const dnaAssetId = resolveAssetIdByRole("bio_cell_scene", "biology", packId, "dna");

  return {
    kind: "bio_cell_scene",
    pack_id: packId,
    cell_type: blueprint.cellType ?? "animal",
    structures: [
      { id: "cell", semantic_role: "cell", label: "cell membrane", x: 50, y: 52, width: 66, height: 50, asset_id: cellAssetId },
      { id: "nucleus", semantic_role: "nucleus", label: "nucleus", x: 47, y: 48, width: 20, height: 18, asset_id: nucleusAssetId },
      { id: "mitochondrion", semantic_role: "mitochondrion", label: "mitochondrion", x: 67, y: 59, width: 16, height: 10, asset_id: mitochondrionAssetId },
      { id: "ribosome", semantic_role: "ribosome", label: "ribosome", x: 36, y: 61, width: 8, height: 7, asset_id: ribosomeAssetId },
      { id: "dna", semantic_role: "dna", label: "DNA", x: 47, y: 48, width: 8, height: 12, asset_id: dnaAssetId },
    ],
    callouts: [
      { id: "nucleus-callout", target_id: "nucleus", label: "stores DNA", side: "left" },
      { id: "mitochondrion-callout", target_id: "mitochondrion", label: "releases energy", side: "right" },
    ],
    caption: blueprint.caption ?? "Animal cells contain specialized organelles with distinct functions.",
  };
}

function compileBiologyProcessSnapshot(blueprint: BiologySceneBlueprint): BioProcessSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_BIOLOGY_PACK_ID;
  const dnaAssetId = resolveAssetIdByRole("bio_process_scene", "biology", packId, "dna");
  const forkAssetId = resolveAssetIdByRole("bio_process_scene", "biology", packId, "process_step", [
    "dna_replication",
  ]);
  const flowArrowAssetId = resolveAssetIdByRole("bio_process_scene", "core", DEFAULT_CORE_PACK_ID, "flow_arrow", [
    "causal_arrow",
  ]);

  return {
    kind: "bio_process_scene",
    pack_id: packId,
    process_id: "dna_replication",
    steps: [
      {
        id: "template",
        semantic_role: "dna",
        label: "template DNA",
        x: 22,
        y: 48,
        width: 18,
        height: 38,
        asset_id: dnaAssetId,
      },
      {
        id: "fork",
        semantic_role: "process_step",
        label: "replication fork",
        x: 50,
        y: 48,
        width: 24,
        height: 24,
        asset_id: forkAssetId,
        description: "strand separation and base pairing",
      },
      {
        id: "copy",
        semantic_role: "dna",
        label: "new strands",
        x: 78,
        y: 48,
        width: 18,
        height: 38,
        asset_id: dnaAssetId,
      },
    ],
    connections: [
      {
        id: "template-to-fork",
        from: "template",
        to: "fork",
        semantic_role: "flow_arrow",
        label: "unzip",
        asset_id: flowArrowAssetId,
      },
      {
        id: "fork-to-copy",
        from: "fork",
        to: "copy",
        semantic_role: "flow_arrow",
        label: "copy",
        asset_id: flowArrowAssetId,
      },
    ],
    callouts: [
      { id: "base-pairing", target_id: "fork", label: "base pairing", side: "top" },
    ],
    caption: blueprint.caption ?? "DNA replication copies each strand by complementary base pairing.",
  };
}

function compileChemistrySnapshot(blueprint: ChemistrySceneBlueprint): Molecule2DSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_CHEMISTRY_PACK_ID;
  const moleculeId = blueprint.moleculeId ?? (blueprint.sceneType === "molecule_2d_methane" ? "methane" : "water");
  const moleculePreset =
    resolveMoleculePresetBySmilesForRenderer(packId, blueprint.smiles) ??
    resolveMoleculePresetForRenderer(packId, moleculeId);
  const moleculeAssetId =
    moleculePreset?.moleculeAssetId ??
    resolveAssetIdByRole("molecule_2d_scene", "chemistry", packId, moleculeId, ["molecule"]);
  const atomAssetId = resolveAssetIdByRole("molecule_2d_scene", "chemistry", packId, "atom");
  const bondAssetId = resolveAssetIdByRole("molecule_2d_scene", "chemistry", packId, "bond");
  if (moleculePreset) {
    return {
      kind: "molecule_2d_scene",
      pack_id: packId,
      molecule_id: moleculePreset.moleculeId,
      smiles: moleculePreset.smiles ?? blueprint.smiles,
      molecule_asset_id: moleculeAssetId,
      atoms: moleculePreset.atoms.map((atom) => ({ ...atom, asset_id: atomAssetId })),
      bonds: moleculePreset.bonds.map((bond) => ({ ...bond, asset_id: bondAssetId })),
      callouts: moleculePreset.callouts,
      formula_latex: moleculePreset.formulaLatex,
      caption: blueprint.caption ?? moleculePreset.caption,
    };
  }

  return {
    kind: "molecule_2d_scene",
    pack_id: packId,
    molecule_id: moleculeId,
    smiles: blueprint.smiles,
    molecule_asset_id: moleculeAssetId,
    atoms: [
      { id: "o", element: "O", x: 50, y: 42, asset_id: atomAssetId, label: "oxygen" },
      { id: "h1", element: "H", x: 35, y: 62, asset_id: atomAssetId, label: "hydrogen" },
      { id: "h2", element: "H", x: 65, y: 62, asset_id: atomAssetId, label: "hydrogen" },
    ],
    bonds: [
      { id: "oh1", from: "o", to: "h1", order: 1, asset_id: bondAssetId },
      { id: "oh2", from: "o", to: "h2", order: 1, asset_id: bondAssetId },
    ],
    callouts: [
      { id: "bent-shape", target_id: "o", label: "bent geometry", side: "top" },
      { id: "polar-bond", target_id: "h2", label: "polar bonds", side: "right" },
    ],
    formula_latex: "H_2O",
    caption: blueprint.caption ?? "Water is a bent polar molecule built from structured atom and bond data.",
  };
}

function compileChemistryReactionSnapshot(blueprint: ChemistrySceneBlueprint): ReactionSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_CHEMISTRY_PACK_ID;
  const reactionArrowAssetId = resolveAssetIdByRole("reaction_scene", "chemistry", packId, "reaction_arrow");
  const electronFlowAssetId = resolveAssetIdByRole("reaction_scene", "chemistry", packId, "electron_flow");

  return {
    kind: "reaction_scene",
    pack_id: packId,
    reaction_id: "reaction_synthesis_water",
    reactants: [
      { id: "h2", formula_latex: "H_2", label: "hydrogen", coefficient: 2, x: 18, y: 48 },
      { id: "o2", formula_latex: "O_2", label: "oxygen", coefficient: 1, x: 38, y: 48 },
    ],
    products: [
      { id: "h2o", formula_latex: "H_2O", label: "water", coefficient: 2, x: 78, y: 48 },
    ],
    arrows: [
      {
        id: "main-arrow",
        semantic_role: "reaction_arrow",
        from: [48, 48],
        to: [66, 48],
        label: "forms",
        asset_id: reactionArrowAssetId,
      },
    ],
    electron_flows: [
      {
        id: "electron-shift",
        semantic_role: "electron_flow",
        from: [39, 38],
        to: [58, 36],
        label: "bond rearrangement",
        asset_id: electronFlowAssetId,
      },
    ],
    callouts: [
      { id: "balanced", target_id: "main-arrow", label: "balanced atoms", side: "top" },
    ],
    formula_latex: "2H_2 + O_2 \\rightarrow 2H_2O",
    caption:
      blueprint.caption ??
      "A balanced reaction conserves each atom across reactants and products.",
  };
}

function compileMathSnapshot(blueprint: MathSceneBlueprint): MathPlotSnapshot {
  const packId = blueprint.packId ?? DEFAULT_MATH_PACK_ID;
  const assetId = resolveAssetIdByRole("math_plot", "math", packId, "tangent", ["derivative", "plot"]);

  return {
    kind: "math_plot",
    pack_id: packId,
    asset_id: assetId,
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
    caption: blueprint.caption ?? "The derivative at x=1 is the slope of the tangent line.",
  };
}

function compileAlgorithmSnapshot(blueprint: AlgorithmSceneBlueprint): GraphSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_ALGORITHM_PACK_ID;
  const assetId = resolveAssetIdByRole("graph_scene", "algorithm", packId, "bfs", ["graph_scene", "graph"]);

  return {
    kind: "graph_scene",
    pack_id: packId,
    asset_id: assetId,
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
    caption: blueprint.caption ?? "BFS expands the current node and appends unvisited neighbors to the queue.",
  };
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function compileProjectileTrajectory(): Array<[number, number]> {
  return Array.from({ length: 5 }, (_, index) => {
    const t = index / 4;
    return [roundToOneDecimal(18 + 54 * t), roundToOneDecimal(34 + 44 * t * t)];
  });
}

function defaultPhysicsVectors(targetId: string): PhysicsSceneVector[] {
  return [
    { id: "vx", target: targetId, semantic_role: "velocity", dx: 28, dy: 0, label: "v_x" },
    { id: "vy", target: targetId, semantic_role: "velocity", dx: 0, dy: 18, label: "v_y" },
    { id: "g", target: targetId, semantic_role: "acceleration", dx: 0, dy: 24, label: "g" },
    { id: "force", target: targetId, semantic_role: "force", dx: -16, dy: 8, label: "F" },
  ];
}

function compilePhysicsVectors(vectors: PhysicsVectorIntent[] | undefined, targetId: string): PhysicsSceneVector[] {
  if (!vectors?.length) return defaultPhysicsVectors(targetId);
  return vectors.map((vector, index) => ({
    id: vector.id ?? `${vector.semanticRole}-${index + 1}`,
    target: vector.target ?? targetId,
    semantic_role: vector.semanticRole,
    dx: vector.dx,
    dy: vector.dy,
    label: vector.label,
    magnitude: vector.magnitude,
  }));
}

function compilePhysicsSnapshot(blueprint: PhysicsForceSceneBlueprint): PhysicsForceSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_PHYSICS_PACK_ID;
  const objectIntent = blueprint.object ?? {};
  const objectId = objectIntent.id ?? "body";
  const objectRole = objectIntent.semanticRole ?? "projectile";
  const explicitAsset = objectIntent.assetId ? resolveAssetById(packId, objectIntent.assetId) : undefined;
  const objectAssetId =
    objectIntent.assetId ??
    explicitAsset?.id ??
    resolveAssetIdByRole("physics_force_scene", "physics", packId, objectRole, ["object"]);

  return {
    kind: "physics_force_scene",
    pack_id: packId,
    objects: [
      {
        id: objectId,
        label: objectIntent.label ?? "projectile",
        x: objectIntent.x ?? 30,
        y: objectIntent.y ?? 42,
        asset_id: objectAssetId,
        radius: objectIntent.radius,
      },
    ],
    vectors: compilePhysicsVectors(blueprint.vectors, objectId),
    trajectory: blueprint.trajectory ?? compileProjectileTrajectory(),
    formula_latex: blueprint.formulaLatex ?? "x=v_0t,\\quad y=\\frac12gt^2",
    caption:
      blueprint.caption ??
      "Horizontal velocity stays constant while vertical acceleration bends the path.",
  };
}

function compileSnapshot(blueprint: SceneBlueprint): AnySnapshot {
  if (blueprint.subject === "algorithm") return compileAlgorithmSnapshot(blueprint);
  if (blueprint.subject === "biology" && (blueprint.sceneType === "dna_replication" || blueprint.sceneType === "bio_process_scene")) {
    return compileBiologyProcessSnapshot(blueprint);
  }
  if (blueprint.subject === "biology") return compileBiologySnapshot(blueprint);
  if (blueprint.subject === "chemistry" && (blueprint.sceneType === "reaction_synthesis_water" || blueprint.sceneType === "reaction_scene")) {
    return compileChemistryReactionSnapshot(blueprint);
  }
  if (blueprint.subject === "chemistry") return compileChemistrySnapshot(blueprint);
  if (blueprint.subject === "geography") return compileGeographySnapshot(blueprint);
  if (blueprint.subject === "math") return compileMathSnapshot(blueprint);
  return compilePhysicsSnapshot(blueprint);
}

function compileAlgorithmCodeHighlight(blueprint: AlgorithmSceneBlueprint): CodeHighlightOverlay {
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
      intent: blueprint.visualIntent.join(", "),
      current: "A",
      queue: "[B, C]",
      visited: "{S, A}",
    },
    operation_label: "enqueue neighbors",
  };
}

function compileCodeHighlight(blueprint: SceneBlueprint): CodeHighlightOverlay | null {
  if (blueprint.subject === "algorithm") return compileAlgorithmCodeHighlight(blueprint);
  return null;
}

function snapshotCaption(snapshot: AnySnapshot): string | null | undefined {
  return "caption" in snapshot ? snapshot.caption : null;
}

function compileStep(blueprint: SceneBlueprint): MetaStep {
  const snapshot = compileSnapshot(blueprint);
  const endFrame = normalizeDurationFrames(blueprint.durationFrames);
  const caption = snapshotCaption(snapshot);
  return {
    step_id: stepIdFor(blueprint),
    end_frame: endFrame,
    title: blueprint.title,
    voiceover_text: caption ?? blueprint.title,
    snapshot,
    code_highlight: compileCodeHighlight(blueprint),
    tokens: [],
  };
}

export function compileSceneBlueprintToPlaybookScript(blueprint: SceneBlueprint): PlaybookScript {
  const endFrame = normalizeDurationFrames(blueprint.durationFrames);
  const step = compileStep(blueprint);
  return {
    schema_version: "1.0.0",
    fps: 30,
    total_frames: endFrame,
    domain: blueprint.subject,
    title: blueprint.title,
    summary: blueprint.caption ?? blueprint.title,
    parameter_controls: [],
    steps: [step],
    algorithm_id: blueprint.sceneType,
    initial_data: {
      scene_blueprint: [blueprint.sceneType],
      visual_intent: blueprint.visualIntent,
      emphasis_points: blueprint.emphasisPoints ?? [],
    },
  };
}

export function compileSceneBlueprint(blueprint: SceneBlueprint): SceneBlueprintCompileResult {
  const playbookScript = compileSceneBlueprintToPlaybookScript(blueprint);
  return {
    playbookScript,
    warnings: visualQualityGate(playbookScript),
  };
}
