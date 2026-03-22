import type {
  CustomProviderTestResponse,
  CustomProviderUpsertRequest,
  ManimScriptPrepareResponse,
  ManimScriptRenderResponse,
  ModelProvider,
  PipelineResponse,
  PipelineRunDetail,
  PipelineRunSummary,
  PromptReferenceRequest,
  PromptReferenceResponse,
  ProviderDescriptor,
  RuntimeCatalog,
  SandboxMode,
  TopicDomain,
  UITheme,
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

export async function testCustomProvider(
  payload: CustomProviderUpsertRequest,
): Promise<CustomProviderTestResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/providers/custom/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Custom provider test failed"));
  }

  return (await response.json()) as CustomProviderTestResponse;
}

export async function runPipeline(
  prompt: string,
  routerProvider: ModelProvider,
  generationProvider: ModelProvider,
  sandboxMode: SandboxMode,
  domain?: TopicDomain | null,
  sourceCode?: string | null,
  sourceCodeLanguage?: string | null,
  sourceImage?: string | null,
  sourceImageName?: string | null,
  uiTheme?: UITheme | null,
  enableNarration = true,
): Promise<PipelineResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/pipeline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      domain: domain ?? null,
      provider: generationProvider,
      router_provider: routerProvider,
      generation_provider: generationProvider,
      source_code: sourceCode ?? null,
      source_code_language: sourceCodeLanguage ?? null,
      source_image: sourceImage ?? null,
      source_image_name: sourceImageName ?? null,
      ui_theme: uiTheme ?? null,
      enable_narration: enableNarration,
      sandbox_mode: sandboxMode,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Pipeline request failed"));
  }

  return (await response.json()) as PipelineResponse;
}

export async function generatePromptReference(
  payload: PromptReferenceRequest,
): Promise<PromptReferenceResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/prompts/reference`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Prompt reference request failed"));
  }

  return (await response.json()) as PromptReferenceResponse;
}

export async function prepareManimScript(
  source: string,
  sceneClassName = "GeneratedScene",
): Promise<ManimScriptPrepareResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/manim/prepare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source,
      scene_class_name: sceneClassName,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Manim prepare request failed"));
  }

  return (await response.json()) as ManimScriptPrepareResponse;
}

export async function renderManimScript(
  source: string,
  sceneClassName = "GeneratedScene",
  requireReal = true,
  narrationText?: string | null,
): Promise<ManimScriptRenderResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/manim/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source,
      scene_class_name: sceneClassName,
      require_real: requireReal,
      narration_text: narrationText ?? null,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Manim render request failed"));
  }

  return (await response.json()) as ManimScriptRenderResponse;
}
