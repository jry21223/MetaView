/**
 * Agent-side semantic draft types. The model edits StepDraft values; the
 * PlaybookEmitter deterministically materialises the canonical Playbook wire
 * shape consumed by the FastAPI schema and Remotion renderer.
 */

export const SUPPORTED_DOMAINS = [
  "algorithm",
  "math",
  "code",
  "physics",
  "chemistry",
  "biology",
  "geography",
] as const;

export type SupportedDomain = (typeof SUPPORTED_DOMAINS)[number];
export type Emphasis = "primary" | "secondary" | "accent";
export type DraftState = "empty" | "outlined" | "draft_open" | "finalized";

export interface CurveBuilder {
  curve_id: number;
  expression_x: string | null;
  expression_y: string;
  t_min: number | null;
  t_max: number | null;
  x_min?: number;
  x_max?: number;
  label: string;
  emphasis: Emphasis;
  is_parametric: boolean;
  semantic_role?: string;
}

export interface PointBuilder {
  point_id: number;
  x: number;
  y: number;
  label: string;
  emphasis: Emphasis;
  semantic_role?: string;
}

export interface SegmentBuilder {
  segment_id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  arrow: boolean;
  label: string;
  emphasis?: Emphasis;
  semantic_role?: string;
}

export interface RegionBuilder {
  vertices: Array<[number, number]>;
  label: string;
  emphasis: Emphasis;
  semantic_role?: string;
}

export interface ArrayTokenBuilder {
  id: string;
  label: string;
  value: string | null;
  emphasis: Emphasis;
}

export interface CodeHighlightOutput {
  language: string;
  lines: string[];
  active_lines: number[];
  active_line: number;
  variables: Record<string, string>;
  operation_label?: string;
}

export interface LayerOutput {
  timing: {
    enter_at: number;
    exit_at: number;
    appear_anim: "fade" | "draw" | "slide" | "scale" | "none";
    z_order: number;
  };
  body: Record<string, unknown>;
}

export interface StepBuilder {
  draft_id: string;
  index: number;
  outline_title: string;
  title: string;
  narration: unknown[];
  voiceover_text: string;
  axes?: {
    x_min: number;
    x_max: number;
    y_min?: number;
    y_max?: number;
    x_label?: string;
    y_label?: string;
  };
  curves: CurveBuilder[];
  points: PointBuilder[];
  segments: SegmentBuilder[];
  regions: RegionBuilder[];
  formula_latex: string | null;
  tokens: ArrayTokenBuilder[];
  code_highlight: CodeHighlightOutput | null;
  snapshot_override: Record<string, unknown> | null;
  layers_override: LayerOutput[] | null;
  provenance: Record<string, string>;
}

export interface ParameterControl {
  id: string;
  label: string;
  value: string;
  description?: string;
}

export interface PlaybookSkeleton {
  domain: SupportedDomain | null;
  title: string | null;
  summary: string | null;
  step_titles: string[];
  parameter_controls: ParameterControl[];
  fps: number;
}

export interface MetaStepOutput {
  step_id: string;
  title: string;
  end_frame: number;
  narration_template: unknown[];
  voiceover_text: string;
  tokens: Array<{
    id: string;
    label: string;
    value: string | null;
    emphasis: Emphasis;
  }>;
  code_highlight: CodeHighlightOutput | null;
  snapshot: Record<string, unknown>;
  layers: LayerOutput[];
}

/** PlaybookScript JSON shape used by the FastAPI contract. */
export interface PlaybookOutput {
  schema_version?: string;
  fps: number;
  total_frames: number;
  domain: SupportedDomain;
  title: string;
  summary: string;
  steps: MetaStepOutput[];
  parameter_controls: ParameterControl[];
  algorithm_id?: string | null;
  initial_data?: Record<string, string[]>;
}

export interface ToolTraceEvent {
  sequence: number;
  timestamp: string;
  tool: string;
  attempt_id: string;
  ok: boolean;
  duration_ms: number;
  args: unknown;
  error?: string;
  state_before?: string;
  state_after?: string;
}

export interface RuntimeTraceEvent {
  sequence: number;
  timestamp: string;
  event: string;
  detail?: Record<string, unknown>;
}

export interface AgentGenerationResult {
  playbook: PlaybookOutput;
  toolEvents: ToolTraceEvent[];
  runtimeEvents: RuntimeTraceEvent[];
}
