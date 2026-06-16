/**
 * Animation Tool Registry bridge. These tools let the Node sidecar discover
 * and expand backend-registered animation macros, while keeping PlaybookScript
 * emission on the existing Drawing CLI path.
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

import { defineTool, toolResult } from "./common.js";

export interface AnimationToolDeps {
  /** FastAPI base URL (e.g. ``http://api:8000``). */
  apiBaseUrl: string;
  /** Shared token accepted by FastAPI's internal agent endpoints. */
  sharedToken?: string;
}

interface AnimationToolInfo {
  name: string;
  description: string;
  args_schema: unknown;
}

interface AnimationToolIssue {
  code: string;
  tool: string;
  path: string;
  message: string;
}

interface AnimationToolListResult {
  tools: AnimationToolInfo[];
}

interface AnimationToolExpandResult {
  layers: unknown[];
  issues: AnimationToolIssue[];
}

export function makeAnimationToolTools(deps: AnimationToolDeps): AgentTool[] {
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
        `animation tool ${path} HTTP ${resp.status}: ${detail.slice(0, 240)}`,
      );
    }
    return (await resp.json()) as T;
  }

  return [
    defineTool(
      "animation_tool_list",
      "Animation tools: list",
      "List backend-registered Animation Tool Registry macros. Call this " +
        "before manually drawing common animation patterns so you can use a " +
        "deterministic registry tool when one matches.",
      Type.Object({}),
      async () => {
        const data = await request<AnimationToolListResult>(
          "/api/v1/agent/animation-tools",
        );
        return toolResult(data);
      },
    ) as AgentTool,

    defineTool(
      "animation_tool_expand",
      "Animation tools: expand",
      "Expand one backend Animation Tool Registry macro into deterministic " +
        "LayerSpec JSON. Use the returned layers as the source of truth for " +
        "common animations instead of inventing raw layer JSON by hand.",
      Type.Object({
        tool: Type.String({ minLength: 1 }),
        args: Type.Record(Type.String(), Type.Unknown(), {
          description: "Free-form JSON args for the selected animation tool.",
        }),
      }),
      async (args) => {
        const data = await request<AnimationToolExpandResult>(
          "/api/v1/agent/animation-tools/expand",
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
