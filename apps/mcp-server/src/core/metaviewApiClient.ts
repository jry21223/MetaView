import type { DirectorScript, PlaybookScript } from "../../../web/src/features/playbook/engine/types";
import type { SceneBlueprint } from "./metaviewCore";

export interface BuildPlaybookOptions {
  target?: "preview" | "export";
  timeoutMs?: number;
}

export interface BuildPlaybookInput {
  sceneBlueprint: SceneBlueprint;
  options?: BuildPlaybookOptions;
}

export interface BuildPlaybookResult {
  generatedBy: "metaview-core";
  runId: string;
  playbookScript: PlaybookScript;
  directorScript?: DirectorScript | null;
  warnings: string[];
  provenance: {
    adapter: "rest";
    endpoint: "/api/v1/pipeline";
    renderingContract: "PlaybookScript";
  };
}

export interface BuildDirectorScriptInput {
  playbookScript: PlaybookScript;
  runId?: string;
  style?: Record<string, unknown>;
}

export interface BuildDirectorScriptResult {
  generatedBy: "metaview-core";
  directorScript: DirectorScript;
  provenance: Record<string, string>;
}

export interface MetaViewApiClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

type PipelineStatus = "queued" | "running" | "reviewing" | "succeeded" | "failed";

interface PipelineSubmitResponse {
  run_id: string;
  status: PipelineStatus;
  error?: string | null;
}

interface PipelineRunResponse {
  run_id: string;
  status: PipelineStatus;
  playbook?: PlaybookScript | null;
  director?: DirectorScript | null;
  error?: string | null;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blueprintPrompt(blueprint: SceneBlueprint): string {
  const points = blueprint.emphasisPoints.length > 0 ? `\n重点：${blueprint.emphasisPoints.join("；")}` : "";
  return `${blueprint.topic}${points}`;
}

async function readJson<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${action} failed (${response.status}): ${body || response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export class MetaViewApiClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(options: MetaViewApiClientOptions = {}) {
    this.baseUrl = trimTrailingSlash(
      options.baseUrl ?? process.env.METAVIEW_API_BASE_URL ?? "http://127.0.0.1:8000",
    );
    this.fetchFn = options.fetchFn ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async buildPlaybook(input: BuildPlaybookInput): Promise<BuildPlaybookResult> {
    const submit = await readJson<PipelineSubmitResponse>(
      await this.fetchFn(`${this.baseUrl}/api/v1/pipeline`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: blueprintPrompt(input.sceneBlueprint),
          domain: input.sceneBlueprint.subject === "unknown" ? undefined : input.sceneBlueprint.subject,
          skill_mode_override: "auto",
        }),
      }),
      "submit pipeline",
    );
    const run = await this.waitForRun(submit.run_id, input.options?.timeoutMs ?? this.timeoutMs);
    if (!run.playbook) {
      throw new Error(`pipeline run ${submit.run_id} succeeded without PlaybookScript`);
    }
    return {
      generatedBy: "metaview-core",
      runId: run.run_id,
      playbookScript: run.playbook,
      directorScript: run.director ?? null,
      warnings: [],
      provenance: {
        adapter: "rest",
        endpoint: "/api/v1/pipeline",
        renderingContract: "PlaybookScript",
      },
    };
  }

  async buildDirectorScript(input: BuildDirectorScriptInput): Promise<BuildDirectorScriptResult> {
    const payload = await readJson<{ director_script: DirectorScript; provenance: Record<string, string> }>(
      await this.fetchFn(`${this.baseUrl}/api/v1/mcp/director-script`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playbook: input.playbookScript,
          run_id: input.runId ?? "mcp-director-preview",
          style: input.style,
        }),
      }),
      "build director script",
    );
    return {
      generatedBy: "metaview-core",
      directorScript: payload.director_script,
      provenance: payload.provenance,
    };
  }

  private async waitForRun(runId: string, timeoutMs: number): Promise<PipelineRunResponse> {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      const run = await readJson<PipelineRunResponse>(
        await this.fetchFn(`${this.baseUrl}/api/v1/runs/${encodeURIComponent(runId)}`),
        "read pipeline run",
      );
      if (run.status === "succeeded") return run;
      if (run.status === "failed") {
        throw new Error(`pipeline run ${runId} failed: ${run.error ?? "unknown error"}`);
      }
      await sleep(this.pollIntervalMs);
    }
    throw new Error(`pipeline run ${runId} did not finish within ${timeoutMs}ms`);
  }
}
