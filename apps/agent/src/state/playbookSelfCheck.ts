import type { PlaybookOutput } from "./types.js";
import { estimateStepFrames } from "./playbookEmitter.js";
import {
  compileSafeMathExpression,
  extractSafeMathIdentifiers,
  SafeMathExpressionError,
  type CompiledMathExpression,
} from "./safeMathExpression.js";

export type SelfCheckStatus = "clean" | "warnings" | "blocked";
export type SelfCheckSeverity = "warning" | "error";

export interface SelfCheckIssue {
  code: string;
  severity: SelfCheckSeverity;
  path: string;
  message: string;
  suggestion: string;
}

export interface SelfCheckReport {
  status: SelfCheckStatus;
  issues: SelfCheckIssue[];
}

export class AgentSelfCheckError extends Error {
  report: SelfCheckReport;

  constructor(report: SelfCheckReport) {
    super("agent self-check blocked PlaybookScript generation");
    this.name = "AgentSelfCheckError";
    this.report = report;
  }
}

const MIN_AGENT_STEPS = 8;
const MAX_AGENT_STEPS = 14;
const MATH_PARAMETER_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MOVING_LINE_PARAMETER_RE =
  /\by\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*\*?\s*x\s*[+-]\s*([A-Za-z_][A-Za-z0-9_]*)/i;
const MOVING_LINE_SLOPE_RE =
  /\by\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*\*?\s*x\b/i;
const MOVING_LINE_MARKERS = [
  "moving line",
  "varying line",
  "line family",
  "动直线",
  "运动直线",
  "直线族",
  "恒过",
  "定点",
];
const DETERMINED_INTERCEPT_MARKERS = [
  "determines the intercept",
  "determine the intercept",
  "intercept is determined",
  "确定截距",
  "截距确定",
  "求出截距",
];
const EXPLICIT_PARAMETER_RE =
  /(?:vary|varying|change|changing|drag)\s+(?:the\s+)?(?:free\s+)?parameter\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
const EXPLICIT_PARAMETER_CN_RE =
  /(?:改变|变化|拖动|调节)\s*参数\s*([A-Za-z_][A-Za-z0-9_]*)/g;

const SUPPORTED_FRONTEND_SNAPSHOT_KINDS = new Set([
  "algorithm_array",
  "algorithm_bars",
  "algorithm_tree",
  "math_plot",
  "math_formula",
  "math_scene",
  "matrix_scene",
  "table_scene",
  "graph_scene",
  "call_stack_scene",
  "code_trace_scene",
  "stats_chart_scene",
  "iteration_trace_scene",
  "phase_portrait_scene",
  "complex_plane_scene",
  "optimization_scene",
  "modeling_scene",
  "manifold_scene",
  "solid_geometry_scene",
  "bio_cell_scene",
  "bio_process_scene",
  "molecule_2d_scene",
  "reaction_scene",
  "geo_map_scene",
  "physics_force_scene",
  "motion_scene",
  "katex_overlay",
  "narration_card",
]);

const SUBJECT_VISUAL_DOMAINS = new Set(["geography", "biology", "chemistry"]);
const ALGORITHM_FALLBACK_KINDS = new Set(["algorithm_array", "algorithm_bars"]);
const ANSWER_PROMPT_MARKERS = [
  "explain",
  "show",
  "calculate",
  "derive",
  "compare",
  "why",
  "how",
  "what",
  "解释",
  "讲解",
  "演示",
  "展示",
  "说明",
  "追踪",
  "求",
  "计算",
  "推导",
  "比较",
  "为什么",
  "如何",
];
const ANSWER_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "calculate",
  "compare",
  "derive",
  "explain",
  "for",
  "how",
  "in",
  "is",
  "of",
  "please",
  "show",
  "the",
  "to",
  "what",
  "why",
  "with",
  "解释",
  "讲解",
  "演示",
  "展示",
  "说明",
  "追踪",
  "计算",
  "推导",
  "比较",
  "为什么",
  "如何",
  "结果",
  "总结",
  "结论",
  "结束",
  "完成",
  "最后",
]);

const FORBIDDEN_RENDERING_PATTERNS = [
  "<html",
  "<iframe",
  "<script",
  "manim",
  "server-side video",
  "server video",
  "render_video",
  "ffmpeg",
];

