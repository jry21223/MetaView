import { API_BASE_URL, readErrorMessage } from "../../../shared/api/httpClient";
import type { RuntimeCatalog, RuntimeSettings, RuntimeSettingsUpdateRequest } from "../../../entities/provider/types";

export async function getRuntimeCatalog(): Promise<RuntimeCatalog> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runtime`);
  if (!response.ok) throw new Error(await readErrorMessage(response, "Runtime request failed"));
  return (await response.json()) as RuntimeCatalog;
}

export async function updateRuntimeSettings(
  payload: RuntimeSettingsUpdateRequest,
): Promise<RuntimeSettings> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runtime/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok)
    throw new Error(await readErrorMessage(response, "Runtime settings request failed"));
  return (await response.json()) as RuntimeSettings;
}
