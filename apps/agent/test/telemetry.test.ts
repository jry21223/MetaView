import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AttemptTelemetryCollector,
  firstCommittedStepMetrics,
  sumUsage,
} from "../src/telemetry.js";

function event(value: unknown): AgentEvent {
  return value as AgentEvent;
}

describe("AttemptTelemetryCollector", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("separates model turns, parallel tool batches, calls, and total input usage", () => {
    const collector = new AttemptTelemetryCollector(1_000);
    collector.handle(
      event({
        type: "message_end",
        message: {
          role: "assistant",
          provider: "openai",
          model: "gpt-test",
          usage: { input: 200, output: 30, cacheRead: 80, cacheWrite: 10 },
          content: [
            { type: "toolCall", name: "commit_step" },
            { type: "toolCall", name: "assert_playbook" },
          ],
        },
      }),
    );
    vi.spyOn(Date, "now").mockReturnValue(1_250);
    collector.handle(
      event({
        type: "tool_execution_end",
        toolName: "commit_step",
        isError: false,
      }),
    );
    collector.handle(
      event({
        type: "tool_execution_end",
        toolName: "assert_playbook",
        isError: false,
      }),
    );
    collector.handle(
      event({
        type: "message_end",
        message: {
          role: "assistant",
          provider: "openai",
          model: "gpt-test",
          usage: { input: 50, output: 5, cacheRead: 0, cacheWrite: 0 },
          content: [{ type: "text", text: "done" }],
        },
      }),
    );

    expect(collector.snapshot()).toEqual({
      model_turns: 2,
      tool_batches: 1,
      tool_calls: 2,
      tool_calls_by_name: { commit_step: 1, assert_playbook: 1 },
      usage: {
        input_tokens: 250,
        output_tokens: 35,
        cache_read_tokens: 80,
        cache_write_tokens: 10,
      },
      provider: "openai",
      model: "gpt-test",
      time_to_first_committed_step_ms: 250,
      first_committed_step_at: "1970-01-01T00:00:01.250Z",
      committed_steps: 1,
    });
  });

  it("keeps usage unknown when an assistant message does not report it", () => {
    const collector = new AttemptTelemetryCollector(1_000);
    collector.handle(
      event({
        type: "message_end",
        message: {
          role: "assistant",
          provider: "custom",
          model: "opaque",
          content: [],
        },
      }),
    );

    expect(collector.snapshot().usage).toEqual({
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
    });
  });

  it("does not fabricate a partial aggregate when one attempt lacks usage", () => {
    expect(
      sumUsage([
        {
          input_tokens: 10,
          output_tokens: 2,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
        },
        {
          input_tokens: null,
          output_tokens: null,
          cache_read_tokens: null,
          cache_write_tokens: null,
        },
      ]),
    ).toEqual({
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
    });
  });

  it("measures a second-attempt first commit from sidecar start", () => {
    expect(
      firstCommittedStepMetrics(
        [null, "1970-01-01T00:00:02.500Z"],
        1_000,
      ),
    ).toEqual({
      first_committed_step_at: "1970-01-01T00:00:02.500Z",
      time_to_first_committed_step_ms: 1_500,
    });
  });

  it("publishes an updated snapshot while an attempt is still in flight", () => {
    const observed: ReturnType<AttemptTelemetryCollector["snapshot"]>[] = [];
    const collector = new AttemptTelemetryCollector(1_000, (snapshot) => {
      observed.push(snapshot);
    });

    collector.handle(
      event({
        type: "message_end",
        message: {
          role: "assistant",
          provider: "openai",
          model: "gpt-live",
          usage: { input: 15, output: 4, cacheRead: 5, cacheWrite: 0 },
          content: [{ type: "toolCall", name: "commit_step" }],
        },
      }),
    );

    expect(observed.at(-1)).toMatchObject({
      model_turns: 1,
      tool_batches: 1,
      usage: {
        input_tokens: 15,
        output_tokens: 4,
        cache_read_tokens: 5,
        cache_write_tokens: 0,
      },
    });
  });
});
