import type { ExecutionParameterControl } from "../../../entities/execution/types";
import type { MotionSceneSnapshot } from "./motion/types";

export type SnapshotKind =
  | "algorithm_array"
  | "algorithm_bars"
  | "algorithm_tree"
  | "math_plot"
  | "math_formula"
  | "math_scene"
  | "matrix_scene"
  | "table_scene"
  | "graph_scene"
  | "call_stack_scene"
  | "code_trace_scene"
  | "stats_chart_scene"
  | "iteration_trace_scene"
  | "phase_portrait_scene"
  | "complex_plane_scene"
  | "optimization_scene"
  | "modeling_scene"
  | "manifold_scene"
  | "solid_geometry_scene"
  | "bio_cell_scene"
  | "bio_process_scene"
  | "molecule_2d_scene"
  | "reaction_scene"
  | "geo_map_scene"
  | "physics_force_scene"
  | "motion_scene"
  | "katex_overlay"
  | "narration_card";

export interface AlgorithmArraySnapshot {
  kind: "algorithm_array";
  array_values: string[];
  active_indices: number[];
  swap_indices: number[];
  sorted_indices: number[];
  pointers: Record<string, number>;
}

/** Array elements drawn as height-encoded rectangular bars (bar block view). */
export interface AlgorithmBarsSnapshot {
  kind: "algorithm_bars";
  /** Display labels shown on each bar. */
  array_values: string[];
  /** Parsed magnitudes driving each bar's height. */
  numeric_values: number[];
  active_indices: number[];
  swap_indices: number[];
  sorted_indices: number[];
  pointers: Record<string, number>;
}

export interface AlgorithmTreeSnapshot {
  kind: "algorithm_tree";
  nodes: Array<{ id: string; label: string; x?: number; y?: number }>;
  edges: Array<{ from_id: string; to_id: string }>;
  active_node_ids: string[];
  visited_node_ids: string[];
  path_edge_ids: string[];
}

/** A single curve on a math function plot. */
export interface MathPlotCurve {
  /** Formula in `x` (plus named params), e.g. `"x^2 - 2*x"`, `"sin(x)"`. */
  expression: string;
  label?: string | null;
  /** `primary` = curve in focus, `secondary` = context, `accent` = result. */
  emphasis?: string;
  /** Semantic role for asset/preset-aware renderers, e.g. curve, tangent, asymptote. */
  semantic_role?: "curve" | "tangent" | "normal" | "slope" | string;
}

/** Cartesian function / curve plot (math domain). */
export interface MathPlotSnapshot {
  kind: "math_plot";
  pack_id?: string | null;
  asset_id?: string | null;
  curves: MathPlotCurve[];
  /** Runtime numeric parameter scope used by curve expressions, e.g. `{ a: 2 }` for `a*x`. */
  params?: Record<string, number>;
  x_min: number;
  x_max: number;
  y_min?: number | null;
  y_max?: number | null;
  /** A point marker that rides the first curve. */
  marker_x?: number | null;
  /** Shaded region under the first curve, `[shade_from, shade_to]`. */
  shade_from?: number | null;
  shade_to?: number | null;
  x_label: string;
  y_label: string;
  /** Optional KaTeX label, e.g. `"f(x) = x^2"`. */
  formula_latex?: string | null;
  /** Plain-language caption shown by composition/subtitle flows. */
  caption?: string | null;
}

/** Static math formula display (math domain — non-graphable content). */
export interface MathFormulaSnapshot {
  kind: "math_formula";
  /** Core equation as a KaTeX expression. Required. */
  formula_latex: string;
  /** Plain-language one-sentence summary shown below the formula. */
  caption?: string | null;
  /** KaTeX sub-expressions to emphasise (rendered with accent color). */
  highlights?: string[];
  /** Short side notes (e.g. variable meanings). */
  annotations?: string[];
}

