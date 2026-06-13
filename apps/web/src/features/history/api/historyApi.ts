import { API_BASE_URL, readErrorMessage } from "../../../shared/api/httpClient";
import type { PipelineRunResult } from "../../../entities/pipeline/types";

export async function getPipelineRuns(): Promise<PipelineRunResult[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, "Runs request failed"));
  return (await response.json()) as PipelineRunResult[];
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
