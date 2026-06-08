import { API_BASE_URL, readErrorMessage } from "../../../shared/api/httpClient";

export type OpsMetricTrend = "up" | "down" | "neutral";
export type OpsHealthStatus = "ok" | "warn" | "bad" | "neutral";
export type OpsDashboardWindowDays = 7 | 30 | 90;

export interface OpsMetricCard {
  id: string;
  label: string;
  value: string;
  helper: string;
  trend: OpsMetricTrend;
  delta_percent?: number | null;
  data: number[];
}

export interface OpsRunTrendPoint {
  date: string;
  total: number;
  succeeded: number;
  failed: number;
  in_flight: number;
}

export interface OpsRevenueTrendPoint {
  date: string;
  paid_orders: number;
  revenue_cents: number;
  revenue_yuan: string;
}

export interface OpsDistributionPoint {
  id: string;
  label: string;
  count: number;
}

export interface OpsRunRow {
  run_id: string;
  status: string;
  prompt: string;
  title?: string | null;
  domain?: string | null;
  created_at: string;
  error?: string | null;
}

export interface OpsOrderRow {
  order_id: string;
  amount_cents: number;
  amount_yuan: string;
  status: string;
  channel: string;
  created_at: string;
  paid_at?: string | null;
}

export interface OpsHealthTreeItem {
  id: string;
  label: string;
  value: string;
  status: OpsHealthStatus;
  children: OpsHealthTreeItem[];
}

export interface OpsDashboardResponse {
  generated_at: string;
  window_days: OpsDashboardWindowDays;
  kpis: OpsMetricCard[];
  run_trend: OpsRunTrendPoint[];
  revenue_trend: OpsRevenueTrendPoint[];
  status_distribution: OpsDistributionPoint[];
  domain_distribution: OpsDistributionPoint[];
  recent_runs: OpsRunRow[];
  recent_orders: OpsOrderRow[];
  health_tree: OpsHealthTreeItem[];
}

export class OpsDashboardRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OpsDashboardRequestError";
  }
}

export async function fetchOpsDashboard(params: {
  windowDays: OpsDashboardWindowDays;
  limit?: number;
}): Promise<OpsDashboardResponse> {
  const query = new URLSearchParams({
    window_days: String(params.windowDays),
    limit: String(params.limit ?? 50),
  });
  const response = await fetch(`${API_BASE_URL}/api/v1/ops/dashboard?${query}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new OpsDashboardRequestError(
      await readErrorMessage(response, "Ops dashboard request failed"),
      response.status,
    );
  }
  return (await response.json()) as OpsDashboardResponse;
}