/** A labelled point in the math scene's coordinate space. */
export interface MathScenePoint {
  x: number;
  y: number;
  label?: string | null;
  emphasis?: string;
  semantic_role?: string;
}

/** A curve in the math scene: implicit `y = f(x)` or parametric `(x(t), y(t))`. */
export interface MathSceneCurve {
  /** y-component or `y = f(x)` expression. */
  expression_y: string;
  /** Parametric x-component; when present treat the curve as parametric in `t`. */
  expression_x?: string | null;
  t_min?: number | null;
  t_max?: number | null;
  label?: string | null;
  emphasis?: string;
  /** Render directional arrows along the curve. */
  arrows?: boolean;
  semantic_role?: string;
}

/** Filled polygonal region in scene coordinates. */
export interface MathSceneRegion {
  vertices: Array<[number, number]>;
  label?: string | null;
  emphasis?: string;
  semantic_role?: string;
}

/** Vector field `F(x, y) = (P, Q)` sampled on a grid. */
export interface MathSceneVectorField {
  expression_px: string;
  expression_py: string;
  /** Grid step in scene units; renderer auto-picks when null. */
  step?: number | null;
  label?: string | null;
  semantic_role?: string;
}

/** Straight segment / arrow between two scene points. */
export interface MathSceneSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  arrow?: boolean;
  label?: string | null;
  emphasis?: string;
  semantic_role?: string;
}

/** Free-floating text label. `text` containing `$...$` is KaTeX-rendered. */
export interface MathSceneAnnotation {
  x: number;
  y: number;
  text: string;
  align?: "ne" | "nw" | "se" | "sw" | "center";
  semantic_role?: string;
}

/** 2-D math scene: curves, regions, vector fields, segments, points. */
export interface MathSceneSnapshot {
  kind: "math_scene";
  /** Keep the declared view box when auto-focus would crop a teaching invariant. */
  camera_mode?: "auto" | "fixed";
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
  x_label: string;
  y_label: string;
  points?: MathScenePoint[];
  curves?: MathSceneCurve[];
  regions?: MathSceneRegion[];
  vector_field?: MathSceneVectorField | null;
  segments?: MathSceneSegment[];
  annotations?: MathSceneAnnotation[];
  /** Optional KaTeX summary shown in a corner of the scene. */
  formula_latex?: string | null;
  /** Plain-language caption shown beneath the scene. */
  caption?: string | null;
  /** Runtime numeric parameter scope used by curve / vector-field expressions. */
  params?: Record<string, number>;
}

export type SceneCellValue = string | number;
export type SceneEmphasis = "primary" | "secondary" | "accent" | "muted";

export interface MatrixSceneSnapshot {
  kind: "matrix_scene";
  matrix: SceneCellValue[][];
  row_labels?: string[];
  col_labels?: string[];
  active_rows?: number[];
  active_columns?: number[];
  active_cells?: Array<[number, number]>;
  operation_label?: string | null;
  formula_latex?: string | null;
  caption?: string | null;
}

export interface TableSceneSnapshot {
  kind: "table_scene";
  columns: string[];
  rows: SceneCellValue[][];
  active_rows?: number[];
  active_columns?: number[];
  active_cells?: Array<[number, number]>;
  caption?: string | null;
}

export interface GraphSceneNode {
  id: string;
  label?: string | null;
  x?: number | null;
  y?: number | null;
  emphasis?: SceneEmphasis;
  asset_id?: string | null;
}

export interface GraphSceneEdge {
  id?: string | null;
  source: string;
  target: string;
  label?: string | null;
  weight?: number | null;
  emphasis?: SceneEmphasis;
  asset_id?: string | null;
}

export interface GraphSceneSnapshot {
  kind: "graph_scene";
  pack_id?: string | null;
  asset_id?: string | null;
  nodes: GraphSceneNode[];
  edges: GraphSceneEdge[];
  directed?: boolean;
  weighted?: boolean;
  current_node_id?: string | null;
  active_node_ids?: string[];
  active_edge_ids?: string[];
  visited_node_ids?: string[];
  queue_node_ids?: string[];
  frontier_node_ids?: string[];
  caption?: string | null;
}

