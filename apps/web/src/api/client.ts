import type {
  CustomSubjectPromptRequest,
  CustomSubjectPromptResponse,
  CustomProviderTestResponse,
  CustomProviderUpsertRequest,
  ManimScriptPrepareResponse,
  ManimScriptRenderResponse,
  ModelProvider,
  PipelineResponse,
  PipelineRunDetail,
  PipelineRunSummary,
  PipelineSubmitResponse,
  PromptReferenceRequest,
  PromptReferenceResponse,
  ProviderDescriptor,
  RuntimeCatalog,
  RuntimeSettings,
  RuntimeSettingsUpdateRequest,
  SandboxMode,
  TopicDomain,
  UITheme,
} from "../types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  if (response.status === 413) {
    return "提交内容过大，已被网关拒绝。请缩小图片体积，或联系管理员提高请求体限制。";
  }

  let body = "";
  try {
    body = (await response.text()).trim();
  } catch {
    // Ignore body parsing failures and fall back to a generic message.
  }

  if (body.length > 0) {
    try {
      const payload = JSON.parse(body) as {
        detail?: string;
        error_id?: string;
        error_type?: string;
        log_hint?: string;
        message?: string;
      };
      const parts: string[] = [];
      if (typeof payload.detail === "string" && payload.detail.length > 0) {
        parts.push(payload.detail);
      } else if (typeof payload.message === "string" && payload.message.length > 0) {
        parts.push(payload.message);
      }
      if (typeof payload.error_type === "string" && payload.error_type.length > 0) {
        parts.push(`错误类型: ${payload.error_type}`);
      }
      if (typeof payload.error_id === "string" && payload.error_id.length > 0) {
        parts.push(`错误 ID: ${payload.error_id}`);
      }
      if (typeof payload.log_hint === "string" && payload.log_hint.length > 0) {
        parts.push(payload.log_hint);
      }
      if (parts.length > 0) {
        return parts.join("\n");
      }
    } catch {
      return `${fallback} (${response.status})\n${body.slice(0, 1200)}`;
    }
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

export async function updateRuntimeSettings(
  payload: RuntimeSettingsUpdateRequest,
): Promise<RuntimeSettings> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runtime/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Runtime settings request failed"));
  }

  return (await response.json()) as RuntimeSettings;
}

export async function getPipelineRuns(): Promise<PipelineRunSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs`);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Runs request failed"));
  }

  return (await response.json()) as PipelineRunSummary[];
}

export async function getPipelineRun(
  requestId: string,
  options?: {
    includeSourceImage?: boolean;
    includeRawOutput?: boolean;
  },
): Promise<PipelineRunDetail> {
  const params = new URLSearchParams();
  if (options?.includeSourceImage) {
    params.set("include_source_image", "true");
  }
  if (options?.includeRawOutput) {
    params.set("include_raw_output", "true");
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/v1/runs/${requestId}${query}`);

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

/**
 * Submit a pipeline run.
 *
 * The `output_mode` parameter controls whether the backend produces a
 * Manim video ("video") or an in-page interactive HTML animation ("html").
 */
export async function submitPipeline(
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
  outputMode: "video" | "html" = "video",
): Promise<PipelineSubmitResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/pipeline/submit`, {
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
      output_mode: outputMode,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Pipeline submit failed"));
  }

  return (await response.json()) as PipelineSubmitResponse;
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

export async function generateCustomSubjectPrompt(
  payload: CustomSubjectPromptRequest,
): Promise<CustomSubjectPromptResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/prompts/custom-subject`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Custom subject prompt request failed"));
  }

  return (await response.json()) as CustomSubjectPromptResponse;
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
