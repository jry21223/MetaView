/**
 * Accumulates Drawing CLI tool calls into a valid PlaybookScript JSON.
 *
 * Each tool mutates this emitter; finalize() materializes the wire payload
 * the FastAPI side will receive (matches PlaybookScript Pydantic schema).
 */

import type {
  AlgorithmAuxiliaryLaneBuilder,
  AlgorithmRangeBuilder,
  ArrayTokenBuilder,
  CurveBuilder,
  Emphasis,
  MetaStepOutput,
  ParameterControl,
  PlaybookOutput,
  PlaybookSkeleton,
  PointBuilder,
  PrimaryRelation,
  RegionBuilder,
  SegmentBuilder,
  StepBuilder,
  VisualKind,
} from "./types.js";

const DEFAULT_FPS = 30;
const DEFAULT_STEP_FRAMES = 120;
const MIN_STEP_SECONDS = 5.5;
const MAX_STEP_SECONDS = 12;
const VOICEOVER_HOLD_SECONDS = 0.6;
const CHINESE_CHAR_PER_SECOND = 4.8;
const ENGLISH_WORD_PER_SECOND = 2.4;
const FRAME_INCREMENT = 6;

export class PlaybookEmitter {
  private skeleton: PlaybookSkeleton;
  private currentStep: StepBuilder | null = null;
  private nextCurveId = 0;
  private nextPointId = 0;
  private nextSegmentId = 0;
  private finalized: PlaybookOutput | null = null;

  constructor() {
    this.skeleton = {
      domain: null,
      title: null,
      summary: null,
      step_titles: [],
      steps: [],
      parameter_controls: [],
      fps: DEFAULT_FPS,
      step_frames: DEFAULT_STEP_FRAMES,
    };
  }

  // ── Plan / outline ────────────────────────────────────────────────────
  setOutline(domain: string, stepTitles: string[]): void {
    this.skeleton.domain = domain;
    this.skeleton.step_titles = stepTitles;
  }

  setSummary(title: string, summary: string): void {
    this.skeleton.title = title;
    this.skeleton.summary = summary;
  }

  // ── Step lifecycle ────────────────────────────────────────────────────
  beginStep(index: number, title: string): void {
    if (this.currentStep) {
      throw new Error(
        `cannot begin step ${index}: step ${this.currentStep.index} not committed`,
      );
    }
    this.currentStep = {
      index,
      title,
      narration: [],
      voiceover_text: "",
      curves: [],
      points: [],
      segments: [],
      regions: [],
      formula_latex: null,
      tokens: [],
      primary_relation: "position",
      algorithm_ranges: [],
      algorithm_auxiliary_lanes: [],
    };
  }

  setNarration(text: string[]): void {
    const step = this.requireStep("set_narration");
    step.narration = text;
    step.voiceover_text = text.filter((s): s is string => typeof s === "string").join(" ");
  }

  setAxes(
    x_min: number,
    x_max: number,
    y_min?: number,
    y_max?: number,
    x_label?: string,
    y_label?: string,
  ): void {
    const step = this.requireStep("set_axes");
    step.axes = { x_min, x_max, y_min, y_max, x_label, y_label };
  }

  // ── L1 visual primitives ──────────────────────────────────────────────
  addCurveParametric(
    expression_x: string,
    expression_y: string,
    t_min: number,
    t_max: number,
    label: string,
    emphasis: Emphasis,
  ): number {
    const step = this.requireStep("add_curve_parametric");
    const curve: CurveBuilder = {
      curve_id: this.nextCurveId++,
      expression_x,
      expression_y,
      t_min,
      t_max,
      label,
      emphasis,
      is_parametric: true,
    };
    step.curves.push(curve);
    return curve.curve_id;
  }

  addCurve1D(
    expression: string,
    label: string,
    emphasis: Emphasis,
    x_min?: number,
    x_max?: number,
  ): number {
    const step = this.requireStep("add_curve_1d");
    const curve: CurveBuilder = {
      curve_id: this.nextCurveId++,
      expression_x: null,
      expression_y: expression,
      t_min: null,
      t_max: null,
      x_min,
      x_max,
      label,
      emphasis,
      is_parametric: false,
    };
    step.curves.push(curve);
    return curve.curve_id;
  }

