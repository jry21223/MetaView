import type { OpsDashboardResponse } from "../../features/ops-dashboard";
import { alignDashboardTrends, money, shortDate } from "./opsDashboardView";

interface OpsTimelineProps {
  points: ReturnType<typeof alignDashboardTrends>;
  kind: "runs" | "revenue";
}

/** Both tracks use these exact dates and plotting insets; their Y scales differ. */
export function OpsTimeline({ points, kind }: OpsTimelineProps) {
  const observedMax = Math.max(
    1,
    ...points.map((point) =>
      kind === "runs"
        ? (point.run?.total ?? 0)
        : (point.revenue?.revenue_cents ?? 0) / 100,
    ),
  );
  const max =
    kind === "runs" && observedMax > 1
      ? Math.ceil(observedMax / 2) * 2
      : observedMax;
  const valueTicks = kind === "runs" && max === 1 ? [1, 0] : [max, max / 2, 0];
  const step = 1000 / Math.max(points.length, 1);
  const barWidth = step * 0.64;
  const ticks = points.length
    ? [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]
    : [];
  const label = kind === "runs" ? "逐日生成任务趋势" : "逐日充值收入趋势";

  return (
    <div className="mv-ops-timeline">
      <div className="mv-ops-timeline__axis" aria-hidden="true">
        {valueTicks.map((value) => (
          <span key={value}>
            {value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
          </span>
        ))}
      </div>
      <div className="mv-ops-timeline__plot">
        <svg
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={label}
        >
          <title>
            {label}，两条轨道共用UTC日期，纵轴分别为任务数和人民币元
          </title>
          {valueTicks
            .map((value) => 100 - (value / max) * 100)
            .map((y) => (
              <line
                key={y}
                x1="0"
                x2="1000"
                y1={y}
                y2={y}
                className="mv-ops-timeline__grid"
              />
            ))}
          {points.map((point, index) => {
            const x = index * step + (step - barWidth) / 2;
            if (kind === "revenue") {
              if (!point.revenue) return null;
              const height = (point.revenue.revenue_cents / 100 / max) * 100;
              return (
                <rect
                  key={point.date}
                  x={x}
                  y={100 - height}
                  width={barWidth}
                  height={height}
                  className="mv-ops-timeline__revenue"
                >
                  <title>
                    {point.date} · {money(point.revenue.revenue_cents)} · 已支付{" "}
                    {point.revenue.paid_orders} 笔
                  </title>
                </rect>
              );
            }
            if (!point.run) return null;
            let accumulated = 0;
            return (
              <g key={point.date}>
                {(["succeeded", "failed", "in_flight"] as const).map(
                  (status) => {
                    const count = point.run![status];
                    accumulated += count;
                    return (
                      <rect
                        key={status}
                        x={x}
                        y={100 - (accumulated / max) * 100}
                        width={barWidth}
                        height={(count / max) * 100}
                        className={`mv-ops-timeline__${status}`}
                      >
                        <title>
                          {point.date} ·{" "}
                          {status === "succeeded"
                            ? "完成"
                            : status === "failed"
                              ? "失败"
                              : "进行中"}{" "}
                          {count}
                        </title>
                      </rect>
                    );
                  },
                )}
              </g>
            );
          })}
        </svg>
        <div className="mv-ops-timeline__dates" aria-hidden="true">
          {ticks.map((index) => (
            <span key={points[index].date}>
              {shortDate(points[index].date)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DailyData({ dashboard }: { dashboard: OpsDashboardResponse }) {
  return (
    <div className="mv-ops-daily-data">
      {alignDashboardTrends(dashboard).map(({ date, run, revenue }) => (
        <div className="mv-ops-daily-row" key={date}>
          <time dateTime={date}>{date}</time>
          <span>
            {run
              ? `任务 ${run.total} · 完成 ${run.succeeded} · 失败 ${run.failed} · 进行中 ${run.in_flight}`
              : "任务数据缺失"}
          </span>
          <span>
            {revenue
              ? `${money(revenue.revenue_cents)} · 已支付 ${revenue.paid_orders} 笔`
              : "充值数据缺失"}
          </span>
        </div>
      ))}
    </div>
  );
}
