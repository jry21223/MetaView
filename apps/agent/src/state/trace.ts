import { createHash } from "node:crypto";

import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { RuntimeTraceEvent, ToolTraceEvent } from "./types.js";

const SENSITIVE_KEY = /api[_-]?key|authorization|cookie|secret|token|password/i;
const LARGE_TEXT_KEY = /source|code|prompt|schema/i;

export class AgentTraceCollector {
  private sequence = 0;
  readonly toolEvents: ToolTraceEvent[] = [];
  readonly runtimeEvents: RuntimeTraceEvent[] = [];

  runtime(event: string, detail?: Record<string, unknown>): void {
    this.runtimeEvents.push({
      sequence: ++this.sequence,
      timestamp: new Date().toISOString(),
      event,
      detail: detail ? redact(detail) as Record<string, unknown> : undefined,
    });
  }

  wrapTools(tools: AgentTool[], attemptId: string, state: () => string): AgentTool[] {
    return tools.map((tool) => {
      const execute = tool.execute.bind(tool);
      return {
        ...tool,
        execute: async (toolCallId: string, args: unknown) => {
          const started = Date.now();
          const before = state();
          try {
            const result = await execute(toolCallId, args as never);
            this.toolEvents.push({
              sequence: ++this.sequence,
              timestamp: new Date().toISOString(),
              tool: tool.name,
              attempt_id: attemptId,
              ok: true,
              duration_ms: Date.now() - started,
              args: redact(args),
              state_before: before,
              state_after: state(),
            });
            return result;
          } catch (error) {
            this.toolEvents.push({
              sequence: ++this.sequence,
              timestamp: new Date().toISOString(),
              tool: tool.name,
              attempt_id: attemptId,
              ok: false,
              duration_ms: Date.now() - started,
              args: redact(args),
              error: error instanceof Error ? error.message : String(error),
              state_before: before,
              state_after: state(),
            });
            throw error;
          }
        },
      } as AgentTool;
    });
  }
}

function redact(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    if (LARGE_TEXT_KEY.test(key) && value.length > 240) {
      return {
        sha256: createHash("sha256").update(value).digest("hex"),
        length: value.length,
        preview: value.slice(0, 120),
      };
    }
    return value.length > 1000 ? `${value.slice(0, 1000)}…` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([childKey, child]) => [childKey, redact(child, childKey)]),
    );
  }
  return value;
}
