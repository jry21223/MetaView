import type { PlaybookOutput } from "./types.js";
import { estimateStepFrames } from "./playbookEmitter.js";

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
    super("Agent Self-check 阻塞了 PlaybookScript 生成");
    this.name = "AgentSelfCheckError";
    this.report = report;
  }
}

const MIN_AGENT_STEPS = 3;
const MAX_AGENT_STEPS = 12;

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
  checkForbiddenRenderingPaths(playbook, issues);

  if (issues.some((issue) => issue.severity === "error")) {
    return { status: "blocked", issues };
  }
  if (issues.length > 0) {
    return { status: "warnings", issues };
  }
  return { status: "clean", issues: [] };
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
        "Playbook title 为空。",
        "设置一个能说明课程主题的简短 title。",
      ),
    );
  }
  if (!playbook.summary.trim()) {
    issues.push(
      issue(
        "step.too_shallow",
        "warning",
        "summary",
        "Playbook summary 为空。",
        "补充一句简洁的课程摘要。",
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
        playbook.steps.length < MIN_AGENT_STEPS
          ? `Playbook 只有 ${playbook.steps.length} 步，少于允许的 ${MIN_AGENT_STEPS} 步，讲解缺少必要的教学过程。`
          : `Playbook 有 ${playbook.steps.length} 步，超过允许的 ${MAX_AGENT_STEPS} 步。`,
        playbook.steps.length < MIN_AGENT_STEPS
          ? "补充必要的知识状态、推导阶段或视觉状态，使讲解形成完整教学过程。"
          : "合并重复或过于细碎的步骤，只保留知识状态、主要视觉关系或教学目标发生实质变化的步骤。",
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
          "各步骤的 end_frame 必须严格递增。",
          "将当前步骤的 end_frame 调整到上一完整步骤之后。",
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
          `步骤时长为 ${stepDuration} 帧，短于旁白预计需要的 ${estimatedFrames} 帧。`,
          "增加当前步骤时长或缩短 narration_text，确保字幕与画面同步。",
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
        "total_frames 未覆盖最后一步的 end_frame。",
        "将 total_frames 设置为不小于最后一步的 end_frame。",
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
          "每一步都必须包含非空的 voiceover_text。",
          "补充与当前画面同步的自然旁白，指出学生需要观察的变化及其意义。",
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
          "每一步至少需要一个 renderer layer。",
          "将主要 snapshot 完整复制到 layers[0].body。",
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
        `主要 renderer layer kind 必须与步骤 snapshot kind 一致；当前 layer 为 ${JSON.stringify(layerKind)}，snapshot 为 ${JSON.stringify(snapshotKind)}。`,
        "先将主要 snapshot 完整复制到 layers[0].body，再添加 overlay layer。",
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
        "主要 renderer layer body 必须与步骤 snapshot 深度一致。",
        "将完整的主要 snapshot 复制到 layers[0].body，并把 overlay 放在其后。",
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
        `Snapshot kind ${JSON.stringify(kind)} 未在前端 renderer registry 中注册。`,
        "使用现有 renderer 已支持的 snapshot kind。",
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
        `Snapshot ${JSON.stringify(kind)} 不包含有意义的视觉 payload。`,
        "补充 renderer 可见的数据，例如 array values、curves、scene objects 或 formula text。",
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
        `${normalizedDomain} Playbook 不得回退为 ${kind}。`,
        "使用 SceneBlueprint 或学科语义 renderer，例如 geo_map_scene、bio_cell_scene、bio_process_scene、molecule_2d_scene 或 reaction_scene，不得使用 algorithm array 代替。",
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
        "步骤旁白似乎没有关联当前 visual snapshot。",
        "在旁白中指出关键视觉对象、公式、array state 或 scene element，但不要逐字重复画面。",
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
        "最后一步可能没有回答用户请求。",
        "在最后一步旁白中明确给出用户请求的结论或结果。",
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
          `Playbook 提到了禁止使用的渲染路径 ${JSON.stringify(pattern)}。`,
          "只能使用由前端 Remotion renderer 消费的 PlaybookScript。",
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
