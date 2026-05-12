import type { ExecutionParameterControl } from "../../../entities/cir/types";

export type SnapshotKind =
  | "algorithm_array"
  | "algorithm_bars"
  | "algorithm_tree"
  | "math_plot";

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

export type AnySnapshot =
  | AlgorithmArraySnapshot
  | AlgorithmBarsSnapshot
  | AlgorithmTreeSnapshot
  | MathPlotSnapshot;

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
  snapshot: T;
  code_highlight?: CodeHighlightOverlay | null;
  narration_template?: NarrationTemplate | null;
  tokens: NarrationToken[];
  /** Per-step TTS rate override (0.5–2.0). Falls back to config.rate when null/undefined. */
  tts_rate?: number | null;
}

export interface PlaybookScript {
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
