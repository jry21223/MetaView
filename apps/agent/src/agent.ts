/**
 * Wires a pi-agent-core ``Agent`` instance with the Drawing CLI + assert +
 * templates tool registry. One Agent per /generate request — the emitter is
 * scoped to that request so concurrent calls don't share state.
 */

import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { getModel, type KnownProvider } from "@earendil-works/pi-ai";

import { PlaybookEmitter } from "./state/playbookEmitter.js";
import { makeAssertTools } from "./tools/asserts.js";
import { makeDrawingTools } from "./tools/drawing.js";
import { makeTemplateTools } from "./tools/templates.js";

export interface ProviderConfig {
  provider?: string; // "openai" | "anthropic" | "deepseek" | ...
  model?: string;
  api_key?: string;
  base_url?: string;
}

export interface GenerateOptions {
  prompt: string;
  provider?: ProviderConfig;
  routeDecision?: Record<string, unknown>;
  apiBaseUrl: string; // FastAPI base URL the agent calls back to (for asserts)
  defaultProvider: string;
  defaultModel: string;
  defaultApiKey?: string;
}

const SYSTEM_PROMPT = `You are MetaView's educational visual designer. You build a
step-by-step playbook by calling drawing tools.

Workflow you MUST follow:

1. Call \`plan_outline\` FIRST. It records 8-14 step titles and the domain.
2. For EACH step:
   a. If an L2 \`template_*\` tool matches the step's pedagogical intent
      (array swap, tangent at a point, force diagram, projectile, SHM,
      Riemann sum, code-line trace, …) — call it FIRST. Then refine the
      auto-generated narration via \`set_narration\` to fit this specific
      prompt.
   b. Otherwise compose L1 primitives manually:
         \`begin_step\` → \`set_axes\` → \`add_curve_*\` / \`add_point\` /
         \`add_arrow\` / \`add_segment\` / \`add_region\` / \`add_formula\` →
         \`set_narration\` → \`assert_*\` → \`commit_step\`.

3. ANY narration claiming "顺时针"/"逆时针"/"clockwise"/"counterclockwise"
   MUST be preceded by an \`assert_orientation\` call on the relevant
   parametric curve. If the verdict contradicts your draft, REWRITE narration
   before \`commit_step\`.

4. ANY narration claiming "递增"/"递减"/"increasing"/"decreasing" MUST be
   preceded by \`assert_monotonic\`. Use the verdict reason in narration.

5. ANY narration that names a specific point on a curve ("初始点 (1,0)" etc.)
   MUST be preceded by \`assert_passes_through\` on that curve.

6. There is NO \`add_vector_field\` tool. To indicate direction, use
   \`add_arrow\` at concrete points or \`template_parametric_trace\` for the
   time markers along a curve. Drawing 20+ arrows just to "show flow" is
   FORBIDDEN unless the lesson is specifically teaching flow fields, which
   is rare — almost never the right move for typical math/physics tasks.

7. Each narration must combine into ≥ 3 sentences and answer
   "为什么需要这一步 / 这一步在做什么 / 学到了什么".

8. Finish with \`finalize_playbook\`. After that, do not call any more tools.

Output discipline:
- Use the most specific tool available; do not try to write CIR JSON directly.
- Per step, prefer 1 chart-like visual element + a focused narration over a
  cluttered canvas.
- For math parametric trajectories, ALWAYS \`assert_orientation\` before
  saying clockwise/counterclockwise.
`.trim();

export async function runAgentGeneration(opts: GenerateOptions): Promise<unknown> {
  const emitter = new PlaybookEmitter();

  const drawingTools = makeDrawingTools({ emitter });
  const assertTools = makeAssertTools({ emitter, apiBaseUrl: opts.apiBaseUrl });
  const templateTools = makeTemplateTools({ emitter });
  const tools: AgentTool[] = [...drawingTools, ...templateTools, ...assertTools];

  const providerName =
    (opts.provider?.provider as string | undefined) ?? opts.defaultProvider;
  const modelName = opts.provider?.model ?? opts.defaultModel;
  const apiKey = opts.provider?.api_key ?? opts.defaultApiKey;
  const baseUrl = opts.provider?.base_url;

  // pi-ai's getModel is strongly typed against the built-in provider/model
  // registry. We deliberately cast through ``unknown`` because callers can
  // pass arbitrary OpenAI-compatible providers (DeepSeek / Qwen / vLLM) that
  // aren't in the static registry.
  const model = getModel(
    providerName as KnownProvider,
    modelName as never,
  );
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
  });

  await agent.prompt(buildAgentPrompt(opts.prompt, opts.routeDecision));

  // The emitter has all committed steps by now even if finalize_playbook
  // wasn't explicitly called — its idempotent ``finalize`` covers the case.
  return emitter.finalize();
}


function buildAgentPrompt(prompt: string, routeDecision?: Record<string, unknown>): string {
  if (!routeDecision) {
    return prompt;
  }
  return `[MetaView route decision]
${JSON.stringify(routeDecision, null, 2)}

[user prompt]
${prompt}`;
}
