/**
 * MetaView Agent harness.
 *
 * The sidecar performs exactly one model attempt. It exposes a request-scoped
 * tool inventory, records complete tool traces, compiles transactional step
 * drafts, and delegates canonical schema/semantic validation to FastAPI.
 */

import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { getModel, type Api, type KnownProvider, type Model } from "@earendil-works/pi-ai";

import { resolveOptionalEnv } from "./env.js";
import { deriveRepairScope } from "./state/jsonPatch.js";
import { PlaybookEmitter } from "./state/playbookEmitter.js";
import { validateRenderedQuality } from "./state/renderedQuality.js";
import { AgentTraceCollector } from "./state/trace.js";
import type {
  AgentGenerationResult,
  PlaybookOutput,
  SupportedDomain,
} from "./state/types.js";
import { makeAssertTools } from "./tools/asserts.js";
import { makeAnimationToolTools } from "./tools/animationTools.js";
import { makeDrawingTools } from "./tools/drawing.js";
import { makeRepairTools } from "./tools/repair.js";
import { makeRuntimeToolTools } from "./tools/runtimeTools.js";
import { makeTemplateTools } from "./tools/templates.js";

export interface ProviderConfig {
  provider?: string;
  model?: string;
  api_key?: string;
  base_url?: string;
}

export interface RepairPayload {
  previous_playbook: PlaybookOutput | Record<string, unknown>;
  blocking_issues: unknown[];
  original_prompt?: string;
  reason?: string;
}

export interface GenerateOptions {
  runId?: string;
  prompt: string;
  sourceCode?: string | null;
  language?: string | null;
  provider?: ProviderConfig;
  routeDecision?: Record<string, unknown>;
  coverageDecision?: Record<string, unknown>;
  lessonPlan?: Record<string, unknown>;
  playbookSchema?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  availableTools?: Array<Record<string, unknown>>;
  /** Explicit generation mode. Prefer this over embedding repair JSON in prompt text. */
  mode?: "generate" | "repair";
  /** Structured repair payload. When present, repair mode is entered without scanning prompt text. */
  repair?: RepairPayload;
  apiBaseUrl: string;
  agentSharedToken?: string;
  defaultProvider: string;
  defaultModel: string;
  defaultApiKey?: string;
  defaultBaseUrl?: string;
  renderedQualityEnabled?: boolean;
  repoRoot?: string;
  /** Abort in-flight model/tool work when the HTTP generate timeout fires. */
  signal?: AbortSignal;
}

export const SYSTEM_PROMPT = `You are MetaView's educational scene planner.

You do not write PlaybookScript JSON. You create semantic step drafts through
transaction-safe tools; MetaView compiles them into the renderer contract.

Binding inputs:
- LessonPlan defines required facts, visual roles, scene order, and conclusion.
- CoverageDecision defines the executable capability boundary.
- The effective tool inventory is runtime-enforced. Never invent or name a tool
  that is not visible in the current inventory.
- Source code and language, when supplied, are authoritative.

Workflow you MUST follow:
1. Call \`plan_outline\` FIRST, exactly once, with 8-14 ordered step titles.
2. Use deterministic runtime and animation tools before guessing. Call
   \`animation_tool_list\` for common animations such as function plots, tangents,
   integral areas, graph traversal, and subject scenes; read each \`args_schema\`
   before \`animation_tool_expand\`, and do not invent raw LayerSpec JSON. Prefer
   \`scene_sequence_blueprint.compile\` for multi-checkpoint progression and
   \`scene_blueprint.compile\` only for genuinely single-state scenes.
3. Build each visual step as an editable semantic draft. Matching
   templates return editable draft IDs without committing; select the draft before
   refining narration. For manual drafts use \`begin_step\`, visual tools,
   \`set_narration\`, optional \`set_code_highlight\`, then \`commit_step\`.
   animation_tool_expand applies deterministic layers to the active draft.
4. Verify claims and finish. Use geometry/runtime assertions for directional,
   monotonicity, and point-on-curve claims. Commit every draft in outline order;
   finalize_playbook rejects open or unresolved drafts and must be the final tool call.

Output discipline:
- Every committed step needs narration and renderer-visible content.
- Do not use algorithm arrays as placeholders for geography, biology, chemistry,
  or physics scenes.
- Per step, prefer one primary visual relation plus focused overlays.
- Never emit HTML, iframe, Manim, server-side video commands, raw Remotion code,
  or renderer-private pixel layout.
`.trim();

