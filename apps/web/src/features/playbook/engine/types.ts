import type { ExecutionParameterControl } from "../types";

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

export interface MetaStep<T extends AnySnapshot = AnySnapshot> {
  step_id: string;
  end_frame: number;
  title: string;
  voiceover_text: string;
  animation_hint?: string | null;
  snapshot: T;
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