  addPoint(x: number, y: number, label: string, emphasis: Emphasis): number {
    const step = this.requireStep("add_point");
    const point: PointBuilder = {
      point_id: this.nextPointId++,
      x,
      y,
      label,
      emphasis,
    };
    step.points.push(point);
    return point.point_id;
  }

  addArrow(x: number, y: number, dx: number, dy: number, label: string): number {
    const step = this.requireStep("add_arrow");
    const seg: SegmentBuilder = {
      segment_id: this.nextSegmentId++,
      x0: x,
      y0: y,
      x1: x + dx,
      y1: y + dy,
      arrow: true,
      label,
    };
    step.segments.push(seg);
    return seg.segment_id;
  }

  addSegment(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    arrow: boolean,
    label: string,
  ): number {
    const step = this.requireStep("add_segment");
    const seg: SegmentBuilder = {
      segment_id: this.nextSegmentId++,
      x0,
      y0,
      x1,
      y1,
      arrow,
      label,
    };
    step.segments.push(seg);
    return seg.segment_id;
  }

  addRegion(vertices: Array<[number, number]>, label: string, emphasis: Emphasis): void {
    const step = this.requireStep("add_region");
    step.regions.push({ vertices, label, emphasis });
  }

  addFormula(latex: string): void {
    const step = this.requireStep("add_formula");
    step.formula_latex = latex;
  }

  addArrayTokens(
    values: string[],
    emphasisMap?: Record<number, Emphasis>,
    primaryRelation: PrimaryRelation = "position",
  ): void {
    const step = this.requireStep("add_array_tokens");
    step.primary_relation = primaryRelation;
    step.tokens = values.map<ArrayTokenBuilder>((v, i) => ({
      id: `t${i}`,
      label: String(v),
      value: String(v),
      emphasis: emphasisMap?.[i] ?? "secondary",
    }));
  }

  addAlgorithmRange(range: AlgorithmRangeBuilder): void {
    const step = this.requireStep("add_algorithm_range");
    if (range.end < range.start) {
      throw new Error("algorithm range end must be greater than or equal to start");
    }
    step.algorithm_ranges.push(range);
  }

  addAlgorithmAuxiliaryLane(lane: AlgorithmAuxiliaryLaneBuilder): void {
    const step = this.requireStep("add_algorithm_auxiliary_lane");
    step.algorithm_auxiliary_lanes.push(lane);
  }

  addParameterControl(control: ParameterControl): void {
    // Dedup by id; later writes win so a template can update a default value.
    this.skeleton.parameter_controls = this.skeleton.parameter_controls
      .filter((c) => c.id !== control.id)
      .concat(control);
  }

  commitStep(): { step_index: number; summary: string } {
    const step = this.requireStep("commit_step");
    this.skeleton.steps.push(step);
    const index = step.index;
    const summary = `step ${index} ("${step.title}") — ${step.curves.length} curves, ` +
      `${step.points.length} points, ${step.segments.length} segments, ` +
      `${step.tokens.length} tokens`;
    this.currentStep = null;
    return { step_index: index, summary };
  }

  // ── Inspection (used by assert tools so they can look up a curve_id) ──
  /** Resolve a parametric curve currently in the open step. Returns the
   *  shape required by assert_* tools (expression strings + t-range) or an
   *  error message ready to surface as the tool result. Encapsulates the
   *  "is this actually a parametric curve in the current step" check so
   *  asserts.ts doesn't have to know StepBuilder internals. */
  resolveParametricCurve(
    curve_id: number,
  ):
    | { ok: true; expression_x: string; expression_y: string; t_min: number; t_max: number }
    | { ok: false; reason: string } {
    if (!this.currentStep) {
      return { ok: false, reason: "no open step — call begin_step first" };
    }
    const curve = this.currentStep.curves.find((c) => c.curve_id === curve_id);
    if (!curve) {
      return { ok: false, reason: `curve_id ${curve_id} not found in current step` };
    }
    if (!curve.is_parametric || curve.expression_x == null || curve.t_min == null || curve.t_max == null) {
      return {
        ok: false,
        reason: `curve_id ${curve_id} is not a parametric curve (need add_curve_parametric)`,
      };
    }
    return {
      ok: true,
      expression_x: curve.expression_x,
      expression_y: curve.expression_y,
      t_min: curve.t_min,
      t_max: curve.t_max,
    };
  }