export function selfCheckPlaybook(
  playbook: PlaybookOutput,
  prompt = "",
): SelfCheckReport {
  const issues: SelfCheckIssue[] = [];
  checkStructure(playbook, issues);
  checkTiming(playbook, issues);
  checkSteps(playbook, prompt, issues);
  checkMathParameterContract(playbook, prompt, issues);
  checkForbiddenRenderingPaths(playbook, issues);

  if (issues.some((issue) => issue.severity === "error")) {
    return { status: "blocked", issues };
  }
  if (issues.length > 0) {
    return { status: "warnings", issues };
  }
  return { status: "clean", issues: [] };
}

interface MathExpressionBinding {
  source: string;
  intrinsicNames: ReadonlySet<string>;
  fixedParams: Readonly<Record<string, number>>;
  path: string;
  viewKey: string;
  familyKey: string;
  viewPath: string;
  movingTarget: boolean;
  sampleValues: readonly number[];
}

function checkMathParameterContract(
  playbook: PlaybookOutput,
  prompt: string,
  issues: SelfCheckIssue[],
): void {
  if (playbook.domain.trim().toLowerCase() !== "math") return;

  const expressions = playbook.steps.flatMap((step, index) =>
    mathExpressionBindings(step.snapshot, `steps[${index}].snapshot`),
  );
  const requiredParameters = requiredInteractiveParameters(prompt);
  const controls = new Map<string, number>();
  const seenControlIds = new Set<string>();
  const controlIdsByLabel = new Map<string, string>();
  playbook.parameter_controls.forEach((control, index) => {
    const trimmedValue = control.value.trim();
    const numericValue = Number(trimmedValue);
    const invalidId = !MATH_PARAMETER_ID_RE.test(control.id);
    const invalidValue =
      !trimmedValue || !Number.isFinite(numericValue);
    const duplicateId = seenControlIds.has(control.id);
    const normalizedLabel = control.label.trim().toLocaleLowerCase().replace(/\s+/g, " ");
    const priorLabelId = normalizedLabel
      ? controlIdsByLabel.get(normalizedLabel)
      : undefined;
    const duplicateMeaning =
      priorLabelId !== undefined && priorLabelId !== control.id;
    seenControlIds.add(control.id);
    if (normalizedLabel && priorLabelId === undefined) {
      controlIdsByLabel.set(normalizedLabel, control.id);
    }
    if (invalidId || invalidValue || duplicateId || duplicateMeaning) {
      const reasons = [
        ...(invalidId ? ["id must be a renderer-safe identifier"] : []),
        ...(invalidValue ? ["value must be a finite number"] : []),
        ...(duplicateId ? ["id must be unique"] : []),
        ...(duplicateMeaning
          ? [`label duplicates parameter ${JSON.stringify(priorLabelId)}`]
          : []),
      ];
      issues.push(
        issue(
          "math.parameter_control_invalid",
          "error",
          `parameter_controls[${index}]`,
          `Math parameter control ${JSON.stringify(control.id)} is invalid: ${reasons.join(", ")}.`,
          "Use one unique ASCII identifier and label per mathematical parameter, and provide a finite numeric default value.",
        ),
      );
      return;
    }
    controls.set(control.id, numericValue);
  });

  const symbolicParameters = new Set<string>();
  const missingParameters = new Set<string>();
  const identifiersByView = new Map<string, Set<string>>();
  const bindingByView = new Map<string, MathExpressionBinding>();
  for (const expression of expressions) {
    let identifiers: Set<string>;
    let compiled: CompiledMathExpression;
    try {
      identifiers = extractSafeMathIdentifiers(expression.source);
      compiled = compileSafeMathExpression(expression.source);
    } catch (error) {
      const message =
        error instanceof SafeMathExpressionError
          ? error.message
          : "unknown expression error";
      issues.push(
        issue(
          "math.parameter_control_invalid",
          "error",
          expression.path,
          `Math expression cannot be rendered: ${message}`,
          "Use explicit multiplication, balanced parentheses, supported functions, and the ^ power operator.",
        ),
      );
      continue;
    }
    const expressionParameters = [...identifiers].filter(
      (name) => !expression.intrinsicNames.has(name),
    );
    const viewIdentifiers =
      identifiersByView.get(expression.viewKey) ?? new Set<string>();
    expressionParameters.forEach((name) => viewIdentifiers.add(name));
    identifiersByView.set(expression.viewKey, viewIdentifiers);
    bindingByView.set(expression.viewKey, expression);
    for (const name of expressionParameters) {
      symbolicParameters.add(name);
      if (!(name in expression.fixedParams) && !controls.has(name)) {
        missingParameters.add(name);
      }
    }
    if (
      !expressionHasFiniteDefault(
        compiled,
        controls,
        expression.fixedParams,
        expression.intrinsicNames,
        expression.sampleValues,
      )
    ) {
      issues.push(
        issue(
          "math.parameter_control_invalid",
          "error",
          expression.path,
          "Math expression has no finite sample with the declared default parameters.",
          "Choose finite defaults that render the curve before the student moves a slider.",
        ),
      );
    }
  }

  for (const name of requiredParameters) {
    if (symbolicParameters.has(name) && !controls.has(name)) {
      missingParameters.add(name);
    }
  }
  const missing = [...missingParameters];
  if (missing.length > 0) {
    issues.push(
      issue(
        "math.parameter_control_missing",
        "error",
        "parameter_controls",
        `Math expressions reference free parameter(s) without controls: ${missing.join(", ")}.`,
        "Call add_parameter_control once per free parameter and keep the same identifier in every dynamic curve expression.",
      ),
    );
  }

  const conditionDetermined = conditionDeterminedParameters(prompt);
  const unused = [...controls.keys()].filter(
    (name) =>
      !symbolicParameters.has(name) || conditionDetermined.has(name),
  );
  if (unused.length > 0) {
    issues.push(
      issue(
        "math.parameter_control_unused",
        "error",
        "parameter_controls",
        `Math parameter control(s) are unused or already fixed by the problem constraints: ${unused.join(", ")}.`,
        "Remove fake controls and controls for quantities already determined by the problem; only surviving free parameters may remain interactive.",
      ),
    );
  }

  const targetFamilies = new Set(
    [...bindingByView.entries()]
      .filter(([viewKey, binding]) =>
        binding.movingTarget ||
        [...(identifiersByView.get(viewKey) ?? [])].some((name) =>
          requiredParameters.has(name),
        ),
      )
      .map(([, binding]) => binding.familyKey),
  );
  const hardcodedByPath = new Map<string, Set<string>>();
  for (const [viewKey, binding] of bindingByView) {
    if (!targetFamilies.has(binding.familyKey)) continue;
    const viewIdentifiers = identifiersByView.get(viewKey) ?? new Set<string>();
    const hardcoded = new Set(
      [...requiredParameters].filter((name) => !viewIdentifiers.has(name)),
    );
    if (hardcoded.size > 0) {
      hardcodedByPath.set(binding.viewPath, hardcoded);
    }
  }
  const hardcodedInMovingViews = new Set(
    [...hardcodedByPath.values()].flatMap((names) => [...names]),
  );
  for (const [path, names] of hardcodedByPath) {
    issues.push(
      issue(
        "math.parameter_hardcoded",
        "error",
        path,
        `A moving curve expression hardcodes surviving free parameter(s): ${[...names].join(", ")}.`,
        "Keep each surviving free parameter symbolic in every moving curve expression and declare a matching parameter control.",
      ),
    );
  }
  const hardcoded = [...requiredParameters].filter(
    (name) =>
      !symbolicParameters.has(name) && !hardcodedInMovingViews.has(name),
  );
  if (hardcoded.length > 0) {
    issues.push(
      issue(
        "math.parameter_hardcoded",
        "error",
        "steps",
        `The prompt requires a moving line, but surviving free parameter(s) were baked into numeric expressions: ${hardcoded.join(", ")}.`,
        "Keep each surviving free parameter symbolic in the moving-line curve and declare a matching parameter control.",
      ),
    );
  }
}

