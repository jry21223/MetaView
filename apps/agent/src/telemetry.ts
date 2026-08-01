/**
 * Attempt-level telemetry for one pi-agent-core run.
 *
 * Subscribes to the Agent event stream and records what the API cannot infer
 * from the outside:
 *
 * - `modelTurns`   — assistant messages, i.e. actual model requests.
 * - `toolBatches`  — assistant messages that carried at least one tool call.
 * - `toolCalls`    — individual tool invocations.
 * - `usage`        — real token counts including cache reads/writes, summed
 *                    from each assistant message's `usage` field.
 *
 * `toolCalls` is deliberately kept separate from `modelTurns`: pi-agent-core
 * can emit several tool calls in a single assistant message, so tool-call
 * count is not a proxy for round trips.
 *
 * Never records prompt text, tool arguments, API keys, or playbook content.
 */

import type { AgentEvent } from "@earendil-works/pi-agent-core";

export interface AttemptUsage {
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
}

export interface AttemptTelemetry {
  model_turns: number;
  tool_batches: number;
  tool_calls: number;
  tool_calls_by_name: Record<string, number>;
  usage: AttemptUsage;
  provider: string | null;
  model: string | null;
  time_to_first_committed_step_ms: number | null;
  first_committed_step_at: string | null;
  committed_steps: number;
}

interface AssistantLike {
  role?: unknown;
  content?: unknown;
  provider?: unknown;
  model?: unknown;
  usage?: unknown;
}

/** Tools whose successful execution means one more step is renderable. */
const COMMIT_TOOL_NAMES = new Set(["commit_step"]);

export class AttemptTelemetryCollector {
  private modelTurns = 0;
  private toolBatches = 0;
  private toolCalls = 0;
  private readonly toolCallsByName = new Map<string, number>();
  private inputTokens = 0;
  private outputTokens = 0;
  private cacheReadTokens = 0;
  private cacheWriteTokens = 0;
  private inputTokensComplete = true;
  private outputTokensComplete = true;
  private cacheReadTokensComplete = true;
  private cacheWriteTokensComplete = true;
  private provider: string | null = null;
  private model: string | null = null;
  private committedSteps = 0;
  private firstCommittedStepAt: number | null = null;

  constructor(
    private readonly startedAtMs: number,
    private readonly onSnapshot?: (snapshot: AttemptTelemetry) => void,
  ) {}

  /** Event listener for `Agent.subscribe`. Must never throw. */
  readonly handle = (event: AgentEvent): void => {
    try {
      this.consume(event);
      this.onSnapshot?.(this.snapshot());
    } catch {
      // Telemetry is best-effort; a malformed event must not abort the run.
    }
  };

  private consume(event: AgentEvent): void {
    if (event.type === "message_end") {
      this.consumeAssistantMessage(event.message as AssistantLike);
      return;
    }
    if (event.type === "tool_execution_end") {
      this.consumeToolEnd(event.toolName, event.isError);
    }
  }

  private consumeAssistantMessage(message: AssistantLike): void {
    if (message?.role !== "assistant") {
      return;
    }
    this.modelTurns += 1;
    if (typeof message.provider === "string") {
      this.provider = message.provider;
    }
    if (typeof message.model === "string") {
      this.model = message.model;
    }

    const usage = message.usage;
    if (isRecord(usage)) {
      const input = numberOrNull(usage.input);
      const output = numberOrNull(usage.output);
      const cacheRead = numberOrNull(usage.cacheRead);
      const cacheWrite = numberOrNull(usage.cacheWrite);
      this.inputTokensComplete &&= input !== null;
      this.outputTokensComplete &&= output !== null;
      this.cacheReadTokensComplete &&= cacheRead !== null;
      this.cacheWriteTokensComplete &&= cacheWrite !== null;
      this.inputTokens += input ?? 0;
      this.outputTokens += output ?? 0;
      this.cacheReadTokens += cacheRead ?? 0;
      this.cacheWriteTokens += cacheWrite ?? 0;
    } else {
      this.inputTokensComplete = false;
      this.outputTokensComplete = false;
      this.cacheReadTokensComplete = false;
      this.cacheWriteTokensComplete = false;
    }

    const toolCallCount = Array.isArray(message.content)
      ? message.content.filter(
          (part) => isRecord(part) && part.type === "toolCall",
        ).length
      : 0;
    if (toolCallCount > 0) {
      this.toolBatches += 1;
    }
  }

