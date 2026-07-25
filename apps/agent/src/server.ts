/** HTTP entry point for the MetaView Agent sidecar. */

import express, { type Request, type Response } from "express";
import pino from "pino";

import { runAgentGenerationWithTrace } from "./agent.js";
import { hasValidSharedToken } from "./auth.js";
import { resolveOptionalEnv } from "./env.js";

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
const GENERATE_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 540_000);

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
    base_url: DEFAULT_BASE_URL ?? null,
    harness: "transactional-step-draft-v1",
    retries_owned_by: "api",
  });
});

app.post("/generate", async (req: Request, res: Response) => {
  if (!hasValidSharedToken(SHARED_TOKEN, req.header("X-MetaView-Agent-Token"))) {
    res.status(401).json({ detail: "missing or invalid agent token" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const prompt = body.prompt;
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ detail: "missing or invalid 'prompt' field" });
    return;
  }
  const controller = new AbortController();
  const timeoutError = new Error(`agent timed out after ${GENERATE_TIMEOUT_MS}ms`);
  const timer = setTimeout(() => {
    controller.abort(timeoutError);
  }, GENERATE_TIMEOUT_MS);
  // Avoid keeping the event loop alive solely for the timer handle.
  timer.unref?.();
  try {
    const result = await runAgentGenerationWithTrace({
      prompt,
      runId: typeof body.run_id === "string" ? body.run_id : undefined,
      sourceCode: typeof body.source_code === "string" ? body.source_code : null,
      language: typeof body.language === "string" ? body.language : null,
      provider: coerceProvider(body.provider ?? body.provider_config),
      routeDecision: coerceRecord(body.route_decision),
      coverageDecision: coerceRecord(body.coverage_decision),
      lessonPlan: coerceRecord(body.lesson_plan),
      playbookSchema: coerceRecord(body.playbook_schema),
      constraints: coerceRecord(body.constraints),
      availableTools: coerceRecordArray(body.available_tools),
      mode: coerceGenerateMode(body.mode),
      repair: coerceRepairPayload(body.repair),
      apiBaseUrl: API_BASE_URL,
      agentSharedToken: SHARED_TOKEN,
      defaultProvider: DEFAULT_PROVIDER,
      defaultModel: DEFAULT_MODEL,
      defaultApiKey: DEFAULT_API_KEY,
      defaultBaseUrl: DEFAULT_BASE_URL,
      renderedQualityEnabled: process.env.AGENT_RENDERED_QUALITY_GATE === "true",
      repoRoot: process.env.METAVIEW_REPO_ROOT ?? process.cwd(),
      signal: controller.signal,
    });
    res.json({
      playbook: result.playbook,
      provider: "pi",
      tool_events: result.toolEvents,
      runtime_events: result.runtimeEvents,
      review: null,
      artifacts: {
        harness: "transactional-step-draft-v1",
        complete_regeneration_count: 0,
      },
    });
  } catch (error) {
    log.error({ err: error }, "generate failed");
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      detail: message,
      code: classifyError(message),
    });
  } finally {
    clearTimeout(timer);
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

function coerceProvider(value: unknown): {
  provider?: string;
  model?: string;
  api_key?: string;
  base_url?: string;
} | undefined {
  const record = coerceRecord(value);
  if (!record) return undefined;
  return {
    provider: typeof record.provider === "string" ? record.provider : undefined,
    model: typeof record.model === "string" ? record.model : undefined,
    api_key: typeof record.api_key === "string" ? record.api_key : undefined,
    base_url: typeof record.base_url === "string" ? record.base_url : undefined,
  };
}

function coerceGenerateMode(value: unknown): "generate" | "repair" | undefined {
  return value === "generate" || value === "repair" ? value : undefined;
}

function coerceRepairPayload(value: unknown): {
  previous_playbook: Record<string, unknown>;
  blocking_issues: unknown[];
  original_prompt?: string;
  reason?: string;
} | undefined {
  const record = coerceRecord(value);
  if (!record) return undefined;
  const previous = record.previous_playbook;
  if (!previous || typeof previous !== "object" || Array.isArray(previous)) {
    return undefined;
  }
  return {
    previous_playbook: previous as Record<string, unknown>,
    blocking_issues: Array.isArray(record.blocking_issues) ? record.blocking_issues : [],
    original_prompt:
      typeof record.original_prompt === "string" ? record.original_prompt : undefined,
    reason: typeof record.reason === "string" ? record.reason : undefined,
  };
}

function coerceRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function coerceRecordArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    : undefined;
}

function classifyError(message: string): string {
  if (message.includes("not allowed for this run")) return "agent.capability_denied";
  if (message.includes("canonical")) return "agent.canonical_preflight_failed";
  if (message.includes("draft") || message.includes("outline")) return "agent.transaction_invalid";
  if (message.includes("timed out")) return "agent.timeout";
  return "agent.generation_failed";
}
