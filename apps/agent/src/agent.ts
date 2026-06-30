/**
 * Wires a pi-agent-core ``Agent`` instance with the Drawing CLI + assert +
 * templates tool registry. One Agent per /generate request — the emitter is
 * scoped to that request so concurrent calls don't share state.
 */

import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { getModel, type KnownProvider } from "@earendil-works/pi-ai";

import { PlaybookEmitter } from "./state/playbookEmitter.js";
import {
  AgentSelfCheckError,
  selfCheckPlaybook,
  type SelfCheckReport,
} from "./state/playbookSelfCheck.js";
import type { PlaybookOutput } from "./state/types.js";
import { makeAssertTools } from "./tools/asserts.js";
import { makeAnimationToolTools } from "./tools/animationTools.js";
import { makeDrawingTools } from "./tools/drawing.js";
import { makeRuntimeToolTools } from "./tools/runtimeTools.js";
import { makeTemplateTools } from "./tools/templates.js";

export interface ProviderConfig {
  provider?: string; // "openai" | "anthropic" | "deepseek" | ...
  model?: string;
  api_key?: string;
  base_url?: string;
}

export interface GenerateOptions {
  runId?: string;
  prompt: string;
  sourceCode?: string | null;
  language?: string | null;
  provider?: ProviderConfig;
  routeDecision?: Record<string, unknown>;
  playbookSchema?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  availableTools?: Array<Record<string, unknown>>;
  apiBaseUrl: string; // FastAPI base URL the agent calls back to (for asserts)
  agentSharedToken?: string;
  defaultProvider: string;
  defaultModel: string;
  defaultApiKey?: string;
}

export const SYSTEM_PROMPT =
  `You are MetaView's educational visual designer. You build a
step-by-step playbook by calling drawing tools.

Workflow you MUST follow:

1. Call \`plan_outline\` FIRST. It records 8-14 step titles and the domain.
2. Use deterministic runtime and animation tools before guessing. Call
   \`runtime_tool_list\` when SkillPack kernels or validators may help, and use
   \`runtime_tool_execute\` for exact SkillPack/kernel/validator facts. For
   geography, physics, biology, and chemistry visual lessons, prefer the
   matching SkillPack runtime tool or SceneBlueprint-backed subject renderer
   path before any hand-built Drawing CLI fallback. When a compact
   SceneBlueprint can describe the scene, call \`scene_blueprint.compile\` via
   \`runtime_tool_execute\` and use its renderer-ready PlaybookScript output.
   Subject visual scenes must use semantic renderer kinds such as \`geo_map_scene\`,
   \`physics_force_scene\`, \`bio_cell_scene\`, or \`molecule_2d_scene\`.
   Do not use algorithm_array or algorithm_bars as a geography, biology, or
   chemistry placeholder. For common teaching animations, including function plots, tangents, integral areas,
   parametric curves, graph traversal, force diagrams, projectile motion,
   stoichiometry tables, distributions, inheritance grids), call
   \`animation_tool_list\` / \`animation_tool_expand\` before manually composing
   raw visual layers. Read each tool's \`args_schema\` before
   \`animation_tool_expand\`; treat expanded \`layers\` as the deterministic
   reference and do not invent raw LayerSpec JSON when a registry tool covers
   the pattern.
3. Build each visual step. If an L2 \`template_*\` tool matches the step's
   pedagogical intent (array swap, tangent at a point, force diagram,
   projectile, SHM, Riemann sum, code-line trace, …), call it FIRST and then
   refine the auto-generated narration via \`set_narration\`. Otherwise compose
   L1 primitives manually in this order: \`begin_step\` → \`set_axes\` →
   \`add_curve_*\` / \`add_point\` / \`add_arrow\` / \`add_segment\` /
   \`add_region\` / \`add_formula\` → \`set_narration\` → \`assert_*\` →
   \`commit_step\`.
4. Verify claims and finish. Any narration claiming "顺时针"/"逆时针"/
   "clockwise"/"counterclockwise" MUST be preceded by \`assert_orientation\`;
   if the verdict contradicts your draft, rewrite narration before
   \`commit_step\`. Any narration claiming "递增"/"递减"/"increasing"/
   "decreasing" MUST be preceded by \`assert_monotonic\` and use its verdict
   reason. Any narration naming a specific point on a curve ("初始点 (1,0)"
   etc.) MUST be preceded by \`assert_passes_through\`. There is NO
   \`add_vector_field\` tool; use concrete \`add_arrow\` calls or
   \`template_parametric_trace\` time markers instead. Each narration must
   combine into ≥ 3 sentences and answer "为什么需要这一步 / 这一步在做什么 /
   学到了什么". Finish with \`finalize_playbook\`; after that, do not call any
   more tools.

Output discipline:
- Use the most specific tool available; do not try to write CIR JSON directly.
- For subject visual scenes, use SceneBlueprint/SkillPack-backed renderer
  outputs instead of array placeholders.
- Per step, prefer 1 chart-like visual element + a focused narration over a
  cluttered canvas.
- For math parametric trajectories, ALWAYS \`assert_orientation\` before
  saying clockwise/counterclockwise.
`.trim();

const MAX_SELF_REPAIR_ATTEMPTS = 2;

