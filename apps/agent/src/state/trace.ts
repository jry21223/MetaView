import { createHash } from "node:crypto";

import type { AgentTool } from "@earendil-works/pi-agent-core";

import type {
  DraftState,
  RuntimeTraceEvent,
  ToolTraceEvent,
} from "./types.js";

const SENSITIVE_KEY = /api[_-]?key|authorization|cookie|secret|token|password/i;
const MAX_TEXT_LENGTH = 240;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 100;

export class AgentTraceCollector {
  private sequence = 0;
  private readonly toolEventBuffer: ToolTraceEvent[] = [];
  private readonly runtimeEventBuffer: RuntimeTraceEvent[] = [];
  private droppedToolEvents = 0;
  private droppedRuntimeEvents = 0;
  private runtimeTruncationTimestamp: string | null = null;

  constructor(
    private readonly maxToolEvents = 512,
    private readonly maxRuntimeEvents = 256,
  ) {
    if (!Number.isInteger(maxToolEvents) || maxToolEvents < 1) {
      throw new Error("maxToolEvents must be a positive integer");
    }
    if (!Number.isInteger(maxRuntimeEvents) || maxRuntimeEvents < 1) {
      throw new Error("maxRuntimeEvents must be a positive integer");
    }
  }

  get toolEvents(): ToolTraceEvent[] {
    return [...this.toolEventBuffer];
  }

  get runtimeEvents(): RuntimeTraceEvent[] {
    const events = [...this.runtimeEventBuffer];
    if (this.droppedRuntimeEvents === 0) return events;
    const marker: RuntimeTraceEvent = {
      sequence: this.sequence + 1,
      timestamp: this.runtimeTruncationTimestamp ?? new Date().toISOString(),
      event: "trace.runtime_events_truncated",
      detail: { dropped_count: this.droppedRuntimeEvents },
    };
    if (events.length >= this.maxRuntimeEvents) events.shift();
    events.push(marker);
    return events;
  }

  runtime(event: string, detail?: Record<string, unknown>): void {
    this.appendRuntime({
      sequence: ++this.sequence,
      timestamp: new Date().toISOString(),
      event,
      detail: detail ? asRecord(redact(detail)) : undefined,
    });
  }

  wrapTools(
    tools: AgentTool[],
    attemptId: string,
    state: () => DraftState,
  ): AgentTool[] {
    return tools.map((tool) => {
      const execute = tool.execute.bind(tool);
      return {
        ...tool,
        execute: async (toolCallId: string, args: unknown) => {
          const started = Date.now();
          const before = state();
          try {
            const result = await execute(toolCallId, args as never);
            const outcome = resultOutcome(result);
            this.appendTool({
              sequence: ++this.sequence,
              timestamp: new Date().toISOString(),
              tool: tool.name,
              attempt_id: attemptId,
              ok: outcome.ok,
              duration_ms: Date.now() - started,
              args: redact(args),
              error: outcome.error,
              state_before: before,
              state_after: state(),
            });
            return result;
          } catch (error) {
            this.appendTool({
              sequence: ++this.sequence,
              timestamp: new Date().toISOString(),
              tool: tool.name,
              attempt_id: attemptId,
              ok: false,
              duration_ms: Date.now() - started,
              args: redact(args),
              error: safeError(error),
              state_before: before,
              state_after: state(),
            });
            throw error;
          }
        },
      } as AgentTool;
    });
  }

  private appendTool(event: ToolTraceEvent): void {
    if (this.toolEventBuffer.length >= this.maxToolEvents) {
      this.toolEventBuffer.shift();
      this.droppedToolEvents += 1;
    }
    this.toolEventBuffer.push(event);
    if (this.droppedToolEvents > 0) {
      const existing = this.runtimeEventBuffer.find(
        (item) => item.event === "trace.tool_events_truncated",
      );
      if (existing) {
        existing.detail = { dropped_count: this.droppedToolEvents };
      } else {
        this.runtime("trace.tool_events_truncated", {
          dropped_count: this.droppedToolEvents,
        });
      }
    }
  }

  private appendRuntime(event: RuntimeTraceEvent): void {
    if (this.runtimeEventBuffer.length >= this.maxRuntimeEvents) {
      this.runtimeEventBuffer.shift();
      this.droppedRuntimeEvents += 1;
      this.runtimeTruncationTimestamp ??= new Date().toISOString();
    }
    this.runtimeEventBuffer.push(event);
  }
}

function resultOutcome(result: unknown): { ok: boolean; error?: string } {
  if (!isRecord(result) || !isRecord(result.details)) return { ok: true };
  if (typeof result.details.ok !== "boolean") return { ok: true };
  if (result.details.ok) return { ok: true };
  return {
    ok: false,
    error: safeError(result.details.error ?? "tool returned ok=false"),
  };
}

function redact(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    if (value.length > MAX_TEXT_LENGTH) {
      return {
        sha256: createHash("sha256").update(value).digest("hex"),
        length: value.length,
      };
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redact(item, key));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_OBJECT_KEYS)
        .map(([childKey, child]) => [childKey, redact(child, childKey)]),
    );
  }
  return value;
}

function safeError(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : JSON.stringify(redact(error));
  const value = redact(raw ?? "unknown tool error", "error");
  return typeof value === "string" ? value : JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}