export interface CallStackFrame {
  id: string;
  label: string;
  depth: number;
  state?: "active" | "waiting" | "returned" | string;
  asset_id?: string | null;
  variables?: Record<string, string>;
}

export interface CallStackCodeTrace {
  language: string;
  lines: string[];
  active_lines: number[];
  active_line: number;
  asset_id?: string | null;
}

export interface CallStackSceneSnapshot {
  kind: "call_stack_scene";
  pack_id?: string | null;
  asset_id?: string | null;
  frames: CallStackFrame[];
  code_trace?: CallStackCodeTrace | null;
  current_frame_id?: string | null;
  caption?: string | null;
}

export interface CodeTracePointer {
  id: string;
  label: string;
  index: number;
  asset_id?: string | null;
}

export interface CodeTraceSceneSnapshot {
  kind: "code_trace_scene";
  pack_id?: string | null;
  asset_id?: string | null;
  language: string;
  lines: string[];
  active_lines: number[];
  active_line: number;
  active_line_asset_id?: string | null;
  array_values?: string[];
  active_indices?: number[];
  search_range?: [number, number] | null;
  pointers?: CodeTracePointer[];
  variables?: Record<string, string>;
  caption?: string | null;
}

export interface ChartPoint {
  x: number;
  y: number;
  label?: string | null;
}

export interface ChartSeries {
  label: string;
  points?: ChartPoint[];
  values?: number[];
  emphasis?: SceneEmphasis;
}

export interface StatsChartSceneSnapshot {
  kind: "stats_chart_scene";
  chart_type?: "line" | "bar" | "histogram" | "distribution" | "box";
  series: ChartSeries[];
  x_label?: string;
  y_label?: string;
  current_index?: number | null;
  formula_latex?: string | null;
  caption?: string | null;
}

export interface IterationTraceItem {
  index: number;
  value: SceneCellValue;
  error?: number | null;
  label?: string | null;
}

export interface IterationTraceSceneSnapshot {
  kind: "iteration_trace_scene";
  iterations: IterationTraceItem[];
  metric_name?: string;
  current_index?: number | null;
  formula_latex?: string | null;
  caption?: string | null;
}

export interface PhaseTrajectory {
  label?: string | null;
  points: Array<[number, number]>;
  emphasis?: SceneEmphasis;
}

export interface PhaseEquilibrium {
  x: number;
  y: number;
  label?: string | null;
  stable?: boolean | null;
}

export interface PhasePortraitSceneSnapshot {
  kind: "phase_portrait_scene";
  trajectories: PhaseTrajectory[];
  equilibria?: PhaseEquilibrium[];
  vector_field?: MathSceneVectorField | null;
  x_min?: number;
  x_max?: number;
  y_min?: number;
  y_max?: number;
  formula_latex?: string | null;
  caption?: string | null;
}

export interface ComplexPlanePoint {
  re: number;
  im: number;
  label?: string | null;
  emphasis?: SceneEmphasis;
}

export interface ComplexPlaneSceneSnapshot {
  kind: "complex_plane_scene";
  points: ComplexPlanePoint[];
  contours?: Array<Array<[number, number]>>;
  mapping_grid?: Array<Array<[number, number]>>;
  x_min?: number;
  x_max?: number;
  y_min?: number;
  y_max?: number;
  formula_latex?: string | null;
  caption?: string | null;
}

export interface OptimizationSceneSnapshot {
  kind: "optimization_scene";
  objective?: string | null;
  feasible_region?: Array<[number, number]>;
  iterates?: Array<[number, number]>;
  optimum?: [number, number] | null;
  x_min?: number;
  x_max?: number;
  y_min?: number;
  y_max?: number;
  formula_latex?: string | null;
  caption?: string | null;
}

