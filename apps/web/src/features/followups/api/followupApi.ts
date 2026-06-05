import { API_BASE_URL, readErrorMessage } from "../../../shared/api/httpClient";
import type { DirectorScript, PlaybookScript } from "../../playbook/engine/types";
import type { ProviderSettings } from "../../providers/hooks/useProviderSettings";

export interface FollowUpChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RunFollowUpRecord {
  followup_id: string;
  run_id: string;
  user_message: string;
  assistant_reply: string;
  change_summary: string;
  patch_json: string;
  version_id: string | null;
  created_at: string;
}

export interface RunVersionRecord {
  version_id: string;
  short_id: string;
  run_id: string;
  version_number: number;
  parent_version_id: string | null;
  source: string;
  summary: string;
  followup_id: string | null;
  created_at: string;
  is_head: boolean;
}

export interface RunFollowUpsResponse {
  followups: RunFollowUpRecord[];
  versions: RunVersionRecord[];
}

export interface FollowUpResponse {
  reply: string;
  change_summary: string;
  version_id: string;
  playbook: PlaybookScript;
  director?: DirectorScript | null;
}

export async function submitRunFollowUp(
  runId: string,
  message: string,
  messages: FollowUpChatMessage[],
  provider?: ProviderSettings,
  signal?: AbortSignal,
): Promise<FollowUpResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs/${runId}/follow-up`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      messages,
      provider_api_key: provider?.apiKey || null,
      provider_base_url: provider?.baseUrl || null,
      provider_model: provider?.model || null,
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Follow-up failed"));
  }
  return (await response.json()) as FollowUpResponse;
}

export async function listRunFollowUps(
  runId: string,
  signal?: AbortSignal,
): Promise<RunFollowUpsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs/${runId}/follow-ups`, { signal });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to load follow-ups"));
  }
  return (await response.json()) as RunFollowUpsResponse;
}

export async function restoreRunVersion(
  runId: string,
  versionId: string,
): Promise<{ version_id: string; playbook: PlaybookScript; director?: DirectorScript | null }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs/${runId}/versions/${versionId}/restore`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Version restore failed"));
  }
  return (await response.json()) as {
    version_id: string;
    playbook: PlaybookScript;
    director?: DirectorScript | null;
  };
}
