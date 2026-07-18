/**
 * Runtime ToolHub bridge. These generic tools expose FastAPI-side deterministic
 * skills, validators, schema checks, and registry tools to the pi agent loop.
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

import { defineTool, toolResult } from "./common.js";

export interface RuntimeToolDeps {
  /** FastAPI base URL (e.g. ``http://api:8000``). */
  apiBaseUrl: string;
  /** Shared token accepted by FastAPI's internal agent endpoints. */
  sharedToken?: string;
}

interface RuntimeToolManifest {
  name: string;
  description: string;
  args_schema: unknown;
  domain: string;
  deterministic: boolean;
}

interface RuntimeToolListResult {
  tools: RuntimeToolManifest[];
}

interface RuntimeToolExecuteResult {
  tool: string;
  ok: boolean;
  result: unknown;
  error: Record<string, unknown> | null;
}

export function makeRuntimeToolTools(deps: RuntimeToolDeps): AgentTool[] {
  const base = deps.apiBaseUrl.replace(/\/$/, "");

  async function request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (deps.sharedToken) {
      headers["X-MetaView-Agent-Token"] = deps.sharedToken;
    }
    const resp = await fetch(`${base}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error(
        `runtime tool ${path} HTTP ${resp.status}: ${detail.slice(0, 240)}`,
      );
    }
    return (await resp.json()) as T;
  }

  return [
    defineTool(
      "runtime_tool_list",
      "列出运行时工具",
      "列出后端 RuntimeToolHub tools，包括确定性的 SkillPack、schema validation、Playbook Self-check、geometry validator 和 animation registry tool。",
      Type.Object({}),
      async () => {
        const data = await request<RuntimeToolListResult>("/api/v1/agent/runtime-tools");
        return toolResult(data);
      },
    ) as AgentTool,

    defineTool(
      "runtime_tool_execute",
      "执行运行时工具",
      "使用自由格式 JSON args 执行一个后端 RuntimeToolHub tool。需要 kernel 或 validator 的确定性结果时使用，不得猜测。",
      Type.Object({
        tool: Type.String({ minLength: 1 }),
        args: Type.Record(Type.String(), Type.Unknown(), {
          description: "所选 runtime tool 的自由格式 JSON args。",
        }),
      }),
      async (args) => {
        const data = await request<RuntimeToolExecuteResult>(
          "/api/v1/agent/runtime-tools/execute",
          {
            method: "POST",
            body: { tool: args.tool, args: args.args },
          },
        );
        return toolResult(data);
      },
    ) as AgentTool,
  ];
}
