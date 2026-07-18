/**
 * L1 atomic drawing tools wired into pi-agent-core. Each tool mutates a
 * PlaybookEmitter and returns a small JSON result the LLM can read back.
 *
 * Tool definitions deliberately omit ``add_vector_field`` — to indicate flow
 * the agent must place individual arrows via ``add_arrow``. This is the
 * single biggest pedagogical guardrail in the new pipeline.
 */

import { Type, type TSchema } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { PlaybookEmitter } from "../state/playbookEmitter.js";
import type { PlaybookOutput } from "../state/types.js";
import { defineTool, toolResult } from "./common.js";

export interface DrawingToolDeps {
  emitter: PlaybookEmitter;
}

const EmphasisSchema = Type.Union([
  Type.Literal("primary"),
  Type.Literal("secondary"),
  Type.Literal("accent"),
]);

export function makeDrawingTools(deps: DrawingToolDeps): AgentTool[] {
  const { emitter } = deps;
  const tools: AgentTool[] = [];

  tools.push(
    defineTool(
      "plan_outline",
      "规划教学步骤",
      "根据教学内容决定本次 Playbook 的步骤标题。通常生成 4–8 个步骤，但不要求固定数量；实际允许 3–12 个步骤。" +
        "必须首先调用，以便后续 begin_step 使用稳定的 index 范围。" +
        "domain 必须是 algorithm/math/code/physics/chemistry/biology/geography 之一。",
      Type.Object({
        domain: Type.String({ description: "小写主题 domain" }),
        step_titles: Type.Array(Type.String(), { minItems: 3, maxItems: 12 }),
        title: Type.Optional(Type.String()),
        summary: Type.Optional(Type.String()),
      }),
      async (args) => {
        emitter.setOutline(args.domain, args.step_titles);
        if (args.title || args.summary) {
          emitter.setSummary(args.title ?? "MetaView Playbook", args.summary ?? "");
        }
        return toolResult({ ok: true as const, step_count: args.step_titles.length });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "begin_step",
      "开始步骤",
      "打开一个新步骤。在调用 commit_step 前，后续绘图和旁白调用都作用于当前步骤。",
      Type.Object({
        index: Type.Integer({ minimum: 1 }),
        title: Type.String({ minLength: 1, maxLength: 80 }),
      }),
      async (args) => {
        emitter.beginStep(args.index, args.title);
        return toolResult({ ok: true as const });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "set_narration",
      "设置旁白",
      "设置当前步骤的旁白。数组中的每个元素表示一个自然字幕片段，而不是必须完成的固定句式。" +
        "优先使用 1–2 个片段，只有必要时才增加。旁白应与画面同步，并只补充画面无法直接表达的信息。",
      Type.Object({
        text: Type.Array(Type.String(), { minItems: 1, maxItems: 4 }),
      }),
      async (args) => {
        emitter.setNarration(args.text);
        return toolResult({ ok: true as const, voiceover_length: args.text.join(" ").length });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "set_axes",
      "设置坐标轴",
      "设置当前步骤可见的坐标范围和轴标签，建议用于 math scene 或函数图像步骤。",
      Type.Object({
        x_min: Type.Number(),
        x_max: Type.Number(),
        y_min: Type.Optional(Type.Number()),
        y_max: Type.Optional(Type.Number()),
        x_label: Type.Optional(Type.String()),
        y_label: Type.Optional(Type.String()),
      }),
      async (args) => {
        emitter.setAxes(
          args.x_min,
          args.x_max,
          args.y_min,
          args.y_max,
          args.x_label,
          args.y_label,
        );
        return toolResult({ ok: true as const });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_curve_parametric",
      "添加参数曲线",
      "在 ``[t_min, t_max]`` 上添加参数曲线 ``(x(t), y(t))``。expression 使用 MathPlotRenderer 接受的字符集（sin/cos/exp/log 与参数）。",
      Type.Object({
        expression_x: Type.String({ minLength: 1 }),
        expression_y: Type.String({ minLength: 1 }),
        t_min: Type.Number(),
        t_max: Type.Number(),
        label: Type.String(),
        emphasis: EmphasisSchema,
      }),
      async (args) => {
        const id = emitter.addCurveParametric(
          args.expression_x,
          args.expression_y,
          args.t_min,
          args.t_max,
          args.label,
          args.emphasis,
        );
        return toolResult({ curve_id: id });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_curve_1d",
      "添加一维曲线",
      "添加一维函数 y=f(x)。用于常见函数图像、切线、导数比较和积分区域；shade_from/to 在其他调用中设置。",
      Type.Object({
        expression: Type.String({ minLength: 1 }),
        label: Type.String(),
        emphasis: EmphasisSchema,
        x_min: Type.Optional(Type.Number()),
        x_max: Type.Optional(Type.Number()),
      }),
      async (args) => {
        const id = emitter.addCurve1D(
          args.expression,
          args.label,
          args.emphasis,
          args.x_min,
          args.x_max,
        );
        return toolResult({ curve_id: id });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_point",
      "添加点",
      "在当前画面中标记一个点。",
      Type.Object({
        x: Type.Number(),
        y: Type.Number(),
        label: Type.String(),
        emphasis: EmphasisSchema,
      }),
      async (args) => {
        const id = emitter.addPoint(args.x, args.y, args.label, args.emphasis);
        return toolResult({ point_id: id });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_arrow",
      "添加箭头",
      "从 (x, y) 沿 (dx, dy) 方向绘制一个箭头，用于指出具体位置的运动方向。" +
        "不存在 add_vector_field tool；除非课程专门讲解 flow field，否则禁止仅为表示流向而绘制 20 个以上箭头。",
      Type.Object({
        x: Type.Number(),
        y: Type.Number(),
        dx: Type.Number(),
        dy: Type.Number(),
        label: Type.Optional(Type.String()),
      }),
      async (args) => {
        const id = emitter.addArrow(args.x, args.y, args.dx, args.dy, args.label ?? "");
        return toolResult({ segment_id: id });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_segment",
      "添加线段",
      "绘制一条线段，并可选择添加箭头。",
      Type.Object({
        x0: Type.Number(),
        y0: Type.Number(),
        x1: Type.Number(),
        y1: Type.Number(),
        arrow: Type.Optional(Type.Boolean()),
        label: Type.Optional(Type.String()),
      }),
      async (args) => {
        const id = emitter.addSegment(
          args.x0, args.y0, args.x1, args.y1, args.arrow ?? false, args.label ?? "",
        );
        return toolResult({ segment_id: id });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_region",
      "添加区域",
      "填充由 vertices 定义的多边形区域。",
      Type.Object({
        vertices: Type.Array(
          Type.Tuple([Type.Number(), Type.Number()]),
          { minItems: 3 },
        ),
        label: Type.Optional(Type.String()),
        emphasis: Type.Optional(EmphasisSchema),
      }),
      async (args) => {
        emitter.addRegion(
          args.vertices as Array<[number, number]>,
          args.label ?? "",
          args.emphasis ?? "secondary",
        );
        return toolResult({ ok: true as const });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_formula",
      "添加公式",
      "向当前步骤添加 KaTeX 公式，并作为 overlay 渲染。",
      Type.Object({
        latex: Type.String({ minLength: 1 }),
      }),
      async (args) => {
        emitter.addFormula(args.latex);
        return toolResult({ ok: true as const });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_array_tokens",
      "添加数组元素",
      "向当前步骤加入一组数组元素 token，用于排序、查找等 algorithm 可视化。",
      Type.Object({
        values: Type.Array(Type.String(), { minItems: 1 }),
        emphasis_map: Type.Optional(Type.Record(Type.String(), EmphasisSchema)),
      }),
      async (args) => {
        const intMap: Record<number, "primary" | "secondary" | "accent"> = {};
        if (args.emphasis_map) {
          for (const [k, v] of Object.entries(args.emphasis_map)) {
            const idx = Number(k);
            if (Number.isFinite(idx)) intMap[idx] = v as "primary" | "secondary" | "accent";
          }
        }
        emitter.addArrayTokens(args.values, intMap);
        return toolResult({ ok: true as const, count: args.values.length });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_parameter_control",
      "添加参数控件",
      "把自由参数（例如 ``a*x + b`` 中的 ``a``）作为播放器 slider。curve expression 引用的每个参数使用一个控件。",
      Type.Object({
        id: Type.String({ minLength: 1, maxLength: 32 }),
        label: Type.String(),
        value: Type.String(),
        description: Type.Optional(Type.String()),
      }),
      async (args) => {
        emitter.addParameterControl({
          id: args.id,
          label: args.label,
          value: args.value,
          description: args.description,
        });
        return toolResult({ ok: true as const });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "commit_step",
      "提交步骤",
      "完成当前步骤数据并追加到 Playbook。之后可以继续 begin_step，或调用 finalize_playbook。",
      Type.Object({}),
      async () => {
        const result = emitter.commitStep();
        return toolResult(result);
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool<TSchema, { playbook: PlaybookOutput }>(
      "finalize_playbook",
      "完成 Playbook",
      "生成完整的 PlaybookScript。调用后 Agent loop 会终止，不得再发起任何工具调用。",
      Type.Object({}),
      async () => toolResult({ playbook: emitter.finalize() }, { terminate: true }),
    ) as AgentTool,
  );

  return tools;
}
