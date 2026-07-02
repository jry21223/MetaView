import { resolveAssetByRole, resolveAssetForRenderer } from "../assets/assetResolver";
import { visualQualityGate, type VisualQualityWarning } from "../assets/visualQualityGate";
import type { SubjectVisualKitSubject } from "../assets/assetRegistry";
import { compileBinarySearchCodeTraceLayout } from "../kits/algorithm/BinarySearchLayoutCompiler";
import { compileBfsGraphLayout, type GraphLayoutEdgeInput, type GraphLayoutNodeInput } from "../kits/algorithm/GraphLayoutCompiler";
import {
  compileBioCellLayout,
  compileBioProcessLayout,
  type BioCalloutInput,
  type BioCellStructureInput,
  type BioProcessConnectionInput,
  type BioProcessStepInput,
} from "../kits/biology/biologyLayouts";
import {
  compileMolecule2DLayout,
  compileReactionLayout,
  type Molecule2DAtomInput,
  type Molecule2DBondInput,
  type Molecule2DCalloutInput,
  type ReactionArrowInput,
  type ReactionElectronFlowInput,
  type ReactionParticipantInput,
} from "../kits/chemistry/chemistryLayouts";
import type {
  AnySnapshot,
  BioCellSceneSnapshot,
  BioProcessSceneSnapshot,
  CallStackSceneSnapshot,
  CodeTraceSceneSnapshot,
  CodeHighlightOverlay,
  GeoMapSceneSnapshot,
  GeoPressureCenter,
  GraphSceneSnapshot,
  MathPlotSnapshot,
  MetaStep,
  Molecule2DSceneSnapshot,
  PhysicsForceSceneSnapshot,
  PlaybookScript,
  ReactionSceneSnapshot,
} from "../types";
import { compileGeoMapLayout } from "../kits/geography/geographyLayouts";
import { compilePhysicsForceLayout } from "../kits/physics/physicsLayouts";

type GeoSceneType = "geo_map_scene" | "east_asia_monsoon";
type PhysicsSceneType = "physics_force_scene" | "projectile_motion";
type BiologySceneType = "bio_cell_scene" | "bio_process_scene" | "cell_structure" | "dna_replication";
type ChemistrySceneType =
  | "molecule_2d_scene"
  | "molecule_2d_water"
  | "molecule_2d_methane"
  | "molecule_2d_glucose"
  | "reaction_scene"
  | "reaction_synthesis_water";
type MathSceneType = "math_plot" | "derivative_tangent";
type AlgorithmSceneType = "graph_scene" | "bfs_graph" | "call_stack_scene" | "recursion_stack" | "code_trace_scene" | "binary_search";
type SceneBlueprintSubject = "algorithm" | "biology" | "chemistry" | "geography" | "math" | "physics";
type SupportedRendererKind =
  | "bio_cell_scene"
  | "bio_process_scene"
  | "geo_map_scene"
  | "graph_scene"
  | "call_stack_scene"
  | "code_trace_scene"
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
  processId?: string;
  structures?: BioCellStructureInput[];
  steps?: BioProcessStepInput[];
  processSteps?: BioProcessStepInput[];
  connections?: BioProcessConnectionInput[];
  callouts?: BioCalloutInput[];
}

export interface ChemistrySceneBlueprint extends SceneBlueprintBase {
  subject: "chemistry";
  sceneType: ChemistrySceneType;
  moleculeId?: string;
  smiles?: string;
  moleculeAssetId?: string | null;
  atoms?: Molecule2DAtomInput[];
  bonds?: Molecule2DBondInput[];
  highlights?: string[];
  callouts?: Molecule2DCalloutInput[];
  formulaLatex?: string;
  reactionId?: string;
  reactants?: ReactionParticipantInput[];
  products?: ReactionParticipantInput[];
  arrows?: ReactionArrowInput[];
  electronFlows?: ReactionElectronFlowInput[];
}

export interface MathSceneBlueprint extends SceneBlueprintBase {
  subject: "math";
  sceneType: MathSceneType;
}

export interface AlgorithmSceneBlueprint extends SceneBlueprintBase {
  subject: "algorithm";
  sceneType: AlgorithmSceneType;
  graphNodes?: GraphLayoutNodeInput[];
  graphEdges?: GraphLayoutEdgeInput[];
  currentNodeId?: string;
  activeNodeIds?: string[];
  activeEdgeIds?: string[];
  visitedNodeIds?: string[];
  queueNodeIds?: string[];
  frontierNodeIds?: string[];
  arrayValues?: Array<string | number>;
  target?: string | number;
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

function compileGeographySnapshot(blueprint: GeographySceneBlueprint): GeoMapSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_GEO_PACK_ID;
  return compileGeoMapLayout({
    packId,
    mapRegion: blueprint.mapRegion,
    flows: blueprint.flows,
    pressureCenters: blueprint.pressureCenters,
    particlePreset: blueprint.particlePreset,
    caption: blueprint.caption,
  });
}

function compileBiologySnapshot(blueprint: BiologySceneBlueprint): BioCellSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_BIOLOGY_PACK_ID;
  return compileBioCellLayout({
    packId,
    cellType: blueprint.cellType,
    structures: blueprint.structures,
    callouts: blueprint.callouts,
    caption: blueprint.caption,
  });
}

function compileBiologyProcessSnapshot(blueprint: BiologySceneBlueprint): BioProcessSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_BIOLOGY_PACK_ID;
  return compileBioProcessLayout({
    packId,
    processId: blueprint.processId,
    steps: blueprint.steps ?? blueprint.processSteps,
    connections: blueprint.connections,
    callouts: blueprint.callouts,
    caption: blueprint.caption,
  });
}

