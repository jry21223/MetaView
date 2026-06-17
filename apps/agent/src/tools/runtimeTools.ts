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
      "Runtime tools: list",
      "List backend RuntimeToolHub tools, including deterministic SkillPacks, " +
        "schema validation, Playbook self-checks, geometry validators, and " +
        "animation registry tools.",
      Type.Object({}),
      async () => {
        const data = await request<RuntimeToolListResult>("/api/v1/agent/runtime-tools");
        return toolResult(data);
      },
    ) as AgentTool,

    defineTool(
      "runtime_tool_execute",
      "Runtime tools: execute",
      "Execute one backend RuntimeToolHub tool with free-form JSON args. " +
        "Use this for deterministic kernels and validators instead of guessing.",
      Type.Object({
        tool: Type.String({ minLength: 1 }),
        args: Type.Record(Type.String(), Type.Unknown(), {
          description: "Free-form JSON args for the selected runtime tool.",
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
