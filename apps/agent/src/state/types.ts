/**
 * Internal builder types — what each L1 tool call produces in flight, before
 * the playbook is finalized via finalize_playbook. The shapes mirror
 * apps/api/app/domain/models/playbook.py but stay loose where the Python
 * model allows defaults (we fill them in at finalize time).
 */

export type Emphasis = "primary" | "secondary" | "accent";

export interface CurveBuilder {
  curve_id: number;
  expression_x: string | null; // null for 1D curves
  expression_y: string;
  t_min: number | null;
  t_max: number | null;
  x_min?: number;
  x_max?: number;
  label: string;
  emphasis: Emphasis;
  is_parametric: boolean;
}

export interface PointBuilder {
  point_id: number;
  x: number;
  y: number;
  label: string;
  emphasis: Emphasis;
}

export interface SegmentBuilder {
  segment_id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  arrow: boolean;
  label: string;
}

export interface RegionBuilder {
  vertices: Array<[number, number]>;
  label: string;
  emphasis: Emphasis;
}

export interface ArrayTokenBuilder {
  id: string;
  label: string;
  value: string | null;
  emphasis: Emphasis;
}

export type VisualKind = "scene" | "array" | "function" | "formula" | "graph";

export interface StepBuilder {
  index: number;
  title: string;
  narration: unknown[];
  voiceover_text: string;
  // scene-style accumulators
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
  // array-style accumulator
  tokens: ArrayTokenBuilder[];
}

export interface ParameterControl {
  id: string;
  label: string;
  value: string;
  description?: string;
}

export interface PlaybookSkeleton {
  domain: string | null;
  title: string | null;
  summary: string | null;
  step_titles: string[]; // from plan_outline
  steps: StepBuilder[];
  parameter_controls: ParameterControl[];
  fps: number;
  step_frames: number;
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
  code_highlight: null;
  snapshot: Record<string, unknown>;
  layers: LayerOutput[];
}

/** PlaybookScript JSON shape (matches apps/api/app/domain/models/playbook.py). */
export interface PlaybookOutput {
  fps: number;
  total_frames: number;
  domain: string;
  title: string;
  summary: string;
  steps: MetaStepOutput[];
  parameter_controls: ParameterControl[];
}
