import { API_BASE_URL, readErrorMessage } from "../../../shared/api/httpClient";

export type ExportJobStatus =
  | "queued"
  | "bundling"
  | "generating_audio"
  | "rendering"
  | "completed"
  | "failed";

export interface ExportTtsConfig {
  // Issue #40: api_key / base_url / model are now server-side defaults; we
  // only forward the user-chosen voice. The fields remain optional so
  // long-lived deployments that still ship a key keep working.
  api_key?: string;
  base_url?: string;
  model?: string;
  voice: string;
}

export type ExportQuality = "720p" | "1080p" | "2k";
export type ExportFormat = "mp4" | "webm" | "gif";

export interface ExportOptions {
  quality?: ExportQuality;
  fps?: number;
  format?: ExportFormat;
}

export interface ExportRequestBody {
  run_id: string;
  version_id?: string | null;
  with_audio: boolean;
  tts?: ExportTtsConfig;
  options?: ExportOptions;
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
