/**
 * Transactional semantic draft emitter.
 *
 * The model never writes the final PlaybookScript directly. It opens typed
 * step drafts, edits them, and explicitly commits them. Finalisation is a
 * deterministic compile step and rejects incomplete transactions.
 */

import type {
  ArrayTokenBuilder,
  CodeHighlightOutput,
  CurveBuilder,
  DraftState,
  Emphasis,
  LayerOutput,
  MetaStepOutput,
  ParameterControl,
  PlaybookOutput,
  PlaybookSkeleton,
  PointBuilder,
  RegionBuilder,
  SegmentBuilder,
  StepBuilder,
  SupportedDomain,
} from "./types.js";
import { SUPPORTED_DOMAINS } from "./types.js";

const DEFAULT_FPS = 30;
const DEFAULT_STEP_FRAMES = 120;
const MIN_STEP_SECONDS = 5.5;
const MAX_STEP_SECONDS = 12;
const VOICEOVER_HOLD_SECONDS = 0.6;
const CHINESE_CHAR_PER_SECOND = 4.8;
const ENGLISH_WORD_PER_SECOND = 2.4;
const FRAME_INCREMENT = 6;
const MIN_STEPS = 8;
const MAX_STEPS = 14;

export class PlaybookEmitter {
  private readonly skeleton: PlaybookSkeleton;
  private readonly drafts = new Map<string, StepBuilder>();
  private readonly committedSteps: StepBuilder[] = [];
  private currentStep: StepBuilder | null = null;
  private nextDraftId = 1;
  private nextCurveId = 0;
  private nextPointId = 0;
  private nextSegmentId = 0;
  private nextReservedIndex = 1;
  private finalized: PlaybookOutput | null = null;

  constructor() {
    this.skeleton = {
      domain: null,
      title: null,
      summary: null,
      step_titles: [],
      parameter_controls: [],
      fps: DEFAULT_FPS,
    };
  }

  state(): DraftState {
    if (this.finalized) return "finalized";
    if (this.currentStep) return "draft_open";
    if (this.skeleton.step_titles.length > 0) return "outlined";
    return "empty";
  }

  setOutline(domain: string, stepTitles: string[]): void {
    this.requireNotFinalized("plan_outline");
    if (this.skeleton.step_titles.length > 0 || this.currentStep || this.drafts.size > 0) {
      throw new Error("plan_outline can only be called once before any step draft is created");
    }
    if (!SUPPORTED_DOMAINS.includes(domain as SupportedDomain)) {
      throw new Error(`unsupported domain ${JSON.stringify(domain)}`);
    }
    if (stepTitles.length < MIN_STEPS || stepTitles.length > MAX_STEPS) {
      throw new Error(`step outline must contain ${MIN_STEPS}-${MAX_STEPS} titles`);
    }
    const cleaned = stepTitles.map((title, index) => {
      const value = String(title).trim();
      if (!value) throw new Error(`step_titles[${index}] must be non-empty`);
      return value;
    });
    this.skeleton.domain = domain as SupportedDomain;
    this.skeleton.step_titles = cleaned;
  }

  setSummary(title: string, summary: string): void {
    this.requireNotFinalized("set_summary");
    this.skeleton.title = title.trim() || null;
    this.skeleton.summary = summary.trim() || null;
  }

  beginStep(index: number, title: string): string {
    this.requireOutline("begin_step");
    this.requireNoOpenStep("begin_step");
    if (index !== this.nextReservedIndex) {
      throw new Error(
        `begin_step expected outline index ${this.nextReservedIndex}, got ${index}`,
      );
    }
    if (index > this.skeleton.step_titles.length) {
      throw new Error(`step index ${index} exceeds outline length ${this.skeleton.step_titles.length}`);
    }
    const draftId = `draft_${String(this.nextDraftId++).padStart(3, "0")}`;
    this.currentStep = {
      draft_id: draftId,
      index,
      outline_title: this.skeleton.step_titles[index - 1],
      title: title.trim() || this.skeleton.step_titles[index - 1],
      narration: [],
      voiceover_text: "",
      curves: [],
      points: [],
      segments: [],
      regions: [],
      formula_latex: null,
      tokens: [],
      code_highlight: null,
      snapshot_override: null,
      layers_override: null,
      provenance: {},
    };
    this.nextReservedIndex += 1;
    return draftId;
  }