const TEMPLATE_DOMAINS: Record<string, SupportedDomain[]> = {
  template_array_swap: ["algorithm"],
  template_array_compare: ["algorithm"],
  template_pointer_step: ["algorithm"],
  template_tangent_at: ["math"],
  template_function_transform: ["math"],
  template_riemann_sum: ["math"],
  template_parametric_trace: ["math"],
  template_force_diagram: ["physics"],
  template_projectile_trajectory: ["physics"],
  template_shm: ["physics"],
  template_code_step: ["code", "algorithm"],
};

export async function runAgentGeneration(opts: GenerateOptions): Promise<PlaybookOutput> {
  return (await runAgentGenerationWithTrace(opts)).playbook;
}

export async function runAgentGenerationWithTrace(
  opts: GenerateOptions,
): Promise<AgentGenerationResult> {
  throwIfAborted(opts.signal);
  const trace = new AgentTraceCollector();
  const attemptId = `${opts.runId ?? "run"}:attempt:1`;
  const repairRequest = resolveRepairRequest(opts);
  const emitter = new PlaybookEmitter();
  const allowedRuntimeTools = effectiveRuntimeToolSet(opts.availableTools);
  const domain = effectiveDomain(opts.routeDecision, opts.coverageDecision);
  const signal = opts.signal;
  trace.runtime("sidecar.attempt.started", {
    attempt_id: attemptId,
    domain,
    runtime_tool_allowlist: [...allowedRuntimeTools],
    source_code_present: Boolean(opts.sourceCode),
    language: opts.language ?? null,
    constraints: opts.constraints ?? {},
  });

  let runtimePlaybook: PlaybookOutput | null = null;
  const runtimeTools = makeRuntimeToolTools({
    apiBaseUrl: opts.apiBaseUrl,
    sharedToken: opts.agentSharedToken,
    allowedRuntimeTools,
    runId: opts.runId,
    signal,
  });
  let rawTools: AgentTool[];
  let systemPrompt = SYSTEM_PROMPT;
  let repairScope: ReturnType<typeof deriveRepairScope> | null = null;
  if (repairRequest) {
    repairScope = deriveRepairScope(repairRequest.blockingIssues);
    rawTools = makeRepairTools({
      previousPlaybook: repairRequest.previousPlaybook,
      scope: repairScope,
    });
    systemPrompt = buildRepairSystemPrompt(repairScope.allowedPrefixes);
    trace.runtime("sidecar.repair_mode.started", {
      issue_codes: repairScope.issueCodes,
      allowed_prefixes: repairScope.allowedPrefixes,
      strategy: "path_scoped_json_patch",
    });
  } else {
    const drawingTools = makeDrawingTools({ emitter });
    const animationTools = allowedRuntimeTools.has("animation_tool.expand")
      ? makeAnimationToolTools({
          apiBaseUrl: opts.apiBaseUrl,
          sharedToken: opts.agentSharedToken,
          emitter,
          allowedRuntimeTools,
          runId: opts.runId,
          signal,
        })
      : [];
    const templateTools = makeTemplateTools({ emitter }).filter((tool) =>
      templateAllowed(tool.name, domain),
    );
    const assertTools = makeAssertTools({
      emitter,
      apiBaseUrl: opts.apiBaseUrl,
      sharedToken: opts.agentSharedToken,
      signal,
    });
    rawTools = [
      ...drawingTools,
      ...runtimeTools,
      ...animationTools,
      ...templateTools,
      ...filterAssertTools(assertTools, allowedRuntimeTools),
    ];
  }
  const tools = trace.wrapTools(rawTools, attemptId, () => emitter.state());
  trace.runtime("sidecar.tool_inventory.ready", {
    tool_names: tools.map((tool) => tool.name),
  });

  const providerName = opts.provider?.provider ?? opts.defaultProvider;
  const modelName = opts.provider?.model ?? opts.defaultModel;
  const apiKey = resolveOptionalEnv(opts.provider?.api_key, opts.defaultApiKey);
  const baseUrl = resolveOptionalEnv(opts.provider?.base_url, opts.defaultBaseUrl);
  const model = resolveModel(providerName, modelName, baseUrl);
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools,
    },
    getApiKey: () => apiKey,
    afterToolCall: async (context: { result: { details: unknown } }) => {
      throwIfAborted(signal);
      const playbook = extractRuntimePlaybook(context.result.details);
      if (!playbook) return undefined;
      runtimePlaybook = playbook;
      trace.runtime("sidecar.runtime_playbook.accepted", {
        step_count: playbook.steps.length,
        domain: playbook.domain,
      });
      return { terminate: true };
    },
  });

  const userPrompt = repairRequest
    ? buildRepairUserPrompt(repairRequest, repairScope ?? deriveRepairScope(repairRequest.blockingIssues))
    : buildAgentPrompt(opts);
  throwIfAborted(signal);
  await Promise.race([
    agent.prompt(userPrompt),
    abortPromise(signal),
  ]);
  throwIfAborted(signal);
  const playbook = runtimePlaybook ?? emitter.finalize();
  playbook.initial_data = {
    ...(playbook.initial_data ?? {}),
    agent_tool_trace: trace.toolEvents.slice(-64).map(
      (event) => `${event.sequence}:${event.tool}:${event.ok ? "ok" : "error"}:${event.duration_ms}ms`,
    ),
    agent_runtime_trace: trace.runtimeEvents.slice(-32).map(
      (event) => `${event.sequence}:${event.event}`,
    ),
  };
  await canonicalPreflight(opts, playbook, allowedRuntimeTools, trace);
  if (opts.renderedQualityEnabled) {
    const rendered = await validateRenderedQuality(playbook, {
      enabled: true,
      repoRoot: opts.repoRoot,
      theme: "dark",
      maximumFrames: 14,
      signal,
    });
    trace.runtime("sidecar.rendered_quality.completed", {
      status: rendered.status,
      metrics: rendered.metrics,
      issues: rendered.issues,
    });
    playbook.initial_data = {
      ...(playbook.initial_data ?? {}),
      rendered_quality: [
        `status:${rendered.status}`,
        `frames:${rendered.metrics.frame_count}`,
        `min_occupancy:${rendered.metrics.minimum_content_occupancy}`,
        `min_delta:${rendered.metrics.minimum_consecutive_pixel_delta}`,
      ],
    };
    if (rendered.status === "blocked") {
      const first = rendered.issues.find((issue) => issue.severity === "error");
      throw new Error(
        `${first?.code ?? "rendered_quality.blocked"}: ${first?.message ?? "Rendered quality gate blocked the candidate."}`,
      );
    }
  }
  throwIfAborted(signal);
  trace.runtime("sidecar.attempt.completed", {
    step_count: playbook.steps.length,
    tool_call_count: trace.toolEvents.length,
  });
  return {
    playbook,
    toolEvents: trace.toolEvents,
    runtimeEvents: trace.runtimeEvents,
  };
}


