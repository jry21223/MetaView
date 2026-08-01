/**
 * HTTP entry point for the MetaView agent sidecar.
 *
 * Exposes ``POST /generate`` with either the legacy body
 * ``{ prompt, provider?, route_decision?, coverage_decision?, lesson_plan? }`` or the wider
 * AgentRequest shape,
 * then returns ``{ playbook: PlaybookScript, provider, tool_events,
 * runtime_events }`` once the pi-agent-core loop has walked the Drawing CLI
 * flow. Health probe at ``GET /healthz``.
 */

import express, { type Request, type Response } from "express";
import pino from "pino";

import { runAgentGeneration, type AttemptRecord, type AttemptSink } from "./agent.js";
import { hasValidSharedToken } from "./auth.js";
import { runWithGenerationTimeout } from "./generationTimeout.js";
import { AgentSelfCheckError } from "./state/playbookSelfCheck.js";
import { firstCommittedStepMetrics, sumUsage } from "./telemetry.js";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });
const PORT = Number(process.env.PORT ?? 8001);
const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:8000";
const DEFAULT_PROVIDER = process.env.AGENT_DEFAULT_PROVIDER ?? "openai";
const DEFAULT_MODEL = process.env.AGENT_DEFAULT_MODEL ?? "gpt-4o-mini";
const DEFAULT_API_KEY =
  process.env.AGENT_DEFAULT_API_KEY ??
  process.env.METAVIEW_OPENAI_API_KEY ??
  process.env.OPENAI_API_KEY;
const DEFAULT_BASE_URL =
  process.env.AGENT_DEFAULT_BASE_URL ?? process.env.METAVIEW_OPENAI_BASE_URL;
const SHARED_TOKEN = process.env.AGENT_SHARED_TOKEN ?? process.env.METAVIEW_AGENT_SHARED_TOKEN;
// Hard ceiling so a hung agent loop can't block the worker indefinitely.
const GENERATE_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 540_000);

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
    base_url: DEFAULT_BASE_URL ?? null,
  });
});

app.post("/generate", async (req: Request, res: Response) => {
  if (!hasValidSharedToken(SHARED_TOKEN, req.header("X-MetaView-Agent-Token"))) {
    res.status(401).json({ detail: "missing or invalid agent token" });
    return;
  }
  const {
    run_id,
    prompt,
    source_code,
    language,
    provider,
    provider_config,
    route_decision,
    coverage_decision,
    lesson_plan,
    playbook_schema,
    constraints,
    available_tools,
  } = (req.body ?? {}) as {
    run_id?: string;
    prompt?: string;
    source_code?: string | null;
    language?: string | null;
    provider?: { provider?: string; model?: string; api_key?: string; base_url?: string };
    provider_config?: { provider?: string; model?: string; api_key?: string; base_url?: string };
    route_decision?: Record<string, unknown>;
    coverage_decision?: Record<string, unknown>;
    lesson_plan?: Record<string, unknown>;
    playbook_schema?: Record<string, unknown>;
    constraints?: Record<string, unknown>;
    available_tools?: Array<Record<string, unknown>>;
  };
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ detail: "missing or invalid 'prompt' field" });
    return;
  }
  // Owned here so attempt telemetry survives a thrown self-check error and a
  // failed generation is still measurable end to end.
  const attempts: AttemptSink = [];
  const sidecarStartedAt = Date.now();
  try {
    const playbook = await runWithGenerationTimeout(
      async (abortSignal) =>
        await runAgentGeneration(
          {
            prompt,
            runId: run_id,
            sourceCode: source_code,
            language,
            provider: provider ?? provider_config,
            routeDecision: route_decision,
            coverageDecision: coverage_decision,
            lessonPlan: lesson_plan,
            playbookSchema: playbook_schema,
            constraints,
            availableTools: available_tools,
            apiBaseUrl: API_BASE_URL,
            agentSharedToken: SHARED_TOKEN,
            defaultProvider: DEFAULT_PROVIDER,
            defaultModel: DEFAULT_MODEL,
            defaultApiKey: DEFAULT_API_KEY,
            defaultBaseUrl: DEFAULT_BASE_URL,
            abortSignal,
          },
          attempts,
        ),
      GENERATE_TIMEOUT_MS,
    );
    const sidecarFinishedAt = Date.now();
    res.json({
      playbook,
      provider: "pi",
      tool_events: toolEvents(attempts),
      runtime_events: runtimeEvents(
        attempts,
        sidecarStartedAt,
        sidecarFinishedAt,
        "succeeded",
        null,
      ),
      review: null,
      artifacts: artifacts(attempts, sidecarStartedAt),
    });
  } catch (err) {
    const sidecarFinishedAt = Date.now();
    const errorCode = err instanceof Error ? err.name : "AgentError";
    log.error({ err }, "generate failed");
    const failureBody = {
      tool_events: toolEvents(attempts),
      runtime_events: runtimeEvents(
        attempts,
        sidecarStartedAt,
        sidecarFinishedAt,
        "failed",
        errorCode,
      ),
      artifacts: artifacts(attempts, sidecarStartedAt),
    };
    if (err instanceof AgentSelfCheckError) {
      res.status(500).json({
        detail: err.message,
        self_check: err.report,
        ...failureBody,
      });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ detail: message, ...failureBody });
  }
});

