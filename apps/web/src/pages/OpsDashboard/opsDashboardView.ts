import type {
  OpsDashboardResponse,
  OpsHealthTreeItem,
} from "../../features/ops-dashboard";

export function findHealthItem(
  items: OpsHealthTreeItem[],
  id: string,
): OpsHealthTreeItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const child = findHealthItem(item.children, id);
    if (child) return child;
  }
  return undefined;
}

export function alignDashboardTrends(dashboard: OpsDashboardResponse) {
  const runs = new Map(dashboard.run_trend.map((point) => [point.date, point]));
  const revenue = new Map(
    dashboard.revenue_trend.map((point) => [point.date, point]),
  );
  return [...new Set([...runs.keys(), ...revenue.keys()])]
    .sort()
    .map((date) => ({ date, run: runs.get(date), revenue: revenue.get(date) }));
}

export function formatUtc(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return (
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: "UTC",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date) + " UTC"
  );
}

export function shortDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.slice(5).replace("-", "/")
    : value;
}

export function statusLabel(status: string) {
  return (
    (
      {
        queued: "排队",
        running: "生成中",
        reviewing: "审核中",
        succeeded: "完成",
        failed: "失败",
        pending: "待支付",
        paid: "已支付",
        closed: "已关闭",
        enabled: "启用",
        disabled: "禁用",
      } as Record<string, string>
    )[status] ?? status
  );
}

export function statusTone(status: string) {
  if (["succeeded", "paid", "enabled", "ok"].includes(status))
    return "positive";
  if (["failed", "disabled", "bad"].includes(status)) return "negative";
  if (["queued", "running", "reviewing", "pending", "warn"].includes(status))
    return "warning";
  return "neutral";
}

export function healthLabel(status: string) {
  return (
    (
      { ok: "正常", warn: "关注", bad: "异常", neutral: "记录" } as Record<
        string,
        string
      >
    )[status] ?? status
  );
}

export function domainLabel(domain: string | null | undefined) {
  return (
    (
      {
        math: "数学",
        algorithm: "算法",
        code: "代码",
        physics: "物理",
        chemistry: "化学",
        biology: "生物",
        geography: "地理",
      } as Record<string, string>
    )[domain ?? ""] ??
    domain ??
    "未识别"
  );
}

export function money(cents: number) {
  return `¥ ${(cents / 100).toFixed(2)}`;
}
