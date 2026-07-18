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
      "列出动画工具",
      "列出后端 Animation Tool Registry 中已注册的 macro。手工绘制常见动画模式前先调用；如果已有匹配项，应使用确定性的 registry tool。",
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
      "展开动画工具",
      "将一个后端 Animation Tool Registry macro 展开为确定性的 LayerSpec JSON。把返回的 layers 作为常见动画的事实来源，不要手工虚构原始 layer JSON。",
      Type.Object({
        tool: Type.String({ minLength: 1 }),
        args: Type.Record(Type.String(), Type.Unknown(), {
          description: "所选 animation tool 的自由格式 JSON args。",
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
