/**
 * Self-check tools. Each one POSTs to the FastAPI ``/api/v1/agent/assert/*``
 * endpoints which evaluate the property with sympy and return a deterministic
 * verdict. The LLM must call these BEFORE writing narration that claims
 * "clockwise" / "counterclockwise" / "increasing" / "passes through (x, y)".
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { PlaybookEmitter } from "../state/playbookEmitter.js";
import { defineTool, toolResult } from "./common.js";

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
      "校验参数曲线旋向",
      "询问 geometry validator：当前步骤中已添加的参数曲线是 clockwise 还是 counterclockwise。旁白声称顺/逆时针前必须调用，并传入 add_curve_parametric 返回的 curve_id。",
      Type.Object({
        curve_id: Type.Integer(),
      }),
      async (args) => {
        const resolved = emitter.resolveParametricCurve(args.curve_id);
        if (!resolved.ok) {
          return toolResult<OrientationResult>({
            direction: "error",
            reason: resolved.reason,
          });
        }
        const data = await post<OrientationResult>("/api/v1/agent/assert/orientation", {
          expression_x: resolved.expression_x,
          expression_y: resolved.expression_y,
          t_min: resolved.t_min,
          t_max: resolved.t_max,
        });
        return toolResult(data);
      },
    ) as AgentTool,

    defineTool(
      "assert_passes_through",
      "校验曲线经过点",
      "确认当前步骤中已添加的参数曲线是否在可选 tolerance（默认 0.01）内经过指定点。旁白声称“初始点 (x, y)”或“终点 (x, y)”时使用。",
      Type.Object({
        curve_id: Type.Integer(),
        x: Type.Number(),
        y: Type.Number(),
        tol: Type.Optional(Type.Number({ minimum: 0 })),
      }),
      async (args) => {
        const resolved = emitter.resolveParametricCurve(args.curve_id);
        if (!resolved.ok) {
          return toolResult<PassesThroughResult>({
            passes: false,
            closest_t: null,
            distance: null,
            reason: resolved.reason,
          });
        }
        const data = await post<PassesThroughResult>(
          "/api/v1/agent/assert/passes-through",
          {
            expression_x: resolved.expression_x,
            expression_y: resolved.expression_y,
            t_min: resolved.t_min,
            t_max: resolved.t_max,
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
      "校验区间单调性",
      "检查一维函数 y=f(x) 在指定区间是 increasing、decreasing、mixed 还是 constant。旁白声称“在该区间递增/递减”时使用。",
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
