/**
 * HTTP entry point for the MetaView agent sidecar.
 *
 * Exposes ``POST /generate`` with a JSON body ``{ prompt, provider?, route_decision? }`` and
 * returns ``{ playbook: PlaybookScript }`` once the pi-agent-core loop has
 * walked the entire Drawing CLI flow. Health probe at ``GET /healthz``.
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
const SHARED_TOKEN = process.env.AGENT_SHARED_TOKEN ?? process.env.METAVIEW_AGENT_SHARED_TOKEN;
// Hard ceiling so a hung agent loop can't block the worker indefinitely.
const GENERATE_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 540_000);

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok", provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL });
});

app.post("/generate", async (req: Request, res: Response) => {
  if (!hasValidSharedToken(SHARED_TOKEN, req.header("X-MetaView-Agent-Token"))) {
    res.status(401).json({ detail: "missing or invalid agent token" });
    return;
  }
  const { prompt, provider, route_decision } = (req.body ?? {}) as {
    prompt?: string;
    provider?: { provider?: string; model?: string; api_key?: string; base_url?: string };
    route_decision?: Record<string, unknown>;
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
        provider,
        routeDecision: route_decision,
        apiBaseUrl: API_BASE_URL,
        agentSharedToken: SHARED_TOKEN,
        defaultProvider: DEFAULT_PROVIDER,
        defaultModel: DEFAULT_MODEL,
        defaultApiKey: DEFAULT_API_KEY,
      }),
      timeout,
    ]);
    res.json({ playbook });
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
    { port: PORT, api_base: API_BASE_URL, provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL },
    "agent sidecar listening",
  );
});
