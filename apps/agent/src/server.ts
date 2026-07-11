/**
 * HTTP entry point for the MetaView agent sidecar.
 *
 * Exposes ``POST /generate`` with either the legacy body
 * ``{ prompt, provider?, route_decision?, lesson_plan? }`` or the wider
 * AgentRequest shape,
 * then returns ``{ playbook: PlaybookScript, provider, tool_events,
 * runtime_events }`` once the pi-agent-core loop has walked the Drawing CLI
 * flow. Health probe at ``GET /healthz``.
 */

import express, { type Request, type Response } from "express";
import pino from "pino";

import { runAgentGeneration } from "./agent.js";
import { hasValidSharedToken } from "./auth.js";
import { AgentSelfCheckError } from "./state/playbookSelfCheck.js";

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
    lesson_plan?: Record<string, unknown>;
    playbook_schema?: Record<string, unknown>;
    constraints?: Record<string, unknown>;
    available_tools?: Array<Record<string, unknown>>;
  };
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ detail: "missing or invalid 'prompt' field" });
    return;
  }
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`agent timed out after ${GENERATE_TIMEOUT_MS}ms`)),
      GENERATE_TIMEOUT_MS,
    ),
  );
  try {
    const playbook = await Promise.race([
      runAgentGeneration({
        prompt,
        runId: run_id,
        sourceCode: source_code,
        language,
        provider: provider ?? provider_config,
        routeDecision: route_decision,
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
      }),
      timeout,
    ]);
    res.json({
      playbook,
      provider: "pi",
      tool_events: [],
      runtime_events: [{ event: "sidecar.completed" }],
      review: null,
      artifacts: {},
    });
  } catch (err) {
    log.error({ err }, "generate failed");
    if (err instanceof AgentSelfCheckError) {
      res.status(500).json({
        detail: err.message,
        self_check: err.report,
      });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ detail: message });
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
