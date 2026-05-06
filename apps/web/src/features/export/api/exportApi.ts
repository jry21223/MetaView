import { API_BASE_URL, readErrorMessage } from "../../../shared/api/httpClient";

export type ExportJobStatus =
  | "queued"
  | "bundling"
  | "generating_audio"
  | "rendering"
  | "completed"
  | "failed";

export interface ExportTtsConfig {
  api_key: string;
  base_url: string;
  model: string;
  voice: string;
}

export interface ExportRequestBody {
  run_id: string;
  with_audio: boolean;
  tts?: ExportTtsConfig;
}

export interface ExportJobResponse {
  job_id: string;
  run_id: string;
  status: ExportJobStatus;
  progress: number;
  message: string | null;
  output_url: string | null;
  error: string | null;
  with_audio: boolean;
  created_at: string;
}

export async function submitExport(body: ExportRequestBody): Promise<ExportJobResponse> {
  const resp = await fetch(`${API_BASE_URL}/api/v1/exports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(await readErrorMessage(resp, "提交导出任务失败"));
  }
  return (await resp.json()) as ExportJobResponse;
}

export async function getExportStatus(jobId: string): Promise<ExportJobResponse> {
  const resp = await fetch(`${API_BASE_URL}/api/v1/exports/${jobId}`);
  if (!resp.ok) {
    throw new Error(await readErrorMessage(resp, "获取导出状态失败"));
  }
  return (await resp.json()) as ExportJobResponse;
}

export function buildDownloadUrl(outputUrl: string): string {
  if (outputUrl.startsWith("http")) return outputUrl;
  return `${API_BASE_URL}${outputUrl}`;
}