export async function runAgentGeneration(
  opts: GenerateOptions,
): Promise<PlaybookOutput> {
  let userPrompt = buildAgentPrompt(opts.prompt, opts.routeDecision);
  let lastReport: SelfCheckReport | null = null;

  for (let attempt = 0; attempt <= MAX_SELF_REPAIR_ATTEMPTS; attempt++) {
    const playbook = await runAgentAttempt(opts, userPrompt);
    const report = selfCheckPlaybook(playbook, opts.prompt);
    if (report.status !== "blocked") {
      return playbook;
    }
    lastReport = report;
    if (attempt >= MAX_SELF_REPAIR_ATTEMPTS) {
      throw new AgentSelfCheckError(report);
    }
    userPrompt = buildAgentSelfRepairPrompt({
      originalPrompt: opts.prompt,
      routeDecision: opts.routeDecision,
      previousPlaybook: playbook,
      report,
      repairAttempt: attempt + 1,
    });
  }

  throw new AgentSelfCheckError(
    lastReport ?? { status: "blocked", issues: [] },
  );
}

async function runAgentAttempt(
  opts: GenerateOptions,
  userPrompt: string,
): Promise<PlaybookOutput> {
  const emitter = new PlaybookEmitter();
  let runtimePlaybook: PlaybookOutput | null = null;

  const drawingTools = makeDrawingTools({ emitter });
  const assertTools = makeAssertTools({ emitter, apiBaseUrl: opts.apiBaseUrl });
  const runtimeTools = makeRuntimeToolTools({
    apiBaseUrl: opts.apiBaseUrl,
    sharedToken: opts.agentSharedToken,
  });
  const animationToolBridge = makeAnimationToolTools({
    apiBaseUrl: opts.apiBaseUrl,
    sharedToken: opts.agentSharedToken,
  });
  const templateTools = makeTemplateTools({ emitter });
  const tools: AgentTool[] = [
    ...drawingTools,
    ...runtimeTools,
    ...animationToolBridge,
    ...templateTools,
    ...assertTools,
  ];

  const providerName =
    (opts.provider?.provider as string | undefined) ?? opts.defaultProvider;
  const modelName = opts.provider?.model ?? opts.defaultModel;
  const apiKey = opts.provider?.api_key ?? opts.defaultApiKey;
  const baseUrl = opts.provider?.base_url;

  // pi-ai's getModel is strongly typed against the built-in provider/model
  // registry. We deliberately cast through ``unknown`` because callers can
  // pass arbitrary OpenAI-compatible providers (DeepSeek / Qwen / vLLM) that
  // aren't in the static registry.
  const model = getModel(providerName as KnownProvider, modelName as never);
  if (baseUrl) {
    // Override the default base URL so OpenAI-compatible servers (DeepSeek,
    // local vLLM, OpenRouter, …) hit the right endpoint.
    model.baseUrl = baseUrl;
  }

  const agent = new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model,
      tools,
    },
    getApiKey: () => apiKey,
    afterToolCall: async (context) => {
      const playbook = extractRuntimePlaybook(context.result.details);
      if (!playbook) {
        return undefined;
      }
      runtimePlaybook = playbook;
      return { terminate: true };
    },
  });

  await agent.prompt(userPrompt);

  if (runtimePlaybook) {
    return runtimePlaybook;
  }
  // The emitter has all committed steps by now even if finalize_playbook
  // wasn't explicitly called — its idempotent ``finalize`` covers the case.
  return emitter.finalize();
}

function extractRuntimePlaybook(details: unknown): PlaybookOutput | null {
  if (!isRecord(details) || details.ok !== true || !isRecord(details.result)) {
    return null;
  }
  const playbook = details.result.playbook;
  if (!isPlaybookOutput(playbook)) {
    return null;
  }
  return playbook;
}

function isPlaybookOutput(value: unknown): value is PlaybookOutput {
  return (
    isRecord(value) &&
    typeof value.fps === "number" &&
    typeof value.total_frames === "number" &&
    typeof value.domain === "string" &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.steps) &&
    Array.isArray(value.parameter_controls)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildAgentPrompt(
  prompt: string,
  routeDecision?: Record<string, unknown>,
): string {
  if (!routeDecision) {
    return prompt;
  }
  return `[MetaView route decision]
${JSON.stringify(routeDecision, null, 2)}

[user prompt]
${prompt}`;
}

interface SelfRepairPromptInput {
  originalPrompt: string;
  routeDecision?: Record<string, unknown>;
  previousPlaybook: PlaybookOutput;
  report: SelfCheckReport;
  repairAttempt: number;
}

export function buildAgentSelfRepairPrompt(
  input: SelfRepairPromptInput,
): string {
  const payload = {
    reason: "agent self-check blocked the candidate PlaybookScript",
    repair_attempt: input.repairAttempt,
    max_self_repair_attempts: MAX_SELF_REPAIR_ATTEMPTS,
    original_prompt: input.originalPrompt,
    route_decision: input.routeDecision ?? null,
    previous_playbook: input.previousPlaybook,
    self_check: input.report,
    instructions: [
      "Repair by building a complete PlaybookScript through the Drawing CLI tools.",
      "Keep PlaybookScript as the only rendering exit.",
      "Do not introduce raw HTML, iframe, Manim, or server video rendering.",
      "Use only renderer-supported snapshot kinds.",
      "For snapshot.domain_fallback, rebuild through the matching SkillPack runtime tool or a SceneBlueprint-backed subject renderer such as geo_map_scene, physics_force_scene, bio_cell_scene, or molecule_2d_scene. Do not repair this by renaming algorithm_array; replace the visual plan.",
      "Call finalize_playbook only after addressing all error-level self-check issues.",
    ],
  };
  return `[MetaView agent self-repair]
${JSON.stringify(payload, null, 2)}`;
}