function requiredInteractiveParameters(prompt: string): Set<string> {
  const normalized = prompt.toLowerCase();
  const required = new Set<string>();
  for (const pattern of [EXPLICIT_PARAMETER_RE, EXPLICIT_PARAMETER_CN_RE]) {
    pattern.lastIndex = 0;
    for (const match of prompt.matchAll(pattern)) {
      required.add(match[1]);
    }
  }
  if (!MOVING_LINE_MARKERS.some((marker) => normalized.includes(marker))) {
    return required;
  }
  const match = MOVING_LINE_PARAMETER_RE.exec(prompt);
  if (!match) {
    const slopeMatch = MOVING_LINE_SLOPE_RE.exec(prompt);
    if (slopeMatch) required.add(slopeMatch[1]);
    return required;
  }
  const [, slope, intercept] = match;
  required.add(slope);
  if (
    !DETERMINED_INTERCEPT_MARKERS.some((marker) =>
      normalized.includes(marker)
    )
  ) {
    required.add(intercept);
  }
  return required;
}

function conditionDeterminedParameters(prompt: string): Set<string> {
  const normalized = prompt.toLowerCase();
  if (
    !MOVING_LINE_MARKERS.some((marker) => normalized.includes(marker)) ||
    !DETERMINED_INTERCEPT_MARKERS.some((marker) =>
      normalized.includes(marker)
    )
  ) {
    return new Set();
  }
  const match = MOVING_LINE_PARAMETER_RE.exec(prompt);
  return match ? new Set([match[2]]) : new Set();
}