  setNarration(text: string[]): void {
    const step = this.requireStep("set_narration");
    const cleaned = text.map((item) => String(item).trim()).filter(Boolean);
    if (cleaned.length === 0) throw new Error("set_narration requires at least one sentence");
    step.narration = cleaned;
    step.voiceover_text = cleaned.join(" ");
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
    if (!(x_max > x_min)) throw new Error("set_axes requires x_max > x_min");
    if (y_min !== undefined && y_max !== undefined && !(y_max > y_min)) {
      throw new Error("set_axes requires y_max > y_min");
    }
    step.axes = { x_min, x_max, y_min, y_max, x_label, y_label };
  }

  addCurveParametric(
    expression_x: string,
    expression_y: string,
    t_min: number,
    t_max: number,
    label: string,
    emphasis: Emphasis,
    semantic_role?: string,
  ): number {
    const step = this.requireStep("add_curve_parametric");
    if (!(t_max > t_min)) throw new Error("parametric curve requires t_max > t_min");
    const curve: CurveBuilder = {
      curve_id: this.nextCurveId++,
      expression_x,
      expression_y,
      t_min,
      t_max,
      label,
      emphasis,
      is_parametric: true,
      semantic_role,
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
    semantic_role?: string,
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
      semantic_role,
    };
    step.curves.push(curve);
    return curve.curve_id;
  }

  addPoint(
    x: number,
    y: number,
    label: string,
    emphasis: Emphasis,
    semantic_role?: string,
  ): number {
    const step = this.requireStep("add_point");
    const point: PointBuilder = {
      point_id: this.nextPointId++,
      x,
      y,
      label,
      emphasis,
      semantic_role,
    };
    step.points.push(point);
    return point.point_id;
  }

  addArrow(
    x: number,
    y: number,
    dx: number,
    dy: number,
    label: string,
    semantic_role?: string,
  ): number {
    return this.addSegment(x, y, x + dx, y + dy, true, label, "primary", semantic_role);
  }

  addSegment(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    arrow: boolean,
    label: string,
    emphasis: Emphasis = "primary",
    semantic_role?: string,
  ): number {
    const step = this.requireStep("add_segment");
    const segment: SegmentBuilder = {
      segment_id: this.nextSegmentId++,
      x0,
      y0,
      x1,
      y1,
      arrow,
      label,
      emphasis,
      semantic_role,
    };
    step.segments.push(segment);
    return segment.segment_id;
  }

  addRegion(
    vertices: Array<[number, number]>,
    label: string,
    emphasis: Emphasis,
    semantic_role?: string,
  ): void {
    const step = this.requireStep("add_region");
    if (vertices.length < 3) throw new Error("region requires at least three vertices");
    const region: RegionBuilder = { vertices, label, emphasis, semantic_role };
    step.regions.push(region);
  }

  addFormula(latex: string): void {
    const step = this.requireStep("add_formula");
    if (!latex.trim()) throw new Error("formula must be non-empty");
    step.formula_latex = latex;
  }

  addArrayTokens(values: string[], emphasisMap?: Record<number, Emphasis>): void {
    const step = this.requireStep("add_array_tokens");
    if (values.length === 0) throw new Error("array tokens cannot be empty");
    step.tokens = values.map<ArrayTokenBuilder>((value, index) => ({
      id: `t${index}`,
      label: String(value),
      value: String(value),
      emphasis: emphasisMap?.[index] ?? "secondary",
    }));
  }

  setCodeHighlight(code: CodeHighlightOutput, useCodeTraceSnapshot = false): void {
    const step = this.requireStep("set_code_highlight");
    if (code.lines.length === 0) throw new Error("code highlight requires source lines");
    const activeLines = [...new Set(code.active_lines)].sort((a, b) => a - b);
    if (activeLines.some((line) => line < 0 || line >= code.lines.length)) {
      throw new Error("active_lines contains an out-of-range source line");
    }
    if (code.active_line < 0 || code.active_line >= code.lines.length) {
      throw new Error("active_line is outside the source lines");
    }
    step.code_highlight = { ...code, active_lines: activeLines };
    if (useCodeTraceSnapshot) {
      step.snapshot_override = {
        kind: "code_trace_scene",
        language: code.language,
        lines: [...code.lines],
        active_lines: activeLines,
        active_line: code.active_line,
        array_values: [],
        active_indices: [],
        search_range: null,
        pointers: [],
        variables: { ...code.variables },
        caption: code.operation_label ?? null,
      };
      step.layers_override = null;
    }
  }