export interface ModelingVariable {
  id: string;
  label: string;
  value?: SceneCellValue | null;
  unit?: string | null;
}

export interface ModelingRelation {
  source: string;
  target: string;
  label?: string | null;
  emphasis?: SceneEmphasis;
}

export interface ModelingSceneSnapshot {
  kind: "modeling_scene";
  variables: ModelingVariable[];
  relations: ModelingRelation[];
  assumptions?: string[];
  simulation_series?: ChartSeries[];
  formula_latex?: string | null;
  caption?: string | null;
}

export interface ManifoldTangentVector {
  at: [number, number, number];
  direction: [number, number, number];
  label?: string | null;
  emphasis?: SceneEmphasis;
}

export interface ManifoldSceneSnapshot {
  kind: "manifold_scene";
  chart_name?: string | null;
  param_surface?: string | null;
  u_range?: [number, number];
  v_range?: [number, number];
  tangent_vectors?: ManifoldTangentVector[];
  formula_latex?: string | null;
  caption?: string | null;
}

export interface SolidGeometryPoint {
  label: string;
  position: [number, number, number];
  math_position_latex?: [string, string, string] | null;
}

export interface SolidGeometryEdge {
  start: string;
  end: string;
  label?: string | null;
  emphasis?: "primary" | "secondary" | "muted" | "accent";
}

export interface SolidGeometryPlane {
  id: string;
  vertices: string[];
  label?: string | null;
  emphasis?: "primary" | "secondary" | "muted" | "accent";
}

export interface SolidGeometryVector {
  id: string;
  start: string;
  end?: string | null;
  direction?: [number, number, number] | null;
  label?: string | null;
  emphasis?: "primary" | "secondary" | "muted" | "accent";
}

export interface SolidGeometrySceneSnapshot {
  kind: "solid_geometry_scene";
  points: SolidGeometryPoint[];
  edges: SolidGeometryEdge[];
  planes?: SolidGeometryPlane[];
  vectors?: SolidGeometryVector[];
  visible_elements?: string[];
  focus_target?: string | null;
  formula_latex?: string | null;
  caption?: string | null;
}

export interface BioCellStructure {
  id: string;
  semantic_role:
    | "cell"
    | "membrane"
    | "nucleus"
    | "mitochondrion"
    | "ribosome"
    | "dna"
    | "chloroplast"
    | string;
  label?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  asset_id?: string | null;
}

export interface BioCellCallout {
  id: string;
  target_id: string;
  label: string;
  side?: "left" | "right" | "top" | "bottom";
}

export interface BioCellSceneSnapshot {
  kind: "bio_cell_scene";
  pack_id?: string | null;
  cell_type?: "animal" | "plant" | "bacteria" | string | null;
  structures: BioCellStructure[];
  callouts?: BioCellCallout[];
  caption?: string | null;
}

export interface BioProcessStep {
  id: string;
  semantic_role: "dna" | "process_step" | "enzyme" | string;
  label?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  asset_id?: string | null;
  description?: string | null;
}

export interface BioProcessConnection {
  id: string;
  from: string;
  to: string;
  semantic_role: "flow_arrow" | "causal_arrow" | "timeline_arrow" | string;
  label?: string | null;
  asset_id?: string | null;
}

export interface BioProcessSceneSnapshot {
  kind: "bio_process_scene";
  pack_id?: string | null;
  process_id: string;
  steps: BioProcessStep[];
  connections?: BioProcessConnection[];
  callouts?: BioCellCallout[];
  caption?: string | null;
}

export interface Molecule2DAtom {
  id: string;
  element: string;
  x: number;
  y: number;
  charge?: string | null;
  label?: string | null;
  asset_id?: string | null;
}