function expressionHasFiniteDefault(
  compiled: CompiledMathExpression,
  controls: ReadonlyMap<string, number>,
  fixedParams: Readonly<Record<string, number>>,
  intrinsicNames: ReadonlySet<string>,
  sampleValues: readonly number[],
): boolean {
  for (const sample of sampleValues) {
    const scope = {
      ...fixedParams,
      ...Object.fromEntries(controls),
      ...Object.fromEntries(
        [...intrinsicNames].map((name) => [name, sample]),
      ),
    };
    try {
      if (Number.isFinite(compiled(scope))) return true;
    } catch (error) {
      if (!(error instanceof SafeMathExpressionError)) throw error;
    }
  }
  return false;
}

function mathExpressionBindings(
  snapshot: Record<string, unknown>,
  path: string,
): MathExpressionBinding[] {
  const kind = String(snapshot.kind ?? "");
  const fixedParams = Object.fromEntries(
    Object.entries(
      snapshot.params && typeof snapshot.params === "object"
        ? (snapshot.params as Record<string, unknown>)
        : {},
    ).flatMap(([name, value]) =>
      typeof value === "number" && Number.isFinite(value)
        ? [[name, value] as const]
        : [],
    ),
  );
  if (kind === "math_plot") {
    const curves = Array.isArray(snapshot.curves) ? snapshot.curves : [];
    return curves.flatMap((curve, index) => {
      if (!curve || typeof curve !== "object") return [];
      const data = curve as Record<string, unknown>;
      const source = data.expression;
      return typeof source === "string"
        ? [{
            source,
            intrinsicNames: new Set(["x"]),
            fixedParams,
            path: `${path}.curves[${index}].expression`,
            viewKey: `${path}:math_plot:${index}`,
            familyKey: curveFamilyKey([source], new Set(["x"])),
            viewPath: `${path}.curves[${index}].expression`,
            movingTarget: isMovingCurve(data),
            sampleValues: rangeSamples(snapshot.x_min, snapshot.x_max),
          }]
        : [];
    });
  }
  if (kind !== "math_scene") return [];

  const bindings: MathExpressionBinding[] = [];
  const curves = Array.isArray(snapshot.curves) ? snapshot.curves : [];
  for (const [index, curve] of curves.entries()) {
    if (!curve || typeof curve !== "object") continue;
    const data = curve as Record<string, unknown>;
    const parametric = typeof data.expression_x === "string" && data.expression_x.trim();
    const intrinsicNames = new Set([parametric ? "t" : "x"]);
    const sampleValues = parametric
      ? rangeSamples(data.t_min, data.t_max)
      : rangeSamples(snapshot.x_min, snapshot.x_max);
    const curveSources = ["expression_x", "expression_y"]
      .map((field) => data[field])
      .filter(
        (source): source is string =>
          typeof source === "string" && source.trim().length > 0,
      );
    const familyKey = curveFamilyKey(curveSources, intrinsicNames);
    if (typeof data.expression_x === "string") {
      bindings.push({
        source: data.expression_x,
        intrinsicNames,
        fixedParams,
        path: `${path}.curves[${index}].expression_x`,
        viewKey: `${path}:math_scene:${index}`,
        familyKey,
        viewPath: `${path}.curves[${index}]`,
        movingTarget: isMovingCurve(data),
        sampleValues,
      });
    }
    if (typeof data.expression_y === "string") {
      bindings.push({
        source: data.expression_y,
        intrinsicNames,
        fixedParams,
        path: `${path}.curves[${index}].expression_y`,
        viewKey: `${path}:math_scene:${index}`,
        familyKey,
        viewPath: `${path}.curves[${index}]`,
        movingTarget: isMovingCurve(data),
        sampleValues,
      });
    }
  }
  const vectorField =
    snapshot.vector_field && typeof snapshot.vector_field === "object"
      ? (snapshot.vector_field as Record<string, unknown>)
      : null;
  if (vectorField) {
    const intrinsicNames = new Set(["x", "y"]);
    if (typeof vectorField.expression_px === "string") {
      bindings.push({
        source: vectorField.expression_px,
        intrinsicNames,
        fixedParams,
        path: `${path}.vector_field.expression_px`,
        viewKey: `${path}:vector_field`,
        familyKey: "vector_field",
        viewPath: `${path}.vector_field`,
        movingTarget: false,
        sampleValues: rangeSamples(snapshot.x_min, snapshot.x_max),
      });
    }
    if (typeof vectorField.expression_py === "string") {
      bindings.push({
        source: vectorField.expression_py,
        intrinsicNames,
        fixedParams,
        path: `${path}.vector_field.expression_py`,
        viewKey: `${path}:vector_field`,
        familyKey: "vector_field",
        viewPath: `${path}.vector_field`,
        movingTarget: false,
        sampleValues: rangeSamples(snapshot.x_min, snapshot.x_max),
      });
    }
  }
  return bindings;
}