  applyCompiledLayers(
    snapshot: Record<string, unknown>,
    layers: LayerOutput[],
    provenance: Record<string, string> = {},
  ): void {
    const step = this.requireStep("apply_compiled_layers");
    if (typeof snapshot.kind !== "string" || !snapshot.kind) {
      throw new Error("compiled snapshot requires a kind discriminator");
    }
    if (layers.length === 0) throw new Error("compiled layer list cannot be empty");
    const firstKind = String(layers[0]?.body.kind ?? "");
    if (firstKind !== snapshot.kind) {
      throw new Error(
        `compiled primary layer kind ${JSON.stringify(firstKind)} does not match snapshot ${JSON.stringify(snapshot.kind)}`,
      );
    }
    step.snapshot_override = structuredClone(snapshot);
    step.layers_override = structuredClone(layers);
    step.provenance = { ...step.provenance, ...provenance };
  }

  addParameterControl(control: ParameterControl): void {
    this.requireNotFinalized("add_parameter_control");
    this.skeleton.parameter_controls = this.skeleton.parameter_controls
      .filter((candidate) => candidate.id !== control.id)
      .concat({ ...control, value: String(control.value) });
  }

  stashCurrentDraft(): { draft_id: string; step_index: number } {
    const step = this.requireStep("stash_step_draft");
    this.drafts.set(step.draft_id, step);
    this.currentStep = null;
    return { draft_id: step.draft_id, step_index: step.index };
  }

  selectStepDraft(draftId: string): void {
    this.requireNotFinalized("select_step_draft");
    this.requireNoOpenStep("select_step_draft");
    const draft = this.drafts.get(draftId);
    if (!draft) throw new Error(`unknown step draft ${JSON.stringify(draftId)}`);
    this.drafts.delete(draftId);
    this.currentStep = draft;
  }

  abortStepDraft(draftId?: string): void {
    this.requireNotFinalized("abort_step_draft");
    let draft: StepBuilder | undefined;
    if (this.currentStep && (!draftId || this.currentStep.draft_id === draftId)) {
      draft = this.currentStep;
      this.currentStep = null;
    } else if (draftId) {
      draft = this.drafts.get(draftId);
      this.drafts.delete(draftId);
    }
    if (!draft) throw new Error(`unknown or inactive step draft ${JSON.stringify(draftId)}`);
    if (draft.index !== this.nextReservedIndex - 1) {
      throw new Error("only the most recently reserved draft can be aborted safely");
    }
    this.nextReservedIndex -= 1;
  }

  commitStep(): { step_index: number; draft_id: string; summary: string } {
    const step = this.requireStep("commit_step");
    const expectedIndex = this.committedSteps.length + 1;
    if (step.index !== expectedIndex) {
      throw new Error(`commit_step expected index ${expectedIndex}, got ${step.index}`);
    }
    if (!step.voiceover_text.trim()) {
      throw new Error(`step ${step.index} requires narration before commit`);
    }
    const snapshot = serializeSnapshot(step);
    if (!snapshotHasMeaningfulPayload(snapshot)) {
      throw new Error(`step ${step.index} has no renderer-visible payload`);
    }
    this.committedSteps.push(step);
    this.currentStep = null;
    const summary = `step ${step.index} (${step.title}) — ${String(snapshot.kind)}`;
    return { step_index: step.index, draft_id: step.draft_id, summary };
  }

  commitStepDraft(draftId: string): { step_index: number; draft_id: string; summary: string } {
    this.selectStepDraft(draftId);
    return this.commitStep();
  }

  commitAllStepDrafts(): Array<{ step_index: number; draft_id: string; summary: string }> {
    this.requireNoOpenStep("commit_all_step_drafts");
    const ordered = [...this.drafts.values()].sort((left, right) => left.index - right.index);
    const results = [];
    for (const draft of ordered) {
      results.push(this.commitStepDraft(draft.draft_id));
    }
    return results;
  }

  hasOpenStep(): boolean {
    return this.currentStep !== null;
  }

  draftCount(): number {
    return this.drafts.size + (this.currentStep ? 1 : 0);
  }

  stepCount(): number {
    return this.committedSteps.length;
  }

  currentDraftId(): string | null {
    return this.currentStep?.draft_id ?? null;
  }

