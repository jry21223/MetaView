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

import {
  AgentGenerationTraceError,
  createAgentTraceCollector,
  runAgentGenerationWithTrace,
} from "./agent.js";
import { hasValidSharedToken } from "./auth.js";
import { resolveOptionalEnv } from "./env.js";
import { AgentSelfCheckError } from "./state/playbookSelfCheck.js";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });
const PORT = Number(process.env.PORT ?? 8001);
const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:8000";
const DEFAULT_PROVIDER = process.env.AGENT_DEFAULT_PROVIDER ?? "openai";
const DEFAULT_MODEL = process.env.AGENT_DEFAULT_MODEL ?? "gpt-4o-mini";
const DEFAULT_API_KEY = resolveOptionalEnv(
  process.env.AGENT_DEFAULT_API_KEY,
  process.env.METAVIEW_OPENAI_API_KEY,
  process.env.OPENAI_API_KEY,
);
const DEFAULT_BASE_URL = resolveOptionalEnv(
  process.env.AGENT_DEFAULT_BASE_URL,
  process.env.METAVIEW_OPENAI_BASE_URL,
);
const SHARED_TOKEN = resolveOptionalEnv(
  process.env.AGENT_SHARED_TOKEN,
  process.env.METAVIEW_AGENT_SHARED_TOKEN,
);
// Hard ceiling so a hung agent loop can't block the worker indefinitely.
// The API forwards its own agent timeout via the request body (``timeout_ms``,
// issue #238); the effective per-request timeout is the lower of that value
// and this ceiling, so the sidecar gives up at or before the API's HTTP
// client does. A deployment that lowers ``METAVIEW_AGENT_TIMEOUT_S`` on the
// API therefore tightens the sidecar too, instead of leaving it running to
// this ceiling in the background.
const GENERATE_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 540_000);

/**
 * Effective per-request timeout: the API-provided ``timeout_ms`` (forwarded
 * from ``agent_timeout_s``) when present and positive, clamped to the env
 * ceiling ``ceilingMs``. Absent/invalid values fall back to the ceiling.
 */
export function resolveGenerateTimeoutMs(
  requestedMs: unknown,
  ceilingMs: number,
): number {
  const requested = Number(requestedMs);
  if (!Number.isFinite(requested) || requested <= 0) {
    return ceilingMs;
  }
  return Math.min(requested, ceilingMs);
}

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
    timeout_ms,
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
    timeout_ms?: number;
  };
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ detail: "missing or invalid 'prompt' field" });
    return;
  }
  const timeoutMs = resolveGenerateTimeoutMs(timeout_ms, GENERATE_TIMEOUT_MS);
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`agent timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    timeoutHandle.unref?.();
  });
  const trace = createAgentTraceCollector(constraints);
  try {
    const result = await Promise.race([
      runAgentGenerationWithTrace({
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
        traceCollector: trace,
      }),
      timeout,
    ]);
    res.json({
      playbook: result.playbook,
      provider: "pi",
      tool_events: result.toolEvents,
      runtime_events: result.runtimeEvents,
      review: null,
      artifacts: {},
    });
  } catch (err) {
    const originalError = err instanceof AgentGenerationTraceError
      ? err.originalError
      : err;
    if (!(err instanceof AgentGenerationTraceError)) {
      const message = originalError instanceof Error
        ? originalError.message
        : String(originalError);
      if (message.includes("timed out")) {
        trace.runtime("sidecar.timeout", { timeout_ms: timeoutMs });
      }
    }
    const toolEvents = err instanceof AgentGenerationTraceError
      ? err.toolEvents
      : trace.toolEvents;
    const runtimeEvents = err instanceof AgentGenerationTraceError
      ? err.runtimeEvents
      : trace.runtimeEvents;
    log.error(
      { err: originalError, tool_events: toolEvents, runtime_events: runtimeEvents },
      "generate failed",
    );
    if (originalError instanceof AgentSelfCheckError) {
      res.status(500).json({
        detail: originalError.message,
        self_check: originalError.report,
        tool_events: toolEvents,
        runtime_events: runtimeEvents,
      });
      return;
    }
    const message = originalError instanceof Error
      ? originalError.message
      : String(originalError);
    res.status(500).json({
      detail: message,
      tool_events: toolEvents,
      runtime_events: runtimeEvents,
    });
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
});

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
