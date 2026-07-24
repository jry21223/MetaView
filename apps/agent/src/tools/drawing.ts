/** Transaction-safe semantic drawing tools. */

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

const DomainSchema = Type.Union([
  Type.Literal("algorithm"),
  Type.Literal("math"),
  Type.Literal("code"),
  Type.Literal("physics"),
  Type.Literal("chemistry"),
  Type.Literal("biology"),
  Type.Literal("geography"),
]);

export function makeDrawingTools(deps: DrawingToolDeps): AgentTool[] {
  const { emitter } = deps;
  const tools: AgentTool[] = [];

  tools.push(
    defineTool(
      "plan_outline",
      "Plan outline",
      "Create the authoritative 8-14 step outline. Call exactly once before any draft.",
      Type.Object({
        domain: DomainSchema,
        step_titles: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
          minItems: 8,
          maxItems: 14,
        }),
        title: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
        summary: Type.Optional(Type.String({ minLength: 1, maxLength: 600 })),
      }),
      async (args) => {
        emitter.setOutline(args.domain, args.step_titles);
        if (args.title || args.summary) {
          emitter.setSummary(args.title ?? args.step_titles[0], args.summary ?? "");
        }
        return toolResult({ ok: true as const, step_count: args.step_titles.length });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "begin_step",
      "Begin step draft",
      "Open the next outline slot as an editable step draft. Draft indices must be contiguous.",
      Type.Object({
        index: Type.Integer({ minimum: 1, maximum: 14 }),
        title: Type.String({ minLength: 1, maxLength: 100 }),
      }),
      async (args) => toolResult({ ok: true as const, draft_id: emitter.beginStep(args.index, args.title) }),
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "set_narration",
      "Set narration",
      "Replace narration on the active draft. Use sentences that explain why, what changes, and what is learned.",
      Type.Object({ text: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 8 }) }),
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
      "Set visible coordinate ranges and labels on the active draft.",
      Type.Object({
        x_min: Type.Number(),
        x_max: Type.Number(),
        y_min: Type.Optional(Type.Number()),
        y_max: Type.Optional(Type.Number()),
        x_label: Type.Optional(Type.String()),
        y_label: Type.Optional(Type.String()),
      }),
      async (args) => {
        emitter.setAxes(args.x_min, args.x_max, args.y_min, args.y_max, args.x_label, args.y_label);
        return toolResult({ ok: true as const });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_curve_parametric",
      "Add parametric curve",
      "Add a parametric curve (x(t), y(t)) to the active draft.",
      Type.Object({
        expression_x: Type.String({ minLength: 1 }),
        expression_y: Type.String({ minLength: 1 }),
        t_min: Type.Number(),
        t_max: Type.Number(),
        label: Type.String(),
        emphasis: EmphasisSchema,
        semantic_role: Type.Optional(Type.String({ minLength: 1 })),
      }),
      async (args) =>
        toolResult({
          curve_id: emitter.addCurveParametric(
            args.expression_x,
            args.expression_y,
            args.t_min,
            args.t_max,
            args.label,
            args.emphasis,
            args.semantic_role,
          ),
        }),
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_curve_1d",
      "Add 1D curve",
      "Add y=f(x) to the active draft.",
      Type.Object({
        expression: Type.String({ minLength: 1 }),
        label: Type.String(),
        emphasis: EmphasisSchema,
        x_min: Type.Optional(Type.Number()),
        x_max: Type.Optional(Type.Number()),
        semantic_role: Type.Optional(Type.String({ minLength: 1 })),
      }),
      async (args) =>
        toolResult({
          curve_id: emitter.addCurve1D(
            args.expression,
            args.label,
            args.emphasis,
            args.x_min,
            args.x_max,
            args.semantic_role,
          ),
        }),
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_point",
      "Add point",
      "Mark a point on the active draft.",
      Type.Object({
        x: Type.Number(),
        y: Type.Number(),
        label: Type.String(),
        emphasis: EmphasisSchema,
        semantic_role: Type.Optional(Type.String({ minLength: 1 })),
      }),
      async (args) =>
        toolResult({
          point_id: emitter.addPoint(args.x, args.y, args.label, args.emphasis, args.semantic_role),
        }),
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_arrow",
      "Add arrow",
      "Add one concrete direction/vector arrow. Do not fake a dense vector field.",
      Type.Object({
        x: Type.Number(),
        y: Type.Number(),
        dx: Type.Number(),
        dy: Type.Number(),
        label: Type.Optional(Type.String()),
        semantic_role: Type.Optional(Type.String({ minLength: 1 })),
      }),
      async (args) =>
        toolResult({
          segment_id: emitter.addArrow(
            args.x,
            args.y,
            args.dx,
            args.dy,
            args.label ?? "",
            args.semantic_role,
          ),
        }),
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_segment",
      "Add segment",
      "Add a line segment or arrow between two points.",
      Type.Object({
        x0: Type.Number(),
        y0: Type.Number(),
        x1: Type.Number(),
        y1: Type.Number(),
        arrow: Type.Optional(Type.Boolean()),
        label: Type.Optional(Type.String()),
        emphasis: Type.Optional(EmphasisSchema),
        semantic_role: Type.Optional(Type.String({ minLength: 1 })),
      }),
      async (args) =>
        toolResult({
          segment_id: emitter.addSegment(
            args.x0,
            args.y0,
            args.x1,
            args.y1,
            args.arrow ?? false,
            args.label ?? "",
            args.emphasis ?? "primary",
            args.semantic_role,
          ),
        }),
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_region",
      "Add region",
      "Add a polygonal filled region.",
      Type.Object({
        vertices: Type.Array(Type.Tuple([Type.Number(), Type.Number()]), { minItems: 3 }),
        label: Type.Optional(Type.String()),
        emphasis: Type.Optional(EmphasisSchema),
        semantic_role: Type.Optional(Type.String({ minLength: 1 })),
      }),
      async (args) => {
        emitter.addRegion(
          args.vertices as Array<[number, number]>,
          args.label ?? "",
          args.emphasis ?? "secondary",
          args.semantic_role,
        );
        return toolResult({ ok: true as const });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_formula",
      "Add formula",
      "Attach a KaTeX formula to the active draft.",
      Type.Object({ latex: Type.String({ minLength: 1 }) }),
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
      "Populate an algorithm array/bar state.",
      Type.Object({
        values: Type.Array(Type.String(), { minItems: 1 }),
        emphasis_map: Type.Optional(Type.Record(Type.String(), EmphasisSchema)),
      }),
      async (args) => {
        const map: Record<number, "primary" | "secondary" | "accent"> = {};
        for (const [key, value] of Object.entries(args.emphasis_map ?? {})) {
          const index = Number(key);
          if (Number.isInteger(index)) {
            map[index] = value as "primary" | "secondary" | "accent";
          }
        }
        emitter.addArrayTokens(args.values, map);
        return toolResult({ ok: true as const, count: args.values.length });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "set_code_highlight",
      "Set Code Sync state",
      "Attach source lines, active lines, and variables. Set use_code_trace_snapshot when code is the primary visual.",
      Type.Object({
        source: Type.String({ minLength: 1 }),
        language: Type.String({ minLength: 1 }),
        active_lines: Type.Array(Type.Integer({ minimum: 0 }), { minItems: 1 }),
        variables: Type.Optional(Type.Record(Type.String(), Type.String())),
        operation_label: Type.Optional(Type.String()),
        use_code_trace_snapshot: Type.Optional(Type.Boolean()),
      }),
      async (args) => {
        const lines = args.source.split("\n");
        const activeLines = [...new Set(args.active_lines as number[])].sort(
          (a: number, b: number) => a - b,
        );
        emitter.setCodeHighlight(
          {
            language: String(args.language),
            lines,
            active_lines: activeLines,
            active_line: activeLines[0],
            variables: (args.variables ?? {}) as Record<string, string>,
            operation_label: args.operation_label,
          },
          args.use_code_trace_snapshot ?? false,
        );
        return toolResult({ ok: true as const, line_count: lines.length });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "add_parameter_control",
      "Add parameter control",
      "Expose a declared parameter as a player control.",
      Type.Object({
        id: Type.String({ minLength: 1, maxLength: 32 }),
        label: Type.String(),
        value: Type.String(),
        description: Type.Optional(Type.String()),
      }),
      async (args) => {
        emitter.addParameterControl(args);
        return toolResult({ ok: true as const });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "stash_step_draft",
      "Stash step draft",
      "Save the active draft without committing it. Templates use this so narration can be refined before commit.",
      Type.Object({}),
      async () => toolResult(emitter.stashCurrentDraft()),
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "select_step_draft",
      "Select step draft",
      "Open a stashed draft for editing.",
      Type.Object({ draft_id: Type.String({ minLength: 1 }) }),
      async (args) => {
        emitter.selectStepDraft(args.draft_id);
        return toolResult({ ok: true as const, draft_id: args.draft_id });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "abort_step_draft",
      "Abort step draft",
      "Discard the most recently reserved draft.",
      Type.Object({ draft_id: Type.Optional(Type.String({ minLength: 1 })) }),
      async (args) => {
        emitter.abortStepDraft(args.draft_id);
        return toolResult({ ok: true as const });
      },
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "commit_step",
      "Commit active step",
      "Validate and commit the active draft. Commits must follow outline order.",
      Type.Object({}),
      async () => toolResult(emitter.commitStep()),
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "commit_step_draft",
      "Commit stashed step",
      "Select and commit one stashed draft in outline order.",
      Type.Object({ draft_id: Type.String({ minLength: 1 }) }),
      async (args) => toolResult(emitter.commitStepDraft(args.draft_id)),
    ) as AgentTool,
  );

  tools.push(
    defineTool(
      "commit_all_step_drafts",
      "Commit all stashed steps",
      "Commit all stashed drafts in outline order after any desired refinements.",
      Type.Object({}),
      async () => toolResult({ committed: emitter.commitAllStepDrafts() }),
    ) as AgentTool,
  );

  tools.push(
    defineTool<TSchema, { playbook: PlaybookOutput }>(
      "finalize_playbook",
      "Finalize playbook",
      "Compile the committed drafts. Finalization rejects open or unresolved drafts.",
      Type.Object({}),
      async () => toolResult({ playbook: emitter.finalize() }, { terminate: true }),
    ) as AgentTool,
  );

  return tools;
}
