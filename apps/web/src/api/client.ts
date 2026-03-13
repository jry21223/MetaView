import type {
  CustomProviderUpsertRequest,
  ModelProvider,
  PipelineResponse,
  PipelineRunDetail,
  PipelineRunSummary,
  ProviderDescriptor,
  RuntimeCatalog,
  SandboxMode,
} from "../types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    if (typeof payload.detail === "string" && payload.detail.length > 0) {
      return payload.detail;
    }
  } catch {
    // Ignore JSON parse failures and fall back to a generic message.
  }

  return `${fallback} with status ${response.status}`;
}

export async function getRuntimeCatalog(): Promise<RuntimeCatalog> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runtime`);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Runtime request failed"));
  }

  return (await response.json()) as RuntimeCatalog;
}

export async function getPipelineRuns(): Promise<PipelineRunSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs`);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Runs request failed"));
  }

  return (await response.json()) as PipelineRunSummary[];
}

export async function getPipelineRun(requestId: string): Promise<PipelineRunDetail> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs/${requestId}`);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Run detail request failed"));
  }

  return (await response.json()) as PipelineRunDetail;
}

export async function upsertCustomProvider(
  payload: CustomProviderUpsertRequest,
): Promise<ProviderDescriptor> {
  const response = await fetch(`${API_BASE_URL}/api/v1/providers/custom`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Custom provider request failed"));
  }

  return (await response.json()) as ProviderDescriptor;
}

export async function deleteCustomProvider(name: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/providers/custom/${name}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Delete provider request failed"));
  }
}

export async function runPipeline(
  prompt: string,
  provider: ModelProvider,
  sandboxMode: SandboxMode,
  sourceImage?: string | null,
  sourceImageName?: string | null,
): Promise<PipelineResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/pipeline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      provider,
      source_image: sourceImage ?? null,
      source_image_name: sourceImageName ?? null,
      sandbox_mode: sandboxMode,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Pipeline request failed"));
  }

  return (await response.json()) as PipelineResponse;
}
