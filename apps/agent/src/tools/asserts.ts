/**
 * Self-check tools. Each one POSTs to the FastAPI ``/api/v1/agent/assert/*``
 * endpoints which evaluate the property with sympy and return a deterministic
 * verdict. The LLM must call these BEFORE writing narration that claims
 * "clockwise" / "counterclockwise" / "increasing" / "passes through (x, y)".
 */

import { Type, type Static, type TSchema } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";

import type { PlaybookEmitter } from "../state/playbookEmitter.js";

export interface AssertToolDeps {
  emitter: PlaybookEmitter;
  /** FastAPI base URL (e.g. ``http://api:8000``). */
  apiBaseUrl: string;
}

interface OrientationResult {
  direction: "clockwise" | "counterclockwise" | "static" | "error";
  reason: string;
}

interface PassesThroughResult {
  passes: boolean;
  closest_t: number | null;
  distance: number | null;
  reason: string;
}

interface MonotonicResult {
  verdict: "increasing" | "decreasing" | "mixed" | "constant" | "error";
  reason: string;
}

function toolResult<T>(details: T): AgentToolResult<T> {
  return {
    content: [{ type: "text", text: JSON.stringify(details) }],
    details,
  };
}

function defineTool<S extends TSchema, D>(
  name: string,
  label: string,
  description: string,
  parameters: S,
  execute: (params: Static<S>) => Promise<AgentToolResult<D>>,
): AgentTool<S, D> {
  return {
    name,
    label,
    description,
    parameters,
    execute: async (_toolCallId, params) => execute(params),
  };
}

export function makeAssertTools(deps: AssertToolDeps): AgentTool[] {
  const { emitter, apiBaseUrl } = deps;
  const base = apiBaseUrl.replace(/\/$/, "");

  async function post<T>(path: string, body: unknown): Promise<T> {
    const resp = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error(`assert ${path} HTTP ${resp.status}: ${detail.slice(0, 240)}`);
    }
    return (await resp.json()) as T;
  }

  return [
    defineTool(
      "assert_orientation",
      "Assert: parametric orientation",
      "Ask the geometry validator whether a parametric curve already added " +
        "to the current step traces clockwise or counterclockwise. Call this " +
        "BEFORE writing narration that says 顺/逆时针. Pass the curve_id " +
        "returned by add_curve_parametric.",
      Type.Object({
        curve_id: Type.Integer(),
      }),
      async (args) => {
        const curve = emitter.getCurrentCurve(args.curve_id);
        if (
          !curve ||
          !curve.is_parametric ||
          curve.expression_x == null ||
          curve.t_min == null ||
          curve.t_max == null
        ) {
          return toolResult<OrientationResult>({
            direction: "error",
            reason: `curve_id ${args.curve_id} is not a parametric curve in the current step`,
          });
        }
        const data = await post<OrientationResult>("/api/v1/agent/assert/orientation", {
          expression_x: curve.expression_x,
          expression_y: curve.expression_y,
          t_min: curve.t_min,
          t_max: curve.t_max,
        });
        return toolResult(data);
      },
    ) as AgentTool,

    defineTool(
      "assert_passes_through",
      "Assert: point on curve",
      "Confirm that a parametric curve already added to the current step " +
        "passes through a specific point (within an optional tolerance, " +
        "default 0.01). Use this when narration claims '初始点 (x, y)' or " +
        "'终点 (x, y)'.",
      Type.Object({
        curve_id: Type.Integer(),
        x: Type.Number(),
        y: Type.Number(),
        tol: Type.Optional(Type.Number({ minimum: 0 })),
      }),
      async (args) => {
        const curve = emitter.getCurrentCurve(args.curve_id);
        if (
          !curve ||
          !curve.is_parametric ||
          curve.expression_x == null ||
          curve.t_min == null ||
          curve.t_max == null
        ) {
          return toolResult<PassesThroughResult>({
            passes: false,
            closest_t: null,
            distance: null,
            reason: `curve_id ${args.curve_id} is not a parametric curve in the current step`,
          });
        }
        const data = await post<PassesThroughResult>(
          "/api/v1/agent/assert/passes-through",
          {
            expression_x: curve.expression_x,
            expression_y: curve.expression_y,
            t_min: curve.t_min,
            t_max: curve.t_max,
            target_x: args.x,
            target_y: args.y,
            tol: args.tol ?? 0.01,
          },
        );
        return toolResult(data);
      },
    ) as AgentTool,

    defineTool(
      "assert_monotonic",
      "Assert: monotonic over interval",
      "Check whether a 1-D function y=f(x) is increasing, decreasing, mixed, " +
        "or constant over an interval. Use this when narration claims " +
        "'在该区间递增/递减'.",
      Type.Object({
        expression: Type.String({ minLength: 1 }),
        x_min: Type.Number(),
        x_max: Type.Number(),
      }),
      async (args) => {
        const data = await post<MonotonicResult>("/api/v1/agent/assert/monotonic", {
          expression: args.expression,
          x_min: args.x_min,
          x_max: args.x_max,
        });
        return toolResult(data);
      },
    ) as AgentTool,
  ];
}