interface ParsedRepairRequest {
  previousPlaybook: PlaybookOutput;
  blockingIssues: unknown[];
  originalPrompt: string;
  reason: string;
}

/**
 * Repair mode is entered only via explicit structured signals:
 * - opts.mode === "repair", or
 * - opts.repair object present, or
 * - constraints.repair_strategy / mode explicitly requests repair (legacy prompt embedding).
 *
 * Free-text user prompts that merely mention previous_playbook + blocking_issues
 * MUST NOT force repair mode (security contract).
 */
function resolveRepairRequest(opts: GenerateOptions): ParsedRepairRequest | null {
  const structured = parseStructuredRepair(opts.repair);
  if (structured) return structured;

  const wantsRepair =
    opts.mode === "repair" ||
    opts.constraints?.repair_strategy != null ||
    opts.constraints?.mode === "repair";
  if (!wantsRepair) return null;

  return parseRepairRequestFromPrompt(opts.prompt);
}

function parseStructuredRepair(repair: RepairPayload | undefined): ParsedRepairRequest | null {
  if (!repair) return null;
  if (!isPlaybookOutput(repair.previous_playbook)) {
    throw new Error(
      "repair.previous_playbook must be a complete PlaybookOutput when repair mode is requested",
    );
  }
  return {
    previousPlaybook: repair.previous_playbook,
    blockingIssues: Array.isArray(repair.blocking_issues) ? repair.blocking_issues : [],
    originalPrompt: typeof repair.original_prompt === "string" ? repair.original_prompt : "",
    reason: typeof repair.reason === "string" ? repair.reason : "MetaView quality review",
  };
}

