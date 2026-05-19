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
      "Plan outline",
      "Decide which 8-14 step titles to use for this playbook. Call this " +
        "FIRST so subsequent begin_step calls have a stable index range. " +
        "Domain must be one of algorithm/math/code/physics/chemistry/biology/geography.",
      Type.Object({
        domain: Type.String({ description: "lower-case topic domain" }),
        step_titles: Type.Array(Type.String(), { minItems: 4, maxItems: 16 }),
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
      "Begin step",
      "Open a new step. Subsequent draw / narration calls operate on this " +
        "step until commit_step is called.",
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
      "Set narration",
      "Replace the current step's narration text. Pass an array of strings " +
        "(each element is a sentence). Must answer 为什么 → 做什么 → 学到了什么.",
      Type.Object({
        text: Type.Array(Type.String(), { minItems: 1, maxItems: 8 }),
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
      "Set axes",
      "Set the visible coordinate ranges and axis labels for the current " +
        "step. Recommended for math scene/function steps.",
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
      "Add parametric curve",
      "Add a parametric curve ``(x(t), y(t))`` over ``[t_min, t_max]``. " +
        "Expressions use the same character set MathPlotRenderer accepts " +
        "(sin/cos/exp/log + parameters).",
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
      "Add 1D curve",
      "Add a 1-D function y=f(x). Use this for typical math function plots, " +
        "tangent lines, derivative comparisons, integrals (with shade_from/to " +
        "set elsewhere).",
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
      "Add point",
      "Mark a single point on the scene.",
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
      "Add arrow",
      "Draw a single arrow from (x, y) with direction (dx, dy). Use this to " +
        "indicate motion direction at concrete points. There is NO " +
        "add_vector_field tool — drawing 20+ arrows just to show flow is " +
        "forbidden unless the lesson is specifically teaching flow fields.",
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
      "Add segment",
      "Draw a line segment (with optional arrowhead).",
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
      "Add region",
      "Fill a polygon defined by its vertices.",
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
      "Add formula",
      "Attach a KaTeX formula to the current step (rendered as overlay).",
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
      "Add array tokens",
      "Populate the current step with a sequence of array element tokens. " +
        "Use this for algorithm visualizations (sorting, search).",
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
      "Add parameter control",
      "Expose a free parameter (e.g. ``a`` in ``a*x + b``) as a slider in " +
        "the player. Use one per parameter referenced in your curve expressions.",
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
      "Commit step",
      "Finalize the current step's data and append it to the playbook. " +
        "After this you can either begin_step again or finalize_playbook.",
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
      "Finalize playbook",
      "Materialize the complete PlaybookScript. The agent loop terminates " +
        "after this — do NOT issue any more tool calls afterward.",
      Type.Object({}),
      async () => toolResult({ playbook: emitter.finalize() }, { terminate: true }),
    ) as AgentTool,
  );

  return tools;
}