/**
 * Per-attempt telemetry as runtime events. Deliberately reuses the existing
 * `runtime_events` channel rather than adding a second sidecar protocol.
 */
function runtimeEvents(
  attempts: AttemptRecord[],
  sidecarStartedAt: number,
  sidecarFinishedAt: number,
  outcome: "succeeded" | "failed",
  errorCode: string | null,
): Array<{ event: string; detail?: Record<string, unknown> }> {
  const events: Array<{ event: string; detail?: Record<string, unknown> }> = [];
  for (const attempt of attempts) {
    events.push({
      event:
        attempt.outcome === "running"
          ? "agent.attempt.started"
          : "agent.attempt.completed",
      detail: {
        attempt_index: attempt.attempt_index,
        started_at: attempt.started_at,
        finished_at: attempt.finished_at,
        duration_ms: attempt.duration_ms,
        outcome: attempt.outcome,
        error_code: attempt.error_code,
        model_turns: attempt.telemetry.model_turns,
        tool_batches: attempt.telemetry.tool_batches,
        tool_calls: attempt.telemetry.tool_calls,
        tool_calls_by_name: attempt.telemetry.tool_calls_by_name,
        committed_steps: attempt.telemetry.committed_steps,
        time_to_first_committed_step_ms:
          attempt.telemetry.time_to_first_committed_step_ms,
        first_committed_step_at:
          attempt.telemetry.first_committed_step_at,
        provider: attempt.telemetry.provider,
        model: attempt.telemetry.model,
        usage: attempt.telemetry.usage,
      },
    });
    if (attempt.self_check_status !== null) {
      events.push({
        event: "agent.self_check.completed",
        detail: {
          attempt_index: attempt.attempt_index,
          status: attempt.self_check_status,
          issue_codes: attempt.self_check_issue_codes,
        },
      });
    }
  }
  events.push({
    event: outcome === "succeeded" ? "sidecar.completed" : "sidecar.failed",
    detail: {
      started_at: new Date(sidecarStartedAt).toISOString(),
      finished_at: new Date(sidecarFinishedAt).toISOString(),
      duration_ms: sidecarFinishedAt - sidecarStartedAt,
      attempts: attempts.length,
      outcome,
      error_code: errorCode,
    },
  });
  return events;
}

function toolEvents(
  attempts: AttemptRecord[],
): Array<{ tool: string; ok: boolean; detail?: Record<string, unknown> }> {
  const totals = new Map<string, number>();
  for (const attempt of attempts) {
    for (const [tool, count] of Object.entries(
      attempt.telemetry.tool_calls_by_name,
    )) {
      totals.set(tool, (totals.get(tool) ?? 0) + count);
    }
  }
  return [...totals.entries()].map(([tool, calls]) => ({
    tool,
    ok: true,
    detail: { calls },
  }));
}

function artifacts(
  attempts: AttemptRecord[],
  sidecarStartedAt: number,
): Record<string, unknown> {
  const firstCommit = firstCommittedStepMetrics(
    attempts.map((attempt) => attempt.telemetry.first_committed_step_at),
    sidecarStartedAt,
  );
  return {
    usage: sumUsage(attempts.map((attempt) => attempt.telemetry.usage)),
    attempts: attempts.length,
    ...firstCommit,
  };
}

app.listen(PORT, () => {
  log.info(
    {
      port: PORT,
      api_base: API_BASE_URL,
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      base_url: DEFAULT_BASE_URL ?? null,
    },
    "agent sidecar listening",
  );
});
