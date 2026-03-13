import type {
  ModelProvider,
  PipelineResponse,
  PipelineRunDetail,
  PipelineRunSummary,
  RuntimeCatalog,
  SandboxMode,
  TopicDomain,
} from "../types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export async function getRuntimeCatalog(): Promise<RuntimeCatalog> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runtime`);

  if (!response.ok) {
    throw new Error(`Runtime request failed with status ${response.status}`);
  }

  return (await response.json()) as RuntimeCatalog;
}

export async function getPipelineRuns(): Promise<PipelineRunSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs`);

  if (!response.ok) {
    throw new Error(`Runs request failed with status ${response.status}`);
  }

  return (await response.json()) as PipelineRunSummary[];
}

export async function getPipelineRun(requestId: string): Promise<PipelineRunDetail> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs/${requestId}`);

  if (!response.ok) {
    throw new Error(`Run detail request failed with status ${response.status}`);
  }

  return (await response.json()) as PipelineRunDetail;
}

export async function runPipeline(
  prompt: string,
  domain: TopicDomain,
  provider: ModelProvider,
  sandboxMode: SandboxMode,
): Promise<PipelineResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/pipeline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      domain,
      provider,
      sandbox_mode: sandboxMode,
    }),
  });

  if (!response.ok) {
    throw new Error(`Pipeline request failed with status ${response.status}`);
  }

  return (await response.json()) as PipelineResponse;
}
