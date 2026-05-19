/**
 * Accumulates Drawing CLI tool calls into a valid PlaybookScript JSON.
 *
 * Each tool mutates this emitter; finalize() materializes the wire payload
 * the FastAPI side will receive (matches PlaybookScript Pydantic schema).
 */

import type {
  ArrayTokenBuilder,
  CurveBuilder,
  Emphasis,
  ParameterControl,
  PlaybookOutput,
  PlaybookSkeleton,
  PointBuilder,
  RegionBuilder,
  SegmentBuilder,
  StepBuilder,
} from "./types.js";

const DEFAULT_FPS = 30;
const DEFAULT_STEP_FRAMES = 120;

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
      visual_kind: "scene",
      curves: [],
      points: [],
      segments: [],
      regions: [],
      formula_latex: null,
      tokens: [],
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
    step.visual_kind = "function";
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
    // For pure formula steps with no scene elements, the rendered snapshot
    // collapses to ``visual_kind: formula``; downstream commit decides.
  }

  addArrayTokens(values: string[], emphasisMap?: Record<number, Emphasis>): void {
    const step = this.requireStep("add_array_tokens");
    step.visual_kind = "array";
    step.tokens = values.map<ArrayTokenBuilder>((v, i) => ({
      id: `t${i}`,
      label: String(v),
      value: String(v),
      emphasis: emphasisMap?.[i] ?? "secondary",
    }));
  }

  addParameterControl(control: ParameterControl): void {
    // Dedup by id; later writes win so a template can update a default value.
    this.skeleton.parameter_controls = this.skeleton.parameter_controls
      .filter((c) => c.id !== control.id)
      .concat(control);
  }

  commitStep(): { step_index: number; summary: string } {
    const step = this.requireStep("commit_step");
    this.applyVisualKindHeuristics(step);
    this.skeleton.steps.push(step);
    const index = step.index;
    const summary = `step ${index} ("${step.title}") — ${step.curves.length} curves, ` +
      `${step.points.length} points, ${step.segments.length} segments, ` +
      `${step.tokens.length} tokens`;
    this.currentStep = null;
    return { step_index: index, summary };
  }

  // ── Inspection (used by assert tools so they can look up a curve_id) ──
  getCurrentCurve(curve_id: number): CurveBuilder | null {
    if (!this.currentStep) return null;
    return this.currentStep.curves.find((c) => c.curve_id === curve_id) ?? null;
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
    const stepFrames = this.skeleton.step_frames;
    let cursor = 0;
    const steps = this.skeleton.steps.map((s) => {
      cursor += stepFrames;
      return serializeStep(s, cursor);
    });
    const total = Math.max(1, cursor);
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

  private applyVisualKindHeuristics(step: StepBuilder): void {
    // If a step ended up with no visual elements at all but has a formula,
    // mark it as ``formula`` so the player renders the KaTeX overlay only.
    if (
      step.curves.length === 0 &&
      step.points.length === 0 &&
      step.segments.length === 0 &&
      step.regions.length === 0 &&
      step.tokens.length === 0 &&
      step.formula_latex
    ) {
      step.visual_kind = "formula";
    } else if (step.tokens.length > 0) {
      step.visual_kind = "array";
    } else if (step.curves.some((c) => c.is_parametric) ||
      step.regions.length > 0 ||
      step.segments.length > 0
    ) {
      step.visual_kind = "scene";
    } else if (step.curves.length > 0) {
      step.visual_kind = "function";
    }
  }
}

function serializeStep(
  step: StepBuilder,
  endFrame: number,
): Record<string, unknown> {
  const id = `step_${String(step.index).padStart(2, "0")}`;
  const snapshot = serializeSnapshot(step);
  return {
    id,
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
    layers: snapshot ? [{ timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 0 }, body: snapshot }] : [],
  };
}

function serializeSnapshot(step: StepBuilder): Record<string, unknown> | null {
  if (step.visual_kind === "array") {
    const labels = step.tokens.map((t) => t.label);
    const allNumeric = labels.every((l) => /^-?\d+(\.\d+)?$/.test(l));
    return {
      kind: allNumeric ? "algorithm_bars" : "algorithm_array",
      tokens: step.tokens.map((t) => ({
        id: t.id,
        label: t.label,
        value: t.value,
        emphasis: t.emphasis,
      })),
    };
  }
  if (step.visual_kind === "formula") {
    return {
      kind: "math_formula",
      formula_latex: step.formula_latex ?? "",
    };
  }
  if (step.visual_kind === "function") {
    const primary = step.curves[0];
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
