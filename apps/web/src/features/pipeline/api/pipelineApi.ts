import { API_BASE_URL, readErrorMessage } from "../../../shared/api/httpClient";
import type { PipelineRunResult } from "../../../entities/pipeline/types";

export type SubmitRouterMode = "off" | "heuristic" | "llm" | "hybrid";

export interface SubmitPipelineRequest {
  prompt: string;
  domain?: string | null;
  source_code?: string | null;
  language?: string;
  provider_api_key?: string | null;
  provider_base_url?: string | null;
  provider_model?: string | null;
  router_mode?: SubmitRouterMode | null;
  router_model?: string | null;
  router_min_confidence?: number | null;
  router_timeout_s?: number | null;
}

export interface SubmitPipelineResponse {
  run_id: string;
  status: string;
  created_at: string;
}

export async function submitPipeline(
  req: SubmitPipelineRequest,
): Promise<SubmitPipelineResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Pipeline submit failed"));
  }
  return (await response.json()) as SubmitPipelineResponse;
}

export async function getPipelineRun(runId: string): Promise<PipelineRunResult> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs/${runId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to fetch run"));
  }
  return (await response.json()) as PipelineRunResult;
}
