import type {
  CustomProviderTestResponse,
  CustomProviderUpsertRequest,
  ManimScriptPrepareResponse,
  ManimScriptRenderResponse,
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
  sourceCode?: string | null,
  sourceCodeLanguage?: string | null,
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
      provider: generationProvider,
      router_provider: routerProvider,
      generation_provider: generationProvider,
      source_code: sourceCode ?? null,
      source_code_language: sourceCodeLanguage ?? null,
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
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Manim render request failed"));
  }

  return (await response.json()) as ManimScriptRenderResponse;
}

// ========== ManimCat 风格架构 API ==========

export interface ConceptDesignRequest {
  prompt: string;
  domain?: string;
  source_code?: string;
  source_image?: string;
}

export interface ConceptDesignResponse {
  success: boolean;
  concept_id: string;
  title: string;
  domain: string;
  objects: string[];
  key_moments: string[];
  scenes_count: number;
  complexity_score: number;
  duration_estimate: number;
  metadata: Record<string, unknown>;
}

export interface CodeGenerationRequest {
  concept_id: string;
  optimize?: boolean;
}

export interface CodeGenerationResponse {
  success: boolean;
  code: string;
  scene_class_name: string;
  lines_of_code: number;
  diagnostics: string[];
  metadata: Record<string, unknown>;
}

export interface Process {
  process_id: string;
  prompt: string;
  states: Array<{
    stage: string;
    status: string;
    data: Record<string, unknown>;
    timestamp: string;
  }>;
  result?: Record<string, unknown>;
  error?: string;
  created_at: string;
  completed_at?: string;
}

export interface TaskQueueStats {
  queued: number;
  active: number;
  completed: number;
  failed: number;
  max_concurrent: number;
  max_queue_size: number;
}

export async function designConcept(
  payload: ConceptDesignRequest,
): Promise<ConceptDesignResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/concept/design`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Concept design request failed"));
  }

  return (await response.json()) as ConceptDesignResponse;
}

export async function generateCode(
  payload: CodeGenerationRequest,
): Promise<CodeGenerationResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/code/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Code generation request failed"));
  }

  return (await response.json()) as CodeGenerationResponse;
}

export async function getProcesses(limit = 50, status?: string): Promise<Process[]> {
  const url = new URL(`${API_BASE_URL}/api/v1/process`);
  url.searchParams.set("limit", limit.toString());
  if (status) {
    url.searchParams.set("status", status);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Process list request failed"));
  }

  return (await response.json()) as Process[];
}

export async function getProcess(processId: string): Promise<Process> {
  const response = await fetch(`${API_BASE_URL}/api/v1/process/${processId}`);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Process detail request failed"));
  }

  return (await response.json()) as Process;
}

export async function replayProcess(processId: string): Promise<Process> {
  const response = await fetch(`${API_BASE_URL}/api/v1/process/${processId}/replay`);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Process replay request failed"));
  }

  return (await response.json()) as Process;
}

export async function getTaskQueueStats(): Promise<TaskQueueStats> {
  const response = await fetch(`${API_BASE_URL}/api/v1/tasks`);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Task queue stats request failed"));
  }

  return (await response.json()) as TaskQueueStats;
}
