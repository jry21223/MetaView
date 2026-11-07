import { describe, expect, it } from "vitest";
import {
  alignDashboardTrends,
  findHealthItem,
  formatUtc,
} from "./opsDashboardView";
import { sampleDashboard } from "./testFixtures";

describe("Ops overview data boundaries", () => {
  it("aligns differently ordered and missing dates without inventing zero values", () => {
    const dashboard = sampleDashboard();
    dashboard.run_trend = dashboard.run_trend.slice(1).reverse();
    dashboard.revenue_trend = dashboard.revenue_trend.slice(0, 2);
    const points = alignDashboardTrends(dashboard);
    expect(points.map((point) => point.date)).toEqual([
      "2026-06-06",
      "2026-06-07",
      "2026-06-08",
    ]);
    expect(points[0].run).toBeUndefined();
    expect(points[1].run?.failed).toBe(1);
    expect(points[1].revenue?.revenue_cents).toBe(0);
    expect(points[2].revenue).toBeUndefined();
  });
  it("reads a nested refund value without changing the parent status", () => {
    const tree = sampleDashboard().health_tree;
    expect(findHealthItem(tree, "billing-refund")?.value).toBe("¥ 2.25");
    expect(findHealthItem(tree, "billing")?.status).toBe("ok");
    expect(findHealthItem(tree, "billing-refund")?.status).toBe("warn");
    expect(findHealthItem(tree, "absent")).toBeUndefined();
  });
  it("formats details in the same UTC day boundary as the trends", () => {
    expect(formatUtc("2026-06-08T03:00:00+08:00")).toBe("06/07 19:00 UTC");
    expect(formatUtc("invalid")).toBe("invalid");
  });
});
