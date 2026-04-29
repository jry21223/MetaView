export type TopicDomain =
  | "algorithm"
  | "math"
  | "code"
  | "physics"
  | "chemistry"
  | "biology"
  | "geography";

export type VisualKind =
  | "array"
  | "flow"
  | "formula"
  | "graph"
  | "text"
  | "motion"
  | "circuit"
  | "molecule"
  | "map"
  | "cell";

export interface VisualToken {
  id: string;
  label: string;
  value?: string | null;
  emphasis: string;
}

export interface CirStep {
  id: string;
  title: string;
  narration: string;
  visual_kind: VisualKind;
  tokens: VisualToken[];
  annotations: string[];
  start_time?: number | null;
  end_time?: number | null;
}

export interface CirDocument {
  version: string;
  title: string;
  domain: TopicDomain;
  summary: string;
  steps: CirStep[];
}

export interface ExecutionParameterControl {
  id: string;
  label: string;
  value: string;
  description?: string | null;
  placeholder?: string | null;
}

export interface ExecutionArrayTrack {
  id: string;
  label: string;
  values: string[];
  target_value?: string | null;
}

export interface ExecutionCheckpoint {
  id: string;
  step_index: number;
  step_id: string;
  visual_kind: VisualKind;
  title: string;
  summary: string;
  start_s: number;
  start_progress?: number | null;
  end_s: number;
  end_progress?: number | null;
  code_lines: number[];
  focus_tokens: string[];
  array_focus_indices: number[];
  array_reference_indices: number[];
  breakpoint: boolean;
  guiding_question?: string | null;
}

export interface ExecutionMap {
  duration_s: number;
  interaction_hint?: string | null;
  checkpoints: ExecutionCheckpoint[];
  parameter_controls: ExecutionParameterControl[];
  array_track?: ExecutionArrayTrack | null;
  step_to_checkpoint: Record<string, string>;
  line_to_step_ids: Record<number, string[]>;
}