function compileChemistrySnapshot(blueprint: ChemistrySceneBlueprint): Molecule2DSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_CHEMISTRY_PACK_ID;
  return compileMolecule2DLayout({
    packId,
    sceneType: blueprint.sceneType,
    moleculeId: blueprint.moleculeId,
    smiles: blueprint.smiles,
    moleculeAssetId: blueprint.moleculeAssetId,
    atoms: blueprint.atoms,
    bonds: blueprint.bonds,
    highlights: blueprint.highlights,
    callouts: blueprint.callouts,
    formulaLatex: blueprint.formulaLatex,
    caption: blueprint.caption,
  });
}

function compileChemistryReactionSnapshot(blueprint: ChemistrySceneBlueprint): ReactionSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_CHEMISTRY_PACK_ID;
  return compileReactionLayout({
    packId,
    reactionId: blueprint.reactionId,
    reactants: blueprint.reactants,
    products: blueprint.products,
    arrows: blueprint.arrows,
    electronFlows: blueprint.electronFlows,
    callouts: blueprint.callouts,
    formulaLatex: blueprint.formulaLatex,
    caption: blueprint.caption,
  });
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
  return compileBfsGraphLayout({
    packId,
    nodes: blueprint.graphNodes,
    edges: blueprint.graphEdges,
    currentNodeId: blueprint.currentNodeId,
    activeNodeIds: blueprint.activeNodeIds,
    activeEdgeIds: blueprint.activeEdgeIds,
    visitedNodeIds: blueprint.visitedNodeIds,
    queueNodeIds: blueprint.queueNodeIds,
    frontierNodeIds: blueprint.frontierNodeIds,
    caption: blueprint.caption,
  });
}

function compileCallStackSnapshot(blueprint: AlgorithmSceneBlueprint): CallStackSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_ALGORITHM_PACK_ID;
  const stackAssetId = resolveAssetIdByRole("call_stack_scene", "algorithm", packId, "recursion_stack", [
    "call_stack_scene",
    "call_stack",
  ]);
  const callFrameAssetId = resolveAssetIdByRole("call_stack_scene", "algorithm", packId, "call_frame", [
    "active_frame",
  ]);
  const stackFrameAssetId = resolveAssetIdByRole("call_stack_scene", "algorithm", packId, "stack_frame", [
    "waiting_frame",
  ]);
  const activeLineAssetId = resolveAssetIdByRole("call_stack_scene", "algorithm", packId, "active_line", [
    "code_trace",
  ]);

  return {
    kind: "call_stack_scene",
    pack_id: packId,
    asset_id: stackAssetId,
    frames: [
      {
        id: "factorial-4",
        label: "factorial(4)",
        depth: 0,
        state: "active",
        asset_id: callFrameAssetId,
        variables: { n: "4" },
      },
      {
        id: "factorial-3",
        label: "factorial(3)",
        depth: 1,
        state: "waiting",
        asset_id: stackFrameAssetId,
        variables: { n: "3" },
      },
      {
        id: "factorial-2",
        label: "factorial(2)",
        depth: 2,
        state: "waiting",
        asset_id: stackFrameAssetId,
        variables: { n: "2" },
      },
    ],
    code_trace: {
      language: "python",
      lines: [
        "def factorial(n):",
        "    if n == 1:",
        "        return 1",
        "    return n * factorial(n - 1)",
      ],
      active_lines: [3],
      active_line: 3,
      asset_id: activeLineAssetId,
    },
    current_frame_id: "factorial-4",
    caption: blueprint.caption ?? "Recursive calls form a stack frame for each pending multiplication.",
  };
}

function compileCodeTraceSnapshot(blueprint: AlgorithmSceneBlueprint): CodeTraceSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_ALGORITHM_PACK_ID;
  return compileBinarySearchCodeTraceLayout({
    packId,
    arrayValues: blueprint.arrayValues,
    target: blueprint.target,
    caption: blueprint.caption,
  }).snapshot;
}

function compilePhysicsSnapshot(blueprint: PhysicsForceSceneBlueprint): PhysicsForceSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_PHYSICS_PACK_ID;
  return compilePhysicsForceLayout({
    packId,
    object: blueprint.object,
    vectors: blueprint.vectors,
    trajectory: blueprint.trajectory,
    formulaLatex: blueprint.formulaLatex,
    caption: blueprint.caption,
  });
}

function compileSnapshot(blueprint: SceneBlueprint): AnySnapshot {
  if (blueprint.subject === "algorithm" && (blueprint.sceneType === "recursion_stack" || blueprint.sceneType === "call_stack_scene")) {
    return compileCallStackSnapshot(blueprint);
  }
  if (blueprint.subject === "algorithm" && (blueprint.sceneType === "binary_search" || blueprint.sceneType === "code_trace_scene")) {
    return compileCodeTraceSnapshot(blueprint);
  }
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
  if (blueprint.sceneType === "binary_search" || blueprint.sceneType === "code_trace_scene") {
    return compileBinarySearchCodeTraceLayout({
      packId: blueprint.packId ?? DEFAULT_ALGORITHM_PACK_ID,
      arrayValues: blueprint.arrayValues,
      target: blueprint.target,
      caption: blueprint.caption,
      visualIntent: blueprint.visualIntent,
    }).codeHighlight;
  }

  if (blueprint.sceneType === "recursion_stack" || blueprint.sceneType === "call_stack_scene") {
    return {
      language: "python",
      lines: [
        "def factorial(n):",
        "    if n == 1:",
        "        return 1",
        "    return n * factorial(n - 1)",
      ],
      active_lines: [3],
      active_line: 3,
      variables: {
        intent: blueprint.visualIntent.join(", "),
        n: "4",
        pending: "4 * factorial(3)",
      },
      operation_label: "recursive call",
    };
  }

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
