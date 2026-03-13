import type { ModelProvider, PipelineResponse, RuntimeCatalog, SandboxMode, TopicDomain } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function getRuntimeCatalog(): Promise<RuntimeCatalog> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runtime`);

  if (!response.ok) {
    throw new Error(`Runtime request failed with status ${response.status}`);
  }

  return (await response.json()) as RuntimeCatalog;
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