  resolveParametricCurve(
    curve_id: number,
  ):
    | { ok: true; expression_x: string; expression_y: string; t_min: number; t_max: number }
    | { ok: false; reason: string } {
    if (!this.currentStep) return { ok: false, reason: "no open step draft" };
    const curve = this.currentStep.curves.find((candidate) => candidate.curve_id === curve_id);
    if (!curve) return { ok: false, reason: `curve_id ${curve_id} not found in current draft` };
    if (!curve.is_parametric || curve.expression_x == null || curve.t_min == null || curve.t_max == null) {
      return { ok: false, reason: `curve_id ${curve_id} is not parametric` };
    }
    return {
      ok: true,
      expression_x: curve.expression_x,
      expression_y: curve.expression_y,
      t_min: curve.t_min,
      t_max: curve.t_max,
    };
  }

  finalize(): PlaybookOutput {
    if (this.finalized) return this.finalized;
    this.requireOutline("finalize_playbook");
    if (this.currentStep) {
      throw new Error(`cannot finalize with open draft ${this.currentStep.draft_id}`);
    }
    if (this.drafts.size > 0) {
      throw new Error(`cannot finalize with ${this.drafts.size} uncommitted step draft(s)`);
    }
    if (this.committedSteps.length !== this.skeleton.step_titles.length) {
      throw new Error(
        `committed step count ${this.committedSteps.length} does not match outline ${this.skeleton.step_titles.length}`,
      );
    }
    let cursor = 0;
    const steps = this.committedSteps.map((step) => {
      cursor += estimateStepFrames(step.voiceover_text, this.skeleton.fps);
      return serializeStep(step, cursor);
    });
    const output: PlaybookOutput = {
      schema_version: "1.0.0",
      fps: this.skeleton.fps,
      total_frames: cursor,
      domain: this.skeleton.domain ?? "math",
      title: this.skeleton.title ?? this.skeleton.step_titles[0] ?? "MetaView Playbook",
      summary: this.skeleton.summary ?? "",
      steps,
      parameter_controls: [...this.skeleton.parameter_controls],
      initial_data: {
        agent_harness: ["transactional_step_draft_v1"],
      },
    };
    this.finalized = output;
    return output;
  }

  private requireStep(toolName: string): StepBuilder {
    this.requireNotFinalized(toolName);
    if (!this.currentStep) {
      throw new Error(
        `${toolName} requires an open step draft; call begin_step or select_step_draft first`,
      );
    }
    return this.currentStep;
  }

  private requireOutline(toolName: string): void {
    this.requireNotFinalized(toolName);
    if (this.skeleton.step_titles.length === 0) {
      throw new Error(`${toolName} requires plan_outline first`);
    }
  }

  private requireNoOpenStep(toolName: string): void {
    if (this.currentStep) {
      throw new Error(`${toolName} cannot run while draft ${this.currentStep.draft_id} is open`);
    }
  }

  private requireNotFinalized(toolName: string): void {
    if (this.finalized) throw new Error(`${toolName} cannot run after finalize_playbook`);
  }
}

export function estimateStepFrames(text: string, fps: number): number {
  if (!text.trim()) return DEFAULT_STEP_FRAMES;
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS;
  const chineseChars = [...text.matchAll(/[\u4e00-\u9fff]/g)].length;
  const englishWords =
    text
      .replace(/[\u4e00-\u9fff]/g, " ")
      .match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)?/g)?.length ?? 0;
  const seconds = Math.min(
    MAX_STEP_SECONDS,
    Math.max(
      MIN_STEP_SECONDS,
      chineseChars / CHINESE_CHAR_PER_SECOND +
        englishWords / ENGLISH_WORD_PER_SECOND +
        VOICEOVER_HOLD_SECONDS,
    ),
  );
  return Math.max(
    FRAME_INCREMENT,
    Math.ceil((seconds * safeFps) / FRAME_INCREMENT) * FRAME_INCREMENT,
  );
}

function serializeStep(step: StepBuilder, endFrame: number): MetaStepOutput {
  const snapshot = serializeSnapshot(step);
  const layers = step.layers_override
    ? structuredClone(step.layers_override)
    : [
        {
          timing: {
            enter_at: 0,
            exit_at: 1,
            appear_anim: "fade" as const,
            z_order: 0,
          },
          body: structuredClone(snapshot),
        },
      ];
  return {
    step_id: `step_${String(step.index).padStart(2, "0")}`,
    title: step.title,
    end_frame: endFrame,
    narration_template: [...step.narration],
    voiceover_text: step.voiceover_text,
    tokens: step.tokens.map((token) => ({ ...token })),
    code_highlight: step.code_highlight ? structuredClone(step.code_highlight) : null,
    snapshot,
    layers,
  };
}