function parseRepairRequestFromPrompt(prompt: string): ParsedRepairRequest | null {
  if (!prompt.includes("previous_playbook") || !prompt.includes("blocking_issues")) {
    return null;
  }
  const candidate = extractFirstJsonObject(prompt);
  if (!candidate) return null;
  try {
    const payload = JSON.parse(candidate) as Record<string, unknown>;
    const previous = payload.previous_playbook;
    if (!isPlaybookOutput(previous)) return null;
    return {
      previousPlaybook: previous,
      blockingIssues: Array.isArray(payload.blocking_issues) ? payload.blocking_issues : [],
      originalPrompt: typeof payload.original_prompt === "string" ? payload.original_prompt : "",
      reason: typeof payload.reason === "string" ? payload.reason : "MetaView quality review",
    };
  } catch {
    return null;
  }
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function buildRepairSystemPrompt(allowedPrefixes: string[]): string {
  return `You are MetaView's constrained repair agent.

The previous Playbook already exists. You MUST NOT recreate it, plan a new
lesson, or call drawing/template/runtime generation tools. Your only action is
to call apply_playbook_patch exactly once with the smallest RFC 6902 patch that
resolves the supplied blocking issues.

Rules:
- use only add, remove, or replace;
- touch only these issue-scoped prefixes: ${JSON.stringify(allowedPrefixes)};
- never edit fps, total_frames, step_id, end_frame, or primary layer timing;
- preserve unrelated steps, facts, visuals, and user-authored content;
- explain the intended correction briefly in rationale;
- if a snapshot changes, the harness will mirror it to the primary layer and
  recompute derived timing deterministically.`;
}

function buildRepairUserPrompt(
  request: ParsedRepairRequest,
  scope: { allowedPrefixes: string[]; issueCodes: string[] },
): string {
  return JSON.stringify(
    {
      task: "repair_previous_playbook_with_path_scoped_patch",
      reason: request.reason,
      original_prompt: request.originalPrompt,
      blocking_issues: request.blockingIssues,
      allowed_prefixes: scope.allowedPrefixes,
      previous_playbook: request.previousPlaybook,
    },
    null,
    2,
  );
}

function effectiveRuntimeToolSet(
  manifests: Array<Record<string, unknown>> | undefined,
): Set<string> {
  // Fail-closed: missing inventory means only internal validation tools.
  // Never inject "*" — the API treats "*" as a literal name, not a superuser grant.
  const names = new Set<string>([
    "playbook.schema.validate",
    "playbook.self_check",
    "playbook.visual_progression.validate",
  ]);
  for (const manifest of manifests ?? []) {
    const name = manifest.name;
    if (typeof name === "string" && name.trim()) names.add(name);
  }
  if (names.has("scene_blueprint.compile")) {
    names.add("scene_sequence_blueprint.compile");
  }
  // Expand allowlist implies list so discovery tools stay usable without a
  // separate inventory entry.
  if (names.has("animation_tool.expand")) {
    names.add("animation_tool.list");
  }
  return names;
}

function effectiveDomain(
  routeDecision?: Record<string, unknown>,
  coverageDecision?: Record<string, unknown>,
): SupportedDomain | null {
  const candidate = coverageDecision?.domain ?? routeDecision?.domain;
  return typeof candidate === "string" && isSupportedDomain(candidate)
    ? candidate
    : null;
}

function isSupportedDomain(value: string): value is SupportedDomain {
  return [
    "algorithm",
    "math",
    "code",
    "physics",
    "chemistry",
    "biology",
    "geography",
  ].includes(value);
}

function templateAllowed(name: string, domain: SupportedDomain | null): boolean {
  const domains = TEMPLATE_DOMAINS[name];
  return !domains || domain === null || domains.includes(domain);
}

function filterAssertTools(
  tools: AgentTool[],
  allowedRuntimeTools: ReadonlySet<string>,
): AgentTool[] {
  const mapping: Record<string, string> = {
    assert_orientation: "geometry.assert_orientation",
    assert_passes_through: "geometry.assert_passes_through",
    assert_monotonic: "geometry.assert_monotonic",
  };
  return tools.filter((tool) => {
    const runtimeName = mapping[tool.name];
    // Fail-closed: require explicit allowlist entry (no "*" superuser).
    return !runtimeName || allowedRuntimeTools.has(runtimeName);
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  throw reason instanceof Error
    ? reason
    : new Error(typeof reason === "string" ? reason : "agent generation aborted");
}

function abortPromise(signal?: AbortSignal): Promise<never> {
  if (!signal) return new Promise(() => undefined);
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((_resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        reject(abortReason(signal));
      },
      { once: true },
    );
  });
}

function abortReason(signal: AbortSignal): Error {
  const reason = signal.reason;
  return reason instanceof Error
    ? reason
    : new Error(typeof reason === "string" ? reason : "agent generation aborted");
}

async function canonicalPreflight(
  opts: GenerateOptions,
  playbook: PlaybookOutput,
  allowedRuntimeTools: ReadonlySet<string>,
  trace: AgentTraceCollector,
): Promise<void> {
  throwIfAborted(opts.signal);
  const base = opts.apiBaseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.agentSharedToken) headers["X-MetaView-Agent-Token"] = opts.agentSharedToken;
  for (const tool of [
    "playbook.schema.validate",
    "playbook.self_check",
    "playbook.visual_progression.validate",
  ]) {
    throwIfAborted(opts.signal);
    const args =
      tool === "playbook.self_check"
        ? { playbook, prompt: opts.prompt }
        : { playbook };
    const response = await fetch(`${base}/api/v1/agent/runtime-tools/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tool,
        args,
        run_id: opts.runId,
        allowed_tools: [...allowedRuntimeTools],
      }),
      signal: opts.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`canonical preflight ${tool} HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }
    const payload = (await response.json()) as {
      ok?: boolean;
      result?: Record<string, unknown>;
      error?: Record<string, unknown> | null;
    };
    trace.runtime("sidecar.canonical_preflight", {
      tool,
      ok: payload.ok === true,
      result: payload.result ?? null,
      error: payload.error ?? null,
    });
    if (payload.ok !== true) {
      throw new Error(
        `${String(payload.error?.code ?? "canonical_preflight_failed")}: ${String(payload.error?.message ?? tool)}`,
      );
    }
    if (tool !== "playbook.schema.validate") {
      const status = String(payload.result?.status ?? "");
      if (status === "blocked") {
        const report = payload.result ?? {};
        trace.runtime("sidecar.preflight.blocked", {
          tool,
          report,
          repair_owner: "api",
        });
        const issues = Array.isArray(report.issues) ? report.issues : [];
        const first = issues.find(
          (issue): issue is Record<string, unknown> =>
            isRecord(issue) && issue.severity === "error",
        );
        const code =
          typeof first?.code === "string"
            ? first.code
            : `${tool.replace(/\./g, "_")}_blocked`;
        const message =
          typeof first?.message === "string"
            ? first.message
            : `canonical preflight ${tool} blocked the candidate`;
        throw new Error(`${code}: ${message}`);
      }
    }
  }
}

