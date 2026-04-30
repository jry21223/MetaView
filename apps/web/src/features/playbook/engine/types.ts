import type { ExecutionParameterControl } from "../../../entities/cir/types";

export type SnapshotKind = "algorithm_array" | "algorithm_tree";

export interface AlgorithmArraySnapshot {
  kind: "algorithm_array";
  array_values: string[];
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

export type AnySnapshot = AlgorithmArraySnapshot | AlgorithmTreeSnapshot;

export interface CodeHighlightOverlay {
  language: string;
  lines: string[];
  active_lines: number[];
  active_line: number;
  variables?: Record<string, string>;
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
}

export interface PlaybookScript {
  fps: number;
  total_frames: number;
  domain: string;
  title: string;
  summary: string;
  steps: MetaStep[];
  parameter_controls: ExecutionParameterControl[];
}
