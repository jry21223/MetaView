import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

import { PlaybookEmitter } from "../src/state/playbookEmitter.js";
import { AgentTraceCollector } from "../src/state/trace.js";
import type { DraftState } from "../src/state/types.js";

function tool(
  name: string,
  execute: (args: unknown) => Promise<unknown>,
): AgentTool {
  return {
    name,
    label: name,
    description: name,
    parameters: Type.Object({}),
    execute: async (_toolCallId: string, args: unknown) => execute(args),
  } as AgentTool;
}

describe("AgentTraceCollector", () => {
  it("observes the existing emitter lifecycle without changing it", () => {
    const emitter = new PlaybookEmitter();
    expect(emitter.state()).toBe("empty");
    emitter.setOutline("math", ["Introduce the function"]);
    expect(emitter.state()).toBe("outlined");
    emitter.beginStep(1, "Introduce the function");
    expect(emitter.state()).toBe("draft_open");
    emitter.setNarration(["Introduce the function with a concrete example."]);
    emitter.addFormula("f(x)=x^2");
    emitter.commitStep();
    expect(emitter.state()).toBe("outlined");
    emitter.finalize();
    expect(emitter.state()).toBe("finalized");
  });

  it("records state transitions and redacts bounded arguments", async () => {
    let state: DraftState = "empty";
    const collector = new AgentTraceCollector();
    const [wrapped] = collector.wrapTools(
      [
        tool("plan_outline", async () => {
          state = "outlined";
          return { content: [], details: { accepted: true } };
        }),
      ],
      "run-1:attempt:1",
      () => state,
    );

    await wrapped.execute("call-1", {
      token: "secret-value",
      prompt: "x".repeat(241),
      values: Array.from({ length: 60 }, (_, index) => index),
    } as never);

    const [event] = collector.toolEvents;
    expect(event.ok).toBe(true);
    expect(event.state_before).toBe("empty");
    expect(event.state_after).toBe("outlined");
    expect(event.args).toMatchObject({
      token: "[REDACTED]",
      prompt: { length: 241 },
    });
    expect((event.args as { values: unknown[] }).values).toHaveLength(50);
  });

  it("treats a structured ok=false result as a failed tool event", async () => {
    const collector = new AgentTraceCollector();
    const [wrapped] = collector.wrapTools(
      [
        tool("runtime_tool_execute", async () => ({
          content: [],
          details: {
            ok: false,
            error: {
              code: "runtime_tool.capability_denied",
              token: "must-not-leak",
            },
          },
        })),
      ],
      "run-1:attempt:1",
      () => "empty",
    );

    await wrapped.execute("call-1", {} as never);

    expect(collector.toolEvents[0]).toMatchObject({
      ok: false,
      tool: "runtime_tool_execute",
    });
    expect(collector.toolEvents[0].error).toContain(
      "runtime_tool.capability_denied",
    );
    expect(collector.toolEvents[0].error).not.toContain("must-not-leak");
  });

  it("records thrown failures and rethrows the original error", async () => {
    const collector = new AgentTraceCollector();
    const failure = new Error("tool exploded");
    const [wrapped] = collector.wrapTools(
      [tool("broken", async () => { throw failure; })],
      "run-1:attempt:1",
      () => "draft_open",
    );

    await expect(wrapped.execute("call-1", {} as never)).rejects.toBe(failure);
    expect(collector.toolEvents[0]).toMatchObject({
      ok: false,
      error: "tool exploded",
      state_before: "draft_open",
      state_after: "draft_open",
    });
  });

  it("enforces the in-memory event cap and reports truncation", async () => {
    const collector = new AgentTraceCollector(2, 8);
    const [wrapped] = collector.wrapTools(
      [tool("bounded", async () => ({ content: [], details: {} }))],
      "run-1:attempt:1",
      () => "empty",
    );

    await wrapped.execute("call-1", { index: 1 } as never);
    await wrapped.execute("call-2", { index: 2 } as never);
    await wrapped.execute("call-3", { index: 3 } as never);

    expect(collector.toolEvents).toHaveLength(2);
    expect(collector.toolCallCount).toBe(3);
    expect(collector.runtimeEvents).toContainEqual(
      expect.objectContaining({
        event: "trace.tool_events_truncated",
        detail: { dropped_count: 1 },
      }),
    );
  });
});