export interface Molecule2DBond {
  id: string;
  from: string;
  to: string;
  order: 1 | 2 | 3;
  stereo?: "wedge" | "dash" | null;
  label?: string | null;
  asset_id?: string | null;
}

export interface Molecule2DCallout {
  id: string;
  target_id: string;
  label: string;
  side?: "left" | "right" | "top" | "bottom";
}

export interface Molecule2DSceneSnapshot {
  kind: "molecule_2d_scene";
  pack_id?: string | null;
  molecule_id: string;
  smiles?: string | null;
  molecule_asset_id?: string | null;
  atoms: Molecule2DAtom[];
  bonds: Molecule2DBond[];
  highlights?: string[];
  callouts?: Molecule2DCallout[];
  formula_latex?: string | null;
  caption?: string | null;
}

export interface ReactionParticipant {
  id: string;
  formula_latex: string;
  label?: string | null;
  coefficient?: number | null;
  x: number;
  y: number;
  asset_id?: string | null;
}

export interface ReactionArrow {
  id: string;
  semantic_role: "reaction_arrow" | string;
  from: [number, number];
  to: [number, number];
  label?: string | null;
  asset_id?: string | null;
}

export interface ReactionElectronFlow {
  id: string;
  semantic_role: "electron_flow" | string;
  from: [number, number];
  to: [number, number];
  label?: string | null;
  asset_id?: string | null;
}

export interface ReactionSceneSnapshot {
  kind: "reaction_scene";
  pack_id?: string | null;
  reaction_id: string;
  reactants: ReactionParticipant[];
  products: ReactionParticipant[];
  arrows: ReactionArrow[];
  electron_flows?: ReactionElectronFlow[];
  callouts?: Molecule2DCallout[];
  formula_latex?: string | null;
  caption?: string | null;
}

export interface GeoMapLayer {
  id: string;
  semantic_role: "land" | "ocean" | "map_layer" | "pressure_high" | "pressure_low" | string;
  label?: string | null;
  asset_id?: string | null;
}

export interface GeoMapFlow {
  id: string;
  semantic_role: "wind" | "current" | "moisture" | string;
  from: [number, number];
  to: [number, number];
  label?: string | null;
  asset_id?: string | null;
  strength?: number | null;
}

export interface GeoPressureCenter {
  id: string;
  kind: "high" | "low";
  x: number;
  y: number;
  label: string;
}

export interface GeoMapSceneSnapshot {
  kind: "geo_map_scene";
  pack_id?: string | null;
  map_region?: "east_asia" | "world" | string;
  layers: GeoMapLayer[];
  flows: GeoMapFlow[];
  pressure_centers?: GeoPressureCenter[];
  particle_preset?: "moisture_particles" | "wind_stream" | "current_flow" | string | null;
  caption?: string | null;
}

export interface PhysicsSceneObject {
  id: string;
  label?: string | null;
  x: number;
  y: number;
  asset_id?: string | null;
  radius?: number | null;
}

export interface PhysicsSceneVector {
  id: string;
  target: string;
  semantic_role: "force" | "velocity" | "acceleration" | string;
  dx: number;
  dy: number;
  label?: string | null;
  magnitude?: string | null;
}

export interface PhysicsForceSceneSnapshot {
  kind: "physics_force_scene";
  pack_id?: string | null;
  objects: PhysicsSceneObject[];
  vectors: PhysicsSceneVector[];
  trajectory?: Array<[number, number]>;
  formula_latex?: string | null;
  caption?: string | null;
}

/** Free-floating KaTeX label anchored at scene coordinates.
 *
 * `x_min/x_max/y_min/y_max` describe the parent scene's viewport so the
 * overlay can position itself correctly. When missing, the renderer falls
 * back to a symmetric ±5 box (the default scene bounds).
 */
export interface KaTeXOverlaySnapshot {
  kind: "katex_overlay";
  x: number;
  y: number;
  latex: string;
  align?: "ne" | "nw" | "se" | "sw" | "center";
  x_min?: number;
  x_max?: number;
  y_min?: number;
  y_max?: number;
}

