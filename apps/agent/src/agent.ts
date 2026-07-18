/**
 * Wires a pi-agent-core ``Agent`` instance with the Drawing CLI + assert +
 * templates tool registry. One Agent per /generate request — the emitter is
 * scoped to that request so concurrent calls don't share state.
 */

import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { getModel, type Api, type KnownProvider, type Model } from "@earendil-works/pi-ai";

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
  coverageDecision?: Record<string, unknown>;
  lessonPlan?: Record<string, unknown>;
  playbookSchema?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  availableTools?: Array<Record<string, unknown>>;
  apiBaseUrl: string; // FastAPI base URL the agent calls back to (for asserts)
  agentSharedToken?: string;
  defaultProvider: string;
  defaultModel: string;
  defaultApiKey?: string;
  defaultBaseUrl?: string;
}

export const SYSTEM_PROMPT =
  `你是 MetaView 的教育可视化设计师。你需要调用绘图工具，构建分步骤的 PlaybookScript。

当用户提示中包含 \`[MetaView LessonPlan]\` 时，它是具有约束力的只读教学合同。必须按 SceneIntent 的顺序生成 \`plan_outline\`，覆盖每个 required fact、visual role、preferred scene type、narration goal 和 expected conclusion。不得另建教学主线，也不得把 LessonPlan 字段复制到最终 PlaybookScript。

根据教学内容决定必要的步骤数量，不要为了满足固定数量拆分步骤。通常使用 4–8 个步骤。简单而完整的讲解可以使用 3 个步骤；只有确实包含多个知识状态、推导阶段或视觉状态的复杂任务，才可以扩展到 9–12 个步骤。

只有在以下至少一项发生实质变化时，才新增步骤：
1. 当前知识状态发生变化；
2. 主要视觉对象或视觉关系发生变化；
3. 教学目标发生变化；
4. 用户需要观察新的中间结论。
如果相邻两步只有标题、字幕、公式数值或措辞变化，而主要画面和知识状态没有实质变化，应合并为同一步，或使用现有动画过程表达。禁止为了增加步骤数量生成空泛的开场、重复解释或无新信息的总结。

当用户提示中包含 \`[MetaView coverage decision]\` 时，它是具有约束力的只读能力边界。不得声称使用了其中标记为缺失的 kernel、validator、scene type、asset 或 tool。available_tool_ids 只是本次请求的能力证据，不能用来虚构未实际执行的工具结果。

必须遵循以下工作流程：

1. 首先调用 \`plan_outline\`，记录步骤标题与 domain。通常生成 4–8 个步骤，但不要求固定数量，实际允许 3–12 个步骤。
2. 在猜测之前使用确定性的 runtime 与 animation 工具。当 SkillPack kernel 或 validator 可能有帮助时，调用 \`runtime_tool_list\`；需要准确的 SkillPack/kernel/validator 事实时，调用 \`runtime_tool_execute\`。对于 geography、physics、biology 和 chemistry 可视化课程，优先使用匹配的 SkillPack runtime tool 或由 SceneBlueprint 支持的学科 renderer 路径，再考虑手工 Drawing CLI 回退。当紧凑的 SceneBlueprint 足以描述画面时，通过 \`runtime_tool_execute\` 调用 \`scene_blueprint.compile\`，并使用它产出的 renderer-ready PlaybookScript。学科视觉必须使用语义 renderer kind，例如 \`geo_map_scene\`、\`physics_force_scene\`、\`bio_cell_scene\`、\`bio_process_scene\`、\`molecule_2d_scene\` 或 \`reaction_scene\`。不得用 algorithm_array 或 algorithm_bars 代替 geography、biology 或 chemistry 画面。对于函数图像、切线、积分区域、参数曲线、图遍历、受力图、抛体运动、化学计量表、分布、遗传网格等常见教学动画，先调用 \`animation_tool_list\` / \`animation_tool_expand\`，再考虑手工组合原始 visual layer。调用 \`animation_tool_expand\` 前先读取对应工具的 \`args_schema\`；把展开后的 \`layers\` 作为确定性依据。当 registry tool 已覆盖该模式时，不得虚构原始 LayerSpec JSON。
3. 构建每个视觉步骤。如果某个 L2 \`template_*\` tool 与本步教学意图匹配，例如 array swap、tangent at a point、force diagram、projectile、SHM、Riemann sum 或 code-line trace，应先调用该工具，再通过 \`set_narration\` 调整自动生成的旁白。否则按以下顺序手工组合 L1 primitive：\`begin_step\` → \`set_axes\` → \`add_curve_*\` / \`add_point\` / \`add_arrow\` / \`add_segment\` / \`add_region\` / \`add_formula\` → \`set_narration\` → \`assert_*\` → \`commit_step\`。
4. 校验事实并完成。旁白声称“顺时针”/“逆时针”/“clockwise”/“counterclockwise”前，必须调用 \`assert_orientation\`；若 verdict 与草稿冲突，应在 \`commit_step\` 前改写旁白。旁白声称“递增”/“递减”/“increasing”/“decreasing”前，必须调用 \`assert_monotonic\` 并依据 verdict reason 表述。旁白指出曲线上某个具体点（如“初始点 (1,0)”）前，必须调用 \`assert_passes_through\`。不存在 \`add_vector_field\` tool；请使用具体的 \`add_arrow\` 调用或 \`template_parametric_trace\` 时间标记。最后调用 \`finalize_playbook\`，之后不要再调用任何工具。

旁白规则：
- 旁白必须与当前画面同步，并只补充画面无法直接表达的信息。
- 不规定最低句子数量。通常使用 1–2 句简洁旁白；只有在推导转折、误区解释或最终结论确实需要时，才使用更长旁白。
- 禁止逐字重复画面中已经清楚显示的标题、公式、标签、当前变量值、队列或访问顺序，以及图中已经直接可见的状态。
- 旁白应优先指出学生此刻需要观察什么、当前变化为什么重要，以及当前变化如何连接到下一步或结论。
- 旁白应使用自然中文，不要机械套用“首先、然后、最后”，也不要每一步重复“这一步我们将……”。用户明确要求英文输出时，可以按照用户要求输出英文教学内容；系统内部生成规则仍以本中文指引为准。

输出纪律：
- 使用可用的最具体工具，不要直接编写 CIR JSON。
- 学科视觉场景应使用 SceneBlueprint/SkillPack 支持的 renderer 输出，不得使用数组占位图。
- 每步优先使用一个图表式主要视觉元素和聚焦旁白，避免画面拥挤。
- 对数学参数轨迹，在声称 clockwise/counterclockwise 前始终调用 \`assert_orientation\`。
`.trim();