function serializeSnapshot(step: StepBuilder): Record<string, unknown> {
  if (step.snapshot_override) return structuredClone(step.snapshot_override);
  if (step.tokens.length > 0) {
    const labels = step.tokens.map((token) => token.label);
    const numericValues = labels.map((label) => Number(label));
    const allNumeric =
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
    };
    return allNumeric
      ? { kind: "algorithm_bars", ...base, numeric_values: numericValues }
      : { kind: "algorithm_array", ...base };
  }
  if (
    step.curves.length === 0 &&
    step.points.length === 0 &&
    step.segments.length === 0 &&
    step.regions.length === 0 &&
    step.formula_latex
  ) {
    return { kind: "math_formula", formula_latex: step.formula_latex };
  }
  if (
    step.curves.length > 0 &&
    !step.curves.some((curve) => curve.is_parametric) &&
    step.points.length === 0 &&
    step.segments.length === 0 &&
    step.regions.length === 0
  ) {
    const primary = step.curves[0];
    return {
      kind: "math_plot",
      curves: step.curves.map((curve) => ({
        expression: curve.expression_y,
        label: curve.label,
        emphasis: curve.emphasis,
        semantic_role: curve.semantic_role,
      })),
      x_min: primary?.x_min ?? step.axes?.x_min ?? -6,
      x_max: primary?.x_max ?? step.axes?.x_max ?? 6,
      y_min: step.axes?.y_min,
      y_max: step.axes?.y_max,
      x_label: step.axes?.x_label ?? "x",
      y_label: step.axes?.y_label ?? "y",
      formula_latex: step.formula_latex,
    };
  }
  return {
    kind: "math_scene",
    x_min: step.axes?.x_min ?? -5,
    x_max: step.axes?.x_max ?? 5,
    y_min: step.axes?.y_min ?? -3,
    y_max: step.axes?.y_max ?? 3,
    x_label: step.axes?.x_label ?? "x",
    y_label: step.axes?.y_label ?? "y",
    points: step.points.map((point) => ({
      x: point.x,
      y: point.y,
      label: point.label,
      emphasis: point.emphasis,
      semantic_role: point.semantic_role,
    })),
    curves: step.curves.map((curve) =>
      curve.is_parametric
        ? {
            expression_x: curve.expression_x,
            expression_y: curve.expression_y,
            t_min: curve.t_min,
            t_max: curve.t_max,
            label: curve.label,
            emphasis: curve.emphasis,
            arrows: false,
            semantic_role: curve.semantic_role,
          }
        : {
            expression_y: curve.expression_y,
            label: curve.label,
            emphasis: curve.emphasis,
            semantic_role: curve.semantic_role,
          },
    ),
    segments: step.segments.map((segment) => ({
      x0: segment.x0,
      y0: segment.y0,
      x1: segment.x1,
      y1: segment.y1,
      arrow: segment.arrow,
      label: segment.label,
      emphasis: segment.emphasis,
      semantic_role: segment.semantic_role,
    })),
    regions: step.regions.map((region) => ({
      vertices: region.vertices,
      label: region.label,
      emphasis: region.emphasis,
      semantic_role: region.semantic_role,
    })),
    formula_latex: step.formula_latex,
  };
}

function snapshotHasMeaningfulPayload(snapshot: Record<string, unknown>): boolean {
  const kind = String(snapshot.kind ?? "");
  if (kind === "algorithm_array" || kind === "algorithm_bars") {
    return Array.isArray(snapshot.array_values) && snapshot.array_values.length > 0;
  }
  if (kind === "math_plot") {
    return Array.isArray(snapshot.curves) && snapshot.curves.length > 0;
  }
  if (kind === "math_formula") {
    return typeof snapshot.formula_latex === "string" && snapshot.formula_latex.trim().length > 0;
  }
  if (kind === "math_scene") {
    return ["points", "curves", "segments", "regions"].some(
      (key) => Array.isArray(snapshot[key]) && (snapshot[key] as unknown[]).length > 0,
    ) || (typeof snapshot.formula_latex === "string" && snapshot.formula_latex.trim().length > 0);
  }
  if (kind === "code_trace_scene") {
    return Array.isArray(snapshot.lines) && snapshot.lines.length > 0;
  }
  return Object.entries(snapshot).some(
    ([key, value]) =>
      key !== "kind" &&
      value !== null &&
      value !== undefined &&
      (typeof value !== "string" || value.trim().length > 0) &&
      (!Array.isArray(value) || value.length > 0),
  );
}
