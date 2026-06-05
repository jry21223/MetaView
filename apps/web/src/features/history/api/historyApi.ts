import { API_BASE_URL, readErrorMessage } from "../../../shared/api/httpClient";
import type { PipelineRunDetail, PipelineRunSummary } from "../../../entities/pipeline/types";

export async function getPipelineRuns(): Promise<PipelineRunSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, "Runs request failed"));
  return (await response.json()) as PipelineRunSummary[];
}

export async function getPipelineRun(
  requestId: string,
  options?: { includeSourceImage?: boolean; includeRawOutput?: boolean },
): Promise<PipelineRunDetail> {
  const params = new URLSearchParams();
  if (options?.includeSourceImage) params.set("include_source_image", "true");
  if (options?.includeRawOutput) params.set("include_raw_output", "true");
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/v1/runs/${requestId}${query}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, "Run detail request failed"));
  return (await response.json()) as PipelineRunDetail;
}

export async function deletePipelineRun(requestId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs/${requestId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Run delete request failed"));
  }
}
