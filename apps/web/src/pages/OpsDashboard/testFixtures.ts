import type { OpsDashboardResponse } from "../../features/ops-dashboard";

export function sampleDashboard(): OpsDashboardResponse {
  return {
    generated_at: "2026-06-08T03:00:00+00:00",
    window_days: 30,
    kpis: [
      {
        id: "users",
        label: "用户数",
        value: "2",
        helper: "近窗新增 1，活跃 1，管理员 1",
        trend: "up",
        delta_percent: 100,
        data: [0, 1, 0],
      },
      {
        id: "runs",
        label: "生成任务",
        value: "3",
        helper: "成功 1，失败 1，成功率 50.0%",
        trend: "up",
        delta_percent: 100,
        data: [0, 1, 2],
      },
      {
        id: "revenue",
        label: "充值收入",
        value: "¥ 15.00",
        helper: "近 30 天已支付订单",
        trend: "up",
        delta_percent: 100,
        data: [0, 0, 1500],
      },
    ],
    run_trend: [
      { date: "2026-06-06", total: 0, succeeded: 0, failed: 0, in_flight: 0 },
      { date: "2026-06-07", total: 1, succeeded: 0, failed: 1, in_flight: 0 },
      { date: "2026-06-08", total: 2, succeeded: 1, failed: 0, in_flight: 1 },
    ],
    revenue_trend: [
      { date: "2026-06-06", paid_orders: 0, revenue_cents: 0, revenue_yuan: "0.00" },
      { date: "2026-06-07", paid_orders: 0, revenue_cents: 0, revenue_yuan: "0.00" },
      { date: "2026-06-08", paid_orders: 1, revenue_cents: 1500, revenue_yuan: "15.00" },
    ],
    status_distribution: [
      { id: "succeeded", label: "完成", count: 1 },
      { id: "failed", label: "失败", count: 1 },
      { id: "running", label: "生成中", count: 1 },
    ],
    domain_distribution: [
      { id: "math", label: "数学", count: 1 },
      { id: "unresolved", label: "未识别", count: 2 },
    ],
    recent_runs: [
      {
        run_id: "run-1",
        status: "succeeded",
        prompt: "讲解矩阵",
        title: "矩阵特征值",
        domain: "math",
        created_at: "2026-06-08T03:00:00+00:00",
        error: null,
      },
    ],
    recent_orders: [
      {
        order_id: "order-1",
        amount_cents: 1500,
        amount_yuan: "15.00",
        status: "paid",
        channel: "wechat_native",
        created_at: "2026-06-08T03:00:00+00:00",
        paid_at: "2026-06-08T03:00:00+00:00",
      },
    ],
    health_tree: [
      {
        id: "generation",
        label: "生成任务",
        value: "3",
        status: "warn",
        children: [
          {
            id: "generation-success",
            label: "成功率",
            value: "50.0%",
            status: "neutral",
            children: [],
          },
        ],
      },
    ],
  };
}
