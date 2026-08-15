import { API_BASE_URL, readErrorMessage } from "../../../shared/api/httpClient";

export interface OpsAccountRow {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  login_provider: string;
  status: string;
  role: string;
  balance_yuan: string;
  created_at: string;
  last_active_at?: string | null;
}

export interface OpsAccountsResponse {
  items: OpsAccountRow[];
  total: number;
  page: number;
  page_size: number;
}

export class OpsAccountsRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OpsAccountsRequestError";
  }
}

export async function fetchOpsAccounts(params: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<OpsAccountsResponse> {
  const query = new URLSearchParams({
    page: String(params.page ?? 1),
    page_size: String(params.pageSize ?? 20),
  });
  if (params.search) query.set("search", params.search);
  const response = await fetch(`${API_BASE_URL}/api/v1/ops/accounts?${query}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new OpsAccountsRequestError(
      await readErrorMessage(response, "Ops accounts request failed"),
      response.status,
    );
  }
  return (await response.json()) as OpsAccountsResponse;
}