/** Floating narration card overlayed atop the main scene. */
export interface NarrationCardSnapshot {
  kind: "narration_card";
  text: string;
  position?: "top" | "bottom" | "center";
  emphasis?: "primary" | "secondary" | "accent";
}

export type AnySnapshot =
  | AlgorithmArraySnapshot
  | AlgorithmBarsSnapshot
  | AlgorithmTreeSnapshot
  | MathPlotSnapshot
  | MathFormulaSnapshot
  | MathSceneSnapshot
  | MatrixSceneSnapshot
  | TableSceneSnapshot
  | GraphSceneSnapshot
  | CallStackSceneSnapshot
  | CodeTraceSceneSnapshot
  | StatsChartSceneSnapshot
  | IterationTraceSceneSnapshot
  | PhasePortraitSceneSnapshot
  | ComplexPlaneSceneSnapshot
  | OptimizationSceneSnapshot
  | ModelingSceneSnapshot
  | ManifoldSceneSnapshot
  | SolidGeometrySceneSnapshot
  | BioCellSceneSnapshot
  | BioProcessSceneSnapshot
  | Molecule2DSceneSnapshot
  | ReactionSceneSnapshot
  | GeoMapSceneSnapshot
  | PhysicsForceSceneSnapshot
  | MotionSceneSnapshot
  | KaTeXOverlaySnapshot
  | NarrationCardSnapshot;

/** Window inside a step's [0,1] progress where a Layer is rendered. */
export interface LayerTiming {
  enter_at: number;
  exit_at: number;
  appear_anim: "fade" | "draw" | "slide" | "scale" | "none";
  z_order: number;
}

/** Composable visual unit within a step. */
export interface Layer {
  id?: string;
  timing: LayerTiming;
  body: AnySnapshot;
}

export interface CodeHighlightOverlay {
  language: string;
  lines: string[];
  active_lines: number[];
  active_line: number;
  variables?: Record<string, string>;
  operation_label?: string;
}

export type NarrationSegment =
  | string
  | { t: string }
  | [NarrationBranch, ...NarrationBranch[]];

export type NarrationBranch = [NarrationCondition, NarrationSegment[]];

export type NarrationCondition =
  | Record<string, never>
  | { a: string; op: "lt" | "gt" | "eq" | "lte" | "gte" | "neq"; b?: string; v?: number | string };

export type NarrationTemplate = NarrationSegment[];

export interface NarrationToken {
  id: string;
  label: string;
  value?: string | null;
  emphasis?: string;
}

export interface MetaStep<T extends AnySnapshot = AnySnapshot> {
  step_id: string;
  end_frame: number;
  title: string;
  voiceover_text: string;
  animation_hint?: string | null;
  /** Primary single-layer snapshot. For multi-layer steps this mirrors layers[0].body. */
  snapshot: T;
  /** Optional layer stack — populated by the backend builder (Phase 3+). */
  layers?: Layer[];
  code_highlight?: CodeHighlightOverlay | null;
  narration_template?: NarrationTemplate | null;
  tokens: NarrationToken[];
  /** Per-step TTS rate override (0.5–2.0). Falls back to config.rate when null/undefined. */
  tts_rate?: number | null;
}

export interface PlaybookScript {
  /** Frozen contract version; absent on pre-versioning stored playbooks. */
  schema_version?: string;
  fps: number;
  total_frames: number;
  domain: string;
  title: string;
  summary: string;
  steps: MetaStep[];
  parameter_controls: ExecutionParameterControl[];
  algorithm_id?: string | null;
  initial_data?: Record<string, string[]>;
}

export type {
  DirectorBeat,
  DirectorCameraMotion,
  DirectorIntent,
  DirectorPacing,
  DirectorScript,
  DirectorShotType,
  DirectorSource,
} from "./director/types";
