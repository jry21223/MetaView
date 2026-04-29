import { API_BASE_URL, readErrorMessage } from "../../../shared/api/httpClient";
import type { PipelineResponse, PipelineSubmitResponse } from "../../../entities/pipeline/types";
import type { ModelProvider, SandboxMode, TopicDomain, UITheme } from "../../../shared/types";

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
    headers: { "Content-Type": "application/json" },
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
  if (!response.ok) throw new Error(await readErrorMessage(response, "Pipeline request failed"));
  return (await response.json()) as PipelineResponse;
}

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
): Promise<PipelineSubmitResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/pipeline/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  if (!response.ok) throw new Error(await readErrorMessage(response, "Pipeline submit failed"));
  return (await response.json()) as PipelineSubmitResponse;
}
