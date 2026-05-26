import type { ExecutionParameterControl } from "../../../entities/execution/types";
import type { MotionSceneSnapshot } from "./motion/types";

export type SnapshotKind =
  | "algorithm_array"
  | "algorithm_bars"
  | "algorithm_tree"
  | "math_plot"
  | "math_formula"
  | "math_scene"
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
}

/** Cartesian function / curve plot (math domain). */
export interface MathPlotSnapshot {
  kind: "math_plot";
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
}

/** Filled polygonal region in scene coordinates. */
export interface MathSceneRegion {
  vertices: Array<[number, number]>;
  label?: string | null;
  emphasis?: string;
}

/** Vector field `F(x, y) = (P, Q)` sampled on a grid. */
export interface MathSceneVectorField {
  expression_px: string;
  expression_py: string;
  /** Grid step in scene units; renderer auto-picks when null. */
  step?: number | null;
  label?: string | null;
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
}

/** Free-floating text label. `text` containing `$...$` is KaTeX-rendered. */
export interface MathSceneAnnotation {
  x: number;
  y: number;
  text: string;
  align?: "ne" | "nw" | "se" | "sw" | "center";
}

/** 2-D math scene: curves, regions, vector fields, segments, points. */
export interface MathSceneSnapshot {
  kind: "math_scene";
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