function isMovingCurve(curve: Record<string, unknown>): boolean {
  const hint = ["label", "semantic_role"]
    .map((field) => String(curve[field] ?? "").toLowerCase())
    .join(" ");
  return MOVING_LINE_MARKERS.some((marker) => hint.includes(marker));
}

function curveFamilyKey(
  sources: readonly string[],
  intrinsicNames: ReadonlySet<string>,
): string {
  return sources
    .map((source) => expressionShape(source, intrinsicNames))
    .join("|");
}

function expressionShape(
  source: string,
  intrinsicNames: ReadonlySet<string>,
): string {
  const normalizedNumbers = source
    .toLowerCase()
    .replace(
      /(?<![A-Za-z0-9_])(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/g,
      "#",
    );
  const normalizedIdentifiers = normalizedNumbers
    .replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name, offset) => {
      const remainder = normalizedNumbers.slice(offset + name.length);
      return intrinsicNames.has(name) || /^\s*\(/.test(remainder)
        ? name
        : "#";
    })
    .replace(/\s+/g, "");
  const normalizedSigns = normalizedIdentifiers.replace(
    /(^|[(*+/^,])[-+]#/g,
    "$1#",
  );
  const normalizedProducts = normalizedSigns.replace(
    /(?:[#a-z_][#a-z0-9_]*(?:\^#)?)(?:\*(?:[#a-z_][#a-z0-9_]*(?:\^#)?))+/g,
    (product) => product.split("*").sort().join("*"),
  );
  return /^[#a-z0-9_*^]+(?:\+[#a-z0-9_*^]+)+$/.test(normalizedProducts)
    ? normalizedProducts.split("+").sort().join("+")
    : normalizedProducts;
}

function rangeSamples(start: unknown, end: unknown): readonly number[] {
  if (
    typeof start === "number" &&
    Number.isFinite(start) &&
    typeof end === "number" &&
    Number.isFinite(end)
  ) {
    const lower = Math.min(start, end);
    const upper = Math.max(start, end);
    return [lower, (lower + upper) / 2, upper];
  }
  return [-1, 0, 1];
}

function checkStructure(
  playbook: PlaybookOutput,
  issues: SelfCheckIssue[],
): void {
  if (!playbook.title.trim()) {
    issues.push(
      issue(
        "step.too_shallow",
        "error",
        "title",
        "Playbook title is empty.",
        "Set a short title that names the lesson.",
      ),
    );
  }
  if (!playbook.summary.trim()) {
    issues.push(
      issue(
        "step.too_shallow",
        "warning",
        "summary",
        "Playbook summary is empty.",
        "Add a one-sentence summary of the lesson.",
      ),
    );
  }
  if (
    playbook.steps.length < MIN_AGENT_STEPS ||
    playbook.steps.length > MAX_AGENT_STEPS
  ) {
    issues.push(
      issue(
        "step.too_shallow",
        "error",
        "steps",
        `Playbook has ${playbook.steps.length} step(s); launch-safe bounds are ${MIN_AGENT_STEPS}-${MAX_AGENT_STEPS}.`,
        "Regenerate with a concise but complete step sequence.",
      ),
    );
  }
}

function checkTiming(playbook: PlaybookOutput, issues: SelfCheckIssue[]): void {
  let previousEnd = 0;
  playbook.steps.forEach((step, index) => {
    if (step.end_frame <= previousEnd) {
      issues.push(
        issue(
          "timeline.non_monotonic",
          "error",
          `steps[${index}].end_frame`,
          "Step end_frame values must be strictly increasing.",
          "Increase each step end_frame beyond the previous step.",
        ),
      );
    }
    const stepDuration = step.end_frame - previousEnd;
    const estimatedFrames = estimateStepFrames(
      step.voiceover_text,
      playbook.fps,
    );
    if (step.voiceover_text.trim() && stepDuration < estimatedFrames - 12) {
      issues.push(
        issue(
          "timeline.voiceover_too_short",
          "warning",
          `steps[${index}].end_frame`,
          `Step duration (${stepDuration} frame${stepDuration === 1 ? "" : "s"}) appears shorter than the estimated narration requirement (${estimatedFrames} frames).`,
          "Increase this step duration or shorten the narration_text so subtitles can remain aligned.",
        ),
      );
    }
    previousEnd = step.end_frame;
  });

  const lastStep = playbook.steps.at(-1);
  if (lastStep && playbook.total_frames < lastStep.end_frame) {
    issues.push(
      issue(
        "timeline.exceeds_total_frames",
        "error",
        "total_frames",
        "total_frames does not cover the final step end_frame.",
        "Set total_frames to at least the last step's end_frame.",
      ),
    );
  }
}

function checkSteps(
  playbook: PlaybookOutput,
  prompt: string,
  issues: SelfCheckIssue[],
): void {
  playbook.steps.forEach((step, index) => {
    if (!step.voiceover_text.trim()) {
      issues.push(
        issue(
          "step.empty_voiceover",
          "error",
          `steps[${index}].voiceover_text`,
          "Every step must have non-empty voiceover_text.",
          "Write narration that explains why the step matters and what changes visually.",
        ),
      );
    }
    checkSnapshot(step.snapshot, `steps[${index}].snapshot`, issues);
    checkSubjectVisualFallback(
      playbook.domain,
      step.snapshot,
      `steps[${index}].snapshot`,
      issues,
    );
    if (!step.layers.length) {
      issues.push(
        issue(
          "renderer.contract_risk",
          "error",
          `steps[${index}].layers`,
          "Every step must carry at least one renderer layer.",
          "Mirror the primary snapshot into layers[0].body.",
        ),
      );
    } else {
      checkPrimaryLayerMirror(
        step.snapshot,
        step.layers[0].body,
        `steps[${index}].layers[0].body`,
        issues,
      );
    }
    step.layers.forEach((layer, layerIndex) => {
      checkSnapshot(
        layer.body,
        `steps[${index}].layers[${layerIndex}].body`,
        issues,
      );
    });
    checkNarrationVisualMatch(
      index,
      step.title,
      step.voiceover_text,
      step.snapshot,
      issues,
    );
  });

  checkFinalStepAnswersPrompt(playbook, prompt, issues);
}

function checkPrimaryLayerMirror(
  snapshot: Record<string, unknown>,
  primaryLayerBody: Record<string, unknown>,
  path: string,
  issues: SelfCheckIssue[],
): void {
  const snapshotKind = typeof snapshot.kind === "string" ? snapshot.kind : "";
  const layerKind =
    typeof primaryLayerBody.kind === "string" ? primaryLayerBody.kind : "";
  if (layerKind !== snapshotKind) {
    issues.push(
      issue(
        "renderer.contract_risk",
        "error",
        `${path}.kind`,
        `Primary renderer layer kind must match the step snapshot kind; got ${JSON.stringify(layerKind)} for snapshot kind ${JSON.stringify(snapshotKind)}.`,
        "Mirror the primary snapshot into layers[0].body before adding overlay layers.",
      ),
    );
    return;
  }
  if (!deepJsonEqual(primaryLayerBody, snapshot)) {
    issues.push(
      issue(
        "renderer.contract_risk",
        "error",
        path,
        "Primary renderer layer body must deeply equal the step snapshot.",
        "Copy the full primary snapshot into layers[0].body and put overlays after it.",
      ),
    );
  }
}

function checkSnapshot(
  snapshot: Record<string, unknown>,
  path: string,
  issues: SelfCheckIssue[],
): void {
  const kind = typeof snapshot.kind === "string" ? snapshot.kind : "";
  if (!SUPPORTED_FRONTEND_SNAPSHOT_KINDS.has(kind)) {
    issues.push(
      issue(
        "snapshot.unsupported_kind",
        "error",
        `${path}.kind`,
        `Snapshot kind ${JSON.stringify(kind)} is not registered in the frontend renderer registry.`,
        "Use one of the existing renderer-backed snapshot kinds.",
      ),
    );
    return;
  }
  if (!snapshotHasMeaningfulPayload(snapshot)) {
    issues.push(
      issue(
        "snapshot.empty_payload",
        "error",
        path,
        `Snapshot ${JSON.stringify(kind)} has no meaningful visual payload.`,
        "Add renderer-visible data such as array values, curves, scene objects, or formula text.",
      ),
    );
  }
}

function checkSubjectVisualFallback(
  domain: string,
  snapshot: Record<string, unknown>,
  path: string,
  issues: SelfCheckIssue[],
): void {
  const normalizedDomain = domain.trim().toLowerCase();
  const kind = typeof snapshot.kind === "string" ? snapshot.kind : "";
  if (
    SUBJECT_VISUAL_DOMAINS.has(normalizedDomain) &&
    ALGORITHM_FALLBACK_KINDS.has(kind)
  ) {
    issues.push(
      issue(
        "snapshot.domain_fallback",
        "error",
        `${path}.kind`,
        `${normalizedDomain} playbooks must not fall back to ${kind}.`,
        "Use a SceneBlueprint or subject semantic renderer such as geo_map_scene, bio_cell_scene, bio_process_scene, molecule_2d_scene, or reaction_scene instead of an algorithm array.",
      ),
    );
  }
}

function snapshotHasMeaningfulPayload(
  snapshot: Record<string, unknown>,
): boolean {
  const kind = String(snapshot.kind ?? "");
  if (kind === "algorithm_array" || kind === "algorithm_bars") {
    return nonEmptyArray(snapshot.array_values);
  }
  if (kind === "math_plot") {
    return nonEmptyArray(snapshot.curves);
  }
  if (kind === "math_formula") {
    return nonEmptyString(snapshot.formula_latex);
  }
  if (kind === "math_scene") {
    return (
      nonEmptyArray(snapshot.points) ||
      nonEmptyArray(snapshot.curves) ||
      nonEmptyArray(snapshot.segments) ||
      nonEmptyArray(snapshot.regions) ||
      nonEmptyString(snapshot.formula_latex)
    );
  }
  if (kind === "katex_overlay") {
    return nonEmptyString(snapshot.latex);
  }
  if (kind === "narration_card") {
    return nonEmptyString(snapshot.text);
  }
  return Object.entries(snapshot).some(
    ([key, value]) => key !== "kind" && isMeaningful(value),
  );
}

function checkNarrationVisualMatch(
  index: number,
  title: string,
  voiceover: string,
  snapshot: Record<string, unknown>,
  issues: SelfCheckIssue[],
): void {
  const visualTokens = new Set([
    ...tokensForText(title),
    ...tokensForSnapshot(snapshot),
  ]);
  const narrationTokens = tokensForText(voiceover);
  if (
    visualTokens.size > 0 &&
    narrationTokens.size > 0 &&
    !setsIntersect(visualTokens, narrationTokens)
  ) {
    issues.push(
      issue(
        "snapshot.narration_mismatch",
        "warning",
        `steps[${index}].voiceover_text`,
        "Step narration does not appear to reference the visual snapshot.",
        "Mention the key visual object, formula, array state, or scene element in the narration.",
      ),
    );
  }
}

function checkFinalStepAnswersPrompt(
  playbook: PlaybookOutput,
  prompt: string,
  issues: SelfCheckIssue[],
): void {
  if (!ANSWER_PROMPT_MARKERS.some((marker) => prompt.trim().toLowerCase().includes(marker))) {
    return;
  }
  const promptTokens = new Set(
    [...tokensForText(prompt)].filter((token) => !ANSWER_STOPWORDS.has(token)),
  );
  if (promptTokens.size === 0) return;
  const finalStep = playbook.steps.at(-1);
  if (!finalStep) return;
  const finalTokens = new Set([
    ...tokensForText(finalStep.title),
    ...tokensForText(finalStep.voiceover_text),
  ]);
  if (finalTokens.size === 0 || !setsIntersect(promptTokens, finalTokens)) {
    issues.push(
      issue(
        "step.does_not_answer_prompt",
        "error",
        "steps[-1]",
        "The final step may not answer the user's prompt.",
        "Make the final narration explicitly state the requested conclusion or result.",
      ),
    );
  }
}

function checkForbiddenRenderingPaths(
  playbook: PlaybookOutput,
  issues: SelfCheckIssue[],
): void {
  const raw = JSON.stringify(playbook).toLowerCase();
  for (const pattern of FORBIDDEN_RENDERING_PATTERNS) {
    if (raw.includes(pattern)) {
      issues.push(
        issue(
          "renderer.contract_risk",
          "error",
          "playbook",
          `Playbook mentions forbidden rendering path ${JSON.stringify(pattern)}.`,
          "Use only PlaybookScript consumed by the frontend Remotion renderer.",
        ),
      );
    }
  }
}

function tokensForSnapshot(snapshot: Record<string, unknown>): Set<string> {
  const kind = String(snapshot.kind ?? "");
  const tokens = new Set(kind.split("_").filter((part) => part.length >= 2));
  for (const token of tokensForText(textPayload(snapshot))) {
    tokens.add(token);
  }
  if (kind.startsWith("algorithm")) tokens.add("array");
  if (kind.startsWith("math")) tokens.add("math");
  return tokens;
}

function textPayload(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textPayload).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value).map(textPayload).join(" ");
  }
  return "";
}

function tokensForText(text: string): Set<string> {
  const latinTokens = (text.toLowerCase().match(/[a-z0-9_]+/g) ?? [])
    .flatMap((token) => token.split("_"))
    .filter((token) => token.length >= 2);
  const cjkTokens = (text.match(/[\u4e00-\u9fff]+/g) ?? []).flatMap((segment) =>
    Array.from({ length: Math.max(0, segment.length - 1) }, (_, index) =>
      segment.slice(index, index + 2),
    ),
  );
  return new Set([
    ...latinTokens,
    ...cjkTokens,
  ]);
}

function setsIntersect(left: Set<string>, right: Set<string>): boolean {
  for (const item of left) {
    if (right.has(item)) return true;
  }
  return false;
}

function nonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isMeaningful(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value !== null && value !== undefined;
}

function deepJsonEqual(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right))
  );
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalJson(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined && item !== null)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalJson(item)]),
    );
  }
  return value;
}

function issue(
  code: string,
  severity: SelfCheckSeverity,
  path: string,
  message: string,
  suggestion: string,
): SelfCheckIssue {
  return { code, severity, path, message, suggestion };
}