  hasOpenStep(): boolean {
    return this.currentStep !== null;
  }

  stepCount(): number {
    return this.skeleton.steps.length;
  }

  // ── Materialization ───────────────────────────────────────────────────
  finalize(): PlaybookOutput {
    if (this.finalized) return this.finalized;
    if (this.currentStep) {
      // Auto-commit a pending open step so the LLM doesn't need to remember
      // calling commit_step before finalize_playbook.
      this.commitStep();
    }
    const fps = this.skeleton.fps;
    let cursor = 0;
    const steps = this.skeleton.steps.map((s) => {
      cursor += estimateStepFrames(s.voiceover_text, fps);
      return serializeStep(s, cursor);
    });
    const total = cursor;
    const out: PlaybookOutput = {
      fps,
      total_frames: total,
      domain: this.skeleton.domain ?? "math",
      title: this.skeleton.title ?? this.skeleton.step_titles[0] ?? "MetaView Playbook",
      summary: this.skeleton.summary ?? "",
      steps,
      parameter_controls: this.skeleton.parameter_controls,
    };
    this.finalized = out;
    return out;
  }

  private requireStep(toolName: string): StepBuilder {
    if (!this.currentStep) {
      throw new Error(
        `${toolName} called without an open step — call begin_step first`,
      );
    }
    return this.currentStep;
  }

}

export function estimateStepFrames(text: string, fps: number): number {
  if (!text.trim()) return DEFAULT_STEP_FRAMES;
  const textFps = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS;

  const chineseChars = [...text.matchAll(/[\u4e00-\u9fff]/g)].length;
  const englishWords = (text
    .replace(/[\u4e00-\u9fff]/g, " ")
    .match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)?/g)?.length) ?? 0;

  const estimatedSeconds = Math.min(
    MAX_STEP_SECONDS,
    Math.max(
      MIN_STEP_SECONDS,
      chineseChars / CHINESE_CHAR_PER_SECOND + englishWords / ENGLISH_WORD_PER_SECOND + VOICEOVER_HOLD_SECONDS,
    ),
  );
  const estimatedFrames = estimatedSeconds * textFps;
  return Math.max(FRAME_INCREMENT, Math.ceil(estimatedFrames / FRAME_INCREMENT) * FRAME_INCREMENT);
}

/** Derive the rendered visual kind from a step's accumulated content. Pure,
 *  used by serializeSnapshot so we never have to keep a mutable
 *  ``visual_kind`` field in sync with the visual elements. */
function deriveVisualKind(step: StepBuilder): VisualKind {
  if (step.tokens.length > 0) return "array";
  if (
    step.curves.length === 0 &&
    step.points.length === 0 &&
    step.segments.length === 0 &&
    step.regions.length === 0 &&
    step.formula_latex
  ) {
    return "formula";
  }
  if (
    step.curves.some((c) => c.is_parametric) ||
    step.regions.length > 0 ||
    step.segments.length > 0
  ) {
    return "scene";
  }
  if (step.curves.length > 0) return "function";
  return "scene";
}

function serializeStep(
  step: StepBuilder,
  endFrame: number,
): MetaStepOutput {
  const id = `step_${String(step.index).padStart(2, "0")}`;
  const snapshot = serializeSnapshot(step);
  return {
    step_id: id,
    title: step.title,
    end_frame: endFrame,
    narration_template: step.narration,
    voiceover_text: step.voiceover_text,
    tokens: step.tokens.map((t) => ({
      id: t.id,
      label: t.label,
      value: t.value,
      emphasis: t.emphasis,
    })),
    code_highlight: null,
    snapshot,
    layers: [{ timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 0 }, body: snapshot }],
  };
}

