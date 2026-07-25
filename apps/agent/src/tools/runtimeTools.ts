/** Runtime ToolHub bridge with request-scoped capability enforcement. */

import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

import { defineTool, toolResult } from "./common.js";

export interface RuntimeToolDeps {
  apiBaseUrl: string;
  sharedToken?: string;
  allowedRuntimeTools?: ReadonlySet<string>;
  runId?: string;
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
  const allowed = deps.allowedRuntimeTools;

  async function request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (deps.sharedToken) headers["X-MetaView-Agent-Token"] = deps.sharedToken;
    const response = await fetch(`${base}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`runtime tool ${path} HTTP ${response.status}: ${detail.slice(0, 240)}`);
    }
    return (await response.json()) as T;
  }

  function isAllowed(name: string): boolean {
    // Fail-closed: missing allowlist denies non-internal tools. "*" is not a
    // superuser grant (API also rejects it as a wildcard).
    if (!allowed) {
      return (
        name === "playbook.schema.validate" ||
        name === "playbook.self_check" ||
        name === "playbook.visual_progression.validate"
      );
    }
    return (
      allowed.has(name) ||
      name === "playbook.schema.validate" ||
      name === "playbook.self_check" ||
      name === "playbook.visual_progression.validate"
    );
  }

  function assertAllowed(name: string): void {
    if (!isAllowed(name)) {
      throw new Error(`runtime capability ${JSON.stringify(name)} is not allowed for this run`);
    }
  }

  return [
    defineTool(
      "runtime_tool_list",
      "Runtime tools: list",
      "List the deterministic backend capabilities authorized for the current run.",
      Type.Object({}),
      async () => {
        const data = await request<RuntimeToolListResult>("/api/v1/agent/runtime-tools");
        return toolResult({ tools: data.tools.filter((tool) => isAllowed(tool.name)) });
      },
    ) as AgentTool,

    defineTool(
      "runtime_tool_execute",
      "Runtime tools: execute",
      "Execute one authorized deterministic backend capability.",
      Type.Object({
        tool: Type.String({ minLength: 1 }),
        args: Type.Record(Type.String(), Type.Unknown(), {
          description: "Arguments matching the selected runtime tool schema.",
        }),
      }),
      async (args) => {
        assertAllowed(args.tool);
        const data = await request<RuntimeToolExecuteResult>(
          "/api/v1/agent/runtime-tools/execute",
          {
            method: "POST",
            body: {
              tool: args.tool,
              args: args.args,
              run_id: deps.runId,
              allowed_tools: allowed ? [...allowed] : [],
            },
          },
        );
        if (!data.ok) {
          const code = String(data.error?.code ?? "runtime_tool.failed");
          const message = String(data.error?.message ?? `runtime tool ${args.tool} failed`);
          throw new Error(`${code}: ${message}`);
        }
        return toolResult(data);
      },
    ) as AgentTool,
  ];
}
