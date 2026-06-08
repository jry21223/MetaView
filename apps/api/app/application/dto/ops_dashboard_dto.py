from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

MetricTrend = Literal["up", "down", "neutral"]
HealthStatus = Literal["ok", "warn", "bad", "neutral"]


class OpsMetricCard(BaseModel):
    id: str
    label: str
    value: str
    helper: str
    trend: MetricTrend = "neutral"
    delta_percent: float | None = None
    data: list[int] = Field(default_factory=list)


class OpsRunTrendPoint(BaseModel):
    date: str
    total: int
    succeeded: int
    failed: int
    in_flight: int


class OpsRevenueTrendPoint(BaseModel):
    date: str
    paid_orders: int
    revenue_cents: int
    revenue_yuan: str


class OpsDistributionPoint(BaseModel):
    id: str
    label: str
    count: int


class OpsRunRow(BaseModel):
    run_id: str
    user_id: str | None = None
    user_display_name: str | None = None
    status: str
    prompt: str
    title: str | None = None
    domain: str | None = None
    created_at: str
    error: str | None = None


class OpsOrderRow(BaseModel):
    order_id: str
    user_id: str
    user_display_name: str | None = None
    amount_cents: int
    amount_yuan: str
    status: str
    channel: str
    created_at: str
    paid_at: str | None = None


class OpsHealthTreeItem(BaseModel):
    id: str
    label: str
    value: str
    status: HealthStatus = "neutral"
    children: list["OpsHealthTreeItem"] = Field(default_factory=list)


class OpsDashboardResponse(BaseModel):
    generated_at: str
    window_days: Literal[7, 30, 90]
    kpis: list[OpsMetricCard]
    run_trend: list[OpsRunTrendPoint]
    revenue_trend: list[OpsRevenueTrendPoint]
    status_distribution: list[OpsDistributionPoint]
    domain_distribution: list[OpsDistributionPoint]
    recent_runs: list[OpsRunRow]
    recent_orders: list[OpsOrderRow]
    health_tree: list[OpsHealthTreeItem]
