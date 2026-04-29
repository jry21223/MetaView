import { API_BASE_URL, readErrorMessage } from "../../../shared/api/httpClient";
import type {
  CustomProviderTestResponse,
  CustomProviderUpsertRequest,
  ProviderDescriptor,
} from "../../../entities/provider/types";

export async function upsertCustomProvider(
  payload: CustomProviderUpsertRequest,
): Promise<ProviderDescriptor> {
  const response = await fetch(`${API_BASE_URL}/api/v1/providers/custom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok)
    throw new Error(await readErrorMessage(response, "Custom provider request failed"));
  return (await response.json()) as ProviderDescriptor;
}

export async function deleteCustomProvider(name: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/providers/custom/${name}`, {
    method: "DELETE",
  });
  if (!response.ok)
    throw new Error(await readErrorMessage(response, "Delete provider request failed"));
}

export async function testCustomProvider(
  payload: CustomProviderUpsertRequest,
): Promise<CustomProviderTestResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/providers/custom/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok)
    throw new Error(await readErrorMessage(response, "Custom provider test failed"));
  return (await response.json()) as CustomProviderTestResponse;
}