  private consumeToolEnd(toolName: string, isError: boolean): void {
    this.toolCalls += 1;
    this.toolCallsByName.set(
      toolName,
      (this.toolCallsByName.get(toolName) ?? 0) + 1,
    );
    if (isError || !COMMIT_TOOL_NAMES.has(toolName)) {
      return;
    }
    this.committedSteps += 1;
    if (this.firstCommittedStepAt === null) {
      this.firstCommittedStepAt = Date.now();
    }
  }

  snapshot(): AttemptTelemetry {
    return {
      model_turns: this.modelTurns,
      tool_batches: this.toolBatches,
      tool_calls: this.toolCalls,
      tool_calls_by_name: Object.fromEntries(this.toolCallsByName),
      usage: {
        input_tokens: measuredTotal(
          this.modelTurns,
          this.inputTokensComplete,
          this.inputTokens,
        ),
        output_tokens: measuredTotal(
          this.modelTurns,
          this.outputTokensComplete,
          this.outputTokens,
        ),
        cache_read_tokens: measuredTotal(
          this.modelTurns,
          this.cacheReadTokensComplete,
          this.cacheReadTokens,
        ),
        cache_write_tokens: measuredTotal(
          this.modelTurns,
          this.cacheWriteTokensComplete,
          this.cacheWriteTokens,
        ),
      },
      provider: this.provider,
      model: this.model,
      time_to_first_committed_step_ms:
        this.firstCommittedStepAt === null
          ? null
          : this.firstCommittedStepAt - this.startedAtMs,
      first_committed_step_at:
        this.firstCommittedStepAt === null
          ? null
          : new Date(this.firstCommittedStepAt).toISOString(),
      committed_steps: this.committedSteps,
    };
  }
}

export function emptyAttemptTelemetry(): AttemptTelemetry {
  return new AttemptTelemetryCollector(Date.now()).snapshot();
}

export function sumUsage(entries: AttemptUsage[]): AttemptUsage {
  return {
    input_tokens: completeUsageSum(entries, "input_tokens"),
    output_tokens: completeUsageSum(entries, "output_tokens"),
    cache_read_tokens: completeUsageSum(entries, "cache_read_tokens"),
    cache_write_tokens: completeUsageSum(entries, "cache_write_tokens"),
  };
}

export function firstCommittedStepMetrics(
  timestamps: Array<string | null>,
  sidecarStartedAtMs: number,
): {
  first_committed_step_at: string | null;
  time_to_first_committed_step_ms: number | null;
} {
  const measured = timestamps
    .filter((value): value is string => value !== null)
    .map((value) => ({ value, epochMs: Date.parse(value) }))
    .filter(({ epochMs }) => Number.isFinite(epochMs))
    .sort((left, right) => left.epochMs - right.epochMs)[0];
  if (!measured) {
    return {
      first_committed_step_at: null,
      time_to_first_committed_step_ms: null,
    };
  }
  return {
    first_committed_step_at: measured.value,
    time_to_first_committed_step_ms: Math.max(
      0,
      measured.epochMs - sidecarStartedAtMs,
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function measuredTotal(
  modelTurns: number,
  complete: boolean,
  total: number,
): number | null {
  return modelTurns > 0 && complete ? total : null;
}

function completeUsageSum(
  entries: AttemptUsage[],
  key: keyof AttemptUsage,
): number | null {
  if (entries.length === 0 || entries.some((entry) => entry[key] === null)) {
    return null;
  }
  return entries.reduce((total, entry) => total + (entry[key] ?? 0), 0);
}