function resolveModel(
  providerName: string,
  modelName: string,
  baseUrl: string | undefined,
): Model<Api> {
  const registered = getModel(
    providerName as KnownProvider,
    modelName as never,
  ) as Model<Api> | undefined;
  if (registered) {
    return { ...registered, baseUrl: baseUrl ?? registered.baseUrl };
  }
  if (!baseUrl) {
    throw new Error(
      `Unsupported agent model ${providerName}/${modelName}; set AGENT_DEFAULT_BASE_URL or provider.base_url for an OpenAI-compatible endpoint.`,
    );
  }
  return {
    id: modelName,
    name: modelName,
    api: "openai-completions",
    provider: providerName,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}

function extractRuntimePlaybook(details: unknown): PlaybookOutput | null {
  if (!isRecord(details)) return null;
  if (isPlaybookOutput(details.playbook)) return details.playbook;
  if (details.ok === true && isRecord(details.result) && isPlaybookOutput(details.result.playbook)) {
    return details.result.playbook;
  }
  return null;
}

function isPlaybookOutput(value: unknown): value is PlaybookOutput {
  if (
    !isRecord(value) ||
    typeof value.fps !== "number" ||
    !Number.isFinite(value.fps) ||
    value.fps <= 0 ||
    typeof value.total_frames !== "number" ||
    !Number.isFinite(value.total_frames) ||
    value.total_frames < 1 ||
    typeof value.domain !== "string" ||
    typeof value.title !== "string" ||
    typeof value.summary !== "string" ||
    !Array.isArray(value.steps) ||
    value.steps.length === 0 ||
    !Array.isArray(value.parameter_controls)
  ) {
    return false;
  }
  return value.steps.every((step) => {
    if (!isRecord(step)) return false;
    if (typeof step.step_id !== "string" || !step.step_id.trim()) return false;
    if (typeof step.title !== "string") return false;
    if (typeof step.voiceover_text !== "string") return false;
    if (typeof step.end_frame !== "number" || !Number.isFinite(step.end_frame)) {
      return false;
    }
    if (!isRecord(step.snapshot) || typeof step.snapshot.kind !== "string") {
      return false;
    }
    if (!Array.isArray(step.layers)) return false;
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildAgentPrompt(opts: GenerateOptions): string;
export function buildAgentPrompt(
  prompt: string,
  routeDecision?: Record<string, unknown>,
  lessonPlan?: Record<string, unknown>,
  coverageDecision?: Record<string, unknown>,
): string;
export function buildAgentPrompt(
  input: GenerateOptions | string,
  routeDecision?: Record<string, unknown>,
  lessonPlan?: Record<string, unknown>,
  coverageDecision?: Record<string, unknown>,
): string {
  const opts: GenerateOptions = typeof input === "string"
    ? {
        prompt: input,
        routeDecision,
        lessonPlan,
        coverageDecision,
        apiBaseUrl: "",
        defaultProvider: "openai",
        defaultModel: "unknown",
      }
    : input;
  const sections: string[] = [];
  if (opts.lessonPlan) {
    sections.push(
      `[MetaView LessonPlan]\nBINDING read-only teaching contract. Preserve SceneIntent order and cover every required fact, visual role, narration goal, and expected conclusion.\n${JSON.stringify(opts.lessonPlan, null, 2)}`,
    );
  }
  if (opts.routeDecision) {
    sections.push(`[MetaView route decision]\n${JSON.stringify(opts.routeDecision, null, 2)}`);
  }
  if (opts.coverageDecision) {
    sections.push(
      `[MetaView coverage decision]\nBINDING runtime-enforced capability boundary.\n${JSON.stringify(opts.coverageDecision, null, 2)}`,
    );
  }
  sections.push(
    `[MetaView effective runtime tools]\n${JSON.stringify(
      [...effectiveRuntimeToolSet(opts.availableTools)],
      null,
      2,
    )}`,
  );
  sections.push(`[MetaView constraints]\n${JSON.stringify(opts.constraints ?? {}, null, 2)}`);
  if (opts.sourceCode) {
    sections.push(
      `[MetaView source code]\nlanguage=${opts.language ?? "unknown"}\n${numberSource(opts.sourceCode)}`,
    );
  }
  if (opts.playbookSchema) {
    sections.push(
      `[MetaView canonical output schema summary]\n${JSON.stringify(schemaSummary(opts.playbookSchema), null, 2)}`,
    );
  }
  sections.push(`[user prompt]\n${opts.prompt}`);
  return sections.join("\n\n");
}

function numberSource(source: string): string {
  return source
    .split("\n")
    .map((line, index) => `${String(index).padStart(4, "0")}: ${line}`)
    .join("\n");
}

function schemaSummary(schema: Record<string, unknown>): Record<string, unknown> {
  return {
    title: schema.title ?? null,
    required: schema.required ?? null,
    properties:
      isRecord(schema.properties)
        ? Object.fromEntries(
            Object.entries(schema.properties).map(([key, value]) => [
              key,
              isRecord(value)
                ? { type: value.type ?? null, ref: value.$ref ?? null, discriminator: value.discriminator ?? null }
                : value,
            ]),
          )
        : null,
  };
}

/** Compatibility export used by older tests/callers. Repairs are now API-owned. */
export function buildAgentSelfRepairPrompt(input: {
  originalPrompt: string;
  previousPlaybook: PlaybookOutput;
  report: unknown;
  repairAttempt: number;
  routeDecision?: Record<string, unknown>;
  coverageDecision?: Record<string, unknown>;
  lessonPlan?: Record<string, unknown>;
}): string {
  return `[MetaView repair request]\n${JSON.stringify(
    {
      reason: "agent self-check blocked the candidate PlaybookScript",
      instruction:
        "Return a path-scoped JSON Patch through the API repair protocol; do not rebuild the full Playbook in the sidecar.",
      original_prompt: input.originalPrompt,
      previous_playbook: input.previousPlaybook,
      route_decision: input.routeDecision ?? null,
      coverage_decision: input.coverageDecision ?? null,
      lesson_plan: input.lessonPlan ?? null,
      report: input.report,
      repair_attempt: input.repairAttempt,
    },
    null,
    2,
  )}`;
}