const MAX_SELF_REPAIR_ATTEMPTS = 2;

export async function runAgentGeneration(
  opts: GenerateOptions,
): Promise<PlaybookOutput> {
  let userPrompt = buildAgentPrompt(
    opts.prompt,
    opts.routeDecision,
    opts.lessonPlan,
    opts.coverageDecision,
  );
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
      coverageDecision: opts.coverageDecision,
      lessonPlan: opts.lessonPlan,
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
  const baseUrl = opts.provider?.base_url ?? opts.defaultBaseUrl;

  const model = resolveModel(providerName, modelName, baseUrl);

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

function resolveModel(
  providerName: string,
  modelName: string,
  baseUrl: string | undefined,
): Model<Api> {
  // pi-ai's getModel is strongly typed against the built-in provider/model
  // registry, but runtime config can point at OpenAI-compatible providers
  // with model IDs not present in that registry.
  const registered = getModel(
    providerName as KnownProvider,
    modelName as never,
  ) as Model<Api> | undefined;
  if (registered) {
    return {
      ...registered,
      baseUrl: baseUrl ?? registered.baseUrl,
    };
  }
  if (!baseUrl) {
    throw new Error(
      `Unsupported agent model ${providerName}/${modelName}; set AGENT_DEFAULT_BASE_URL or provider.base_url for OpenAI-compatible custom models.`,
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
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: 8192,
  };
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

export function buildAgentPrompt(
  prompt: string,
  routeDecision?: Record<string, unknown>,
  lessonPlan?: Record<string, unknown>,
  coverageDecision?: Record<string, unknown>,
): string {
  if (!routeDecision && !coverageDecision && !lessonPlan) {
    return prompt;
  }
  const sections: string[] = [];
  if (lessonPlan) {
    sections.push(
      `[MetaView LessonPlan]\n具有约束力的只读教学合同：保持 SceneIntent 顺序，覆盖每个 required fact、visual role、narration goal 和 expected conclusion。根据教学内容决定必要步骤，通常使用 4–8 步，实际允许 3–12 步；不要为了数量拆分 SceneIntent，也不要在 PlaybookScript 中输出 LessonPlan。\n${JSON.stringify(lessonPlan, null, 2)}`,
    );
  }
  if (routeDecision) {
    sections.push(
      `[MetaView route decision]\n只读路由决定：遵循其中的 destination 与 domain，不要自行改写。\n${JSON.stringify(routeDecision, null, 2)}`,
    );
  }
  if (coverageDecision) {
    sections.push(
      `[MetaView coverage decision]\n具有约束力的只读能力边界：遵循 mode、fallback_policy 和 missing_capabilities。available_tool_ids 记录相关能力证据，但不允许虚构未实际执行的工具结果。\n${JSON.stringify(coverageDecision, null, 2)}`,
    );
  }
  sections.push(`[user prompt]\n以下是用户原始请求；用户明确指定输出语言时应遵循该要求。\n${prompt}`);
  return sections.join("\n\n");
}

interface SelfRepairPromptInput {
  originalPrompt: string;
  routeDecision?: Record<string, unknown>;
  coverageDecision?: Record<string, unknown>;
  lessonPlan?: Record<string, unknown>;
  previousPlaybook: PlaybookOutput;
  report: SelfCheckReport;
  repairAttempt: number;
}

export function buildAgentSelfRepairPrompt(
  input: SelfRepairPromptInput,
): string {
  const payload = {
    reason: "Agent Self-check 阻塞了候选 PlaybookScript",
    repair_attempt: input.repairAttempt,
    max_self_repair_attempts: MAX_SELF_REPAIR_ATTEMPTS,
    original_prompt: input.originalPrompt,
    route_decision: input.routeDecision ?? null,
    coverage_decision: input.coverageDecision ?? null,
    lesson_plan: input.lessonPlan ?? null,
    previous_playbook: input.previousPlaybook,
    self_check: input.report,
    instructions: [
      "使用 Drawing CLI tools 重新构建完整的 PlaybookScript，并修复所有 error 级 Self-check 问题。",
      "lesson_plan 具有约束力：保持 SceneIntent 顺序，覆盖每个 required fact、visual role、narration goal 和 expected conclusion。",
      "根据教学内容决定必要步骤，通常使用 4–8 步，实际允许 3–12 步；不要为了数量拆分步骤。",
      "coverage_decision 具有约束力：不得虚构缺失能力，也不得声称取得未执行工具的结果。",
      "PlaybookScript 是唯一渲染出口。不得引入 raw HTML、iframe、Manim 或 server video rendering。",
      "只使用 renderer 已支持的 snapshot kind。",
      "遇到 snapshot.domain_fallback 时，使用匹配的 SkillPack runtime tool 或由 SceneBlueprint 支持的学科 renderer 重建，例如 geo_map_scene、physics_force_scene、bio_cell_scene、bio_process_scene、molecule_2d_scene 或 reaction_scene。不得只把 algorithm_array 改名来修复，必须替换视觉方案。",
      "旁白应与画面同步，通常使用 1–2 个自然片段，不设置固定旁白段数。",
      "仅在处理完所有 error 级 Self-check 问题后调用 finalize_playbook。",
    ],
  };
  return `[MetaView agent self-repair]
${JSON.stringify(payload, null, 2)}`;
}