function serializeSnapshot(step: StepBuilder): Record<string, unknown> {
  const kind = deriveVisualKind(step);
  if (kind === "array") {
    const labels = step.tokens.map((t) => t.label);
    const numericValues = labels.map((label) => Number(label));
    const useBars = ["magnitude", "order", "swap"].includes(step.primary_relation);
    const hasValidNumericScale =
      labels.every((label) => label.trim() !== "") &&
      numericValues.every((value) => Number.isFinite(value));
    const activeIndices = step.tokens
      .map((token, index) => (token.emphasis === "primary" ? index : -1))
      .filter((index) => index >= 0);
    const sortedIndices = step.tokens
      .map((token, index) => (token.emphasis === "accent" ? index : -1))
      .filter((index) => index >= 0);
    const base = {
      array_values: labels,
      active_indices: activeIndices,
      swap_indices: [] as number[],
      sorted_indices: sortedIndices,
      pointers: {} as Record<string, number>,
      ranges: step.algorithm_ranges,
      element_states: {} as Record<number, string[]>,
      auxiliary_lanes: step.algorithm_auxiliary_lanes,
    };
    if (useBars && hasValidNumericScale) {
      return {
        kind: "algorithm_bars",
        ...base,
        numeric_values: numericValues,
      };
    }
    return {
      kind: "algorithm_array",
      ...base,
    };
  }
  if (kind === "formula") {
    return {
      kind: "math_formula",
      formula_latex: step.formula_latex ?? "",
    };
  }
  if (kind === "function") {
    const primary = step.curves[0];
    // The renderer's math_plot point marker rides the lead curve at marker_x.
    // Surface an added point (primary first) so lesson-plan target-point
    // roles survive serialization instead of being dropped.
    const markedPoint =
      step.points.find((p) => p.emphasis === "primary") ?? step.points[0];
    return {
      kind: "math_plot",
      curves: step.curves.map((c) => ({
        expression: c.expression_y,
        label: c.label,
        emphasis: c.emphasis,
      })),
      x_min: primary?.x_min ?? step.axes?.x_min ?? -6,
      x_max: primary?.x_max ?? step.axes?.x_max ?? 6,
      x_label: step.axes?.x_label,
      y_label: step.axes?.y_label,
      ...(markedPoint ? { marker_x: markedPoint.x } : {}),
      formula_latex: step.formula_latex,
    };
  }
  // default to scene
  return {
    kind: "math_scene",
    x_min: step.axes?.x_min ?? -5,
    x_max: step.axes?.x_max ?? 5,
    y_min: step.axes?.y_min ?? -3,
    y_max: step.axes?.y_max ?? 3,
    x_label: step.axes?.x_label,
    y_label: step.axes?.y_label,
    points: step.points.map((p) => ({
      x: p.x,
      y: p.y,
      label: p.label,
      emphasis: p.emphasis,
    })),
    curves: step.curves.map((c) =>
      c.is_parametric
        ? {
            expression_x: c.expression_x,
            expression_y: c.expression_y,
            t_min: c.t_min,
            t_max: c.t_max,
            label: c.label,
            emphasis: c.emphasis,
            arrows: false,
          }
        : {
            expression_y: c.expression_y,
            label: c.label,
            emphasis: c.emphasis,
          },
    ),
    segments: step.segments.map((s) => ({
      x0: s.x0,
      y0: s.y0,
      x1: s.x1,
      y1: s.y1,
      arrow: s.arrow,
      label: s.label,
    })),
    regions: step.regions.map((r) => ({
      vertices: r.vertices,
      label: r.label,
      emphasis: r.emphasis,
    })),
    // Intentionally NEVER emit vector_field — there is no L1 tool for it.
    formula_latex: step.formula_latex,
  };
}
