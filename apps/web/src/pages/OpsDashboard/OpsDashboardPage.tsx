import React, { useMemo, useRef, useState } from "react";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloseIcon from "@mui/icons-material/Close";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { ThemeProvider } from "@mui/material/styles";
import {
  useOpsAccounts,
  useOpsDashboard,
  type OpsDashboardResponse,
  type OpsDashboardWindowDays,
  type OpsHealthTreeItem,
  type OpsMetricCard,
  type OpsOrderRow,
  type OpsRunRow,
} from "../../features/ops-dashboard";
import { usePrefersReducedMotion } from "../../shared/hooks/usePrefersReducedMotion";
import {
  OPS_MOTION,
  OPS_THEME_VARS,
  opsDashboardTheme,
} from "./opsDashboardTheme";
import { DailyData, OpsTimeline } from "./OpsTimeline";
import {
  alignDashboardTrends,
  domainLabel,
  findHealthItem,
  formatUtc,
  healthLabel,
  money,
  statusLabel,
  statusTone,
} from "./opsDashboardView";

interface OpsDashboardPageProps {
  accountName?: string | null;
  accountBalanceYuan?: string | null;
  accountAvatarUrl?: string | null;
  onOpenProviderSettings?: () => void;
  onRequireLogin?: () => void;
}
type RecordTab = "runs" | "orders";
type DetailPanel = "health" | "definitions" | "daily" | "domains" | null;

export function OpsDashboardPage({
  accountName,
  accountBalanceYuan,
  accountAvatarUrl,
  onOpenProviderSettings,
  onRequireLogin,
}: OpsDashboardPageProps) {
  const [windowDays, setWindowDays] = useState<OpsDashboardWindowDays>(30);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const { dashboard, isLoading, error, errorStatus, refresh } =
    useOpsDashboard(windowDays);
  const denied = errorStatus === 403;
  return (
    <ThemeProvider theme={opsDashboardTheme}>
      <div
        className="mv-root mv-light mv-theme-light mv-density-compact mv-ops-dashboard"
        style={OPS_THEME_VARS}
      >
        <header className="mv-ops-appbar">
          <div className="mv-ops-brand">
            <img src="/brand/metaview-mark.svg" alt="" />
            <span>
              MetaView<small>OPERATIONS</small>
            </span>
          </div>
          <nav className="mv-ops-appnav" aria-label="运营导航">
            <span aria-current="page">运营总览</span>
            {!denied && (
              <Button variant="text" onClick={() => setAccountsOpen(true)}>
                账户
              </Button>
            )}
          </nav>
          <div className="mv-ops-identity">
            <Avatar
              src={accountAvatarUrl ?? undefined}
              alt={accountAvatarUrl ? `${accountName ?? "管理员"}头像` : ""}
              slotProps={{ img: { referrerPolicy: "no-referrer" } }}
            >
              {(accountName ?? "管理员").slice(0, 1)}
            </Avatar>
            <div>
              <span>{accountName ?? "管理员"}</span>
              <small>
                {accountBalanceYuan != null
                  ? `余额 ¥ ${accountBalanceYuan}`
                  : "ADMIN ACCESS"}
              </small>
            </div>
            {onOpenProviderSettings && (
              <Button
                className="mv-ops-identity__action"
                onClick={onOpenProviderSettings}
                aria-label="账户与充值"
              >
                账户与充值
              </Button>
            )}
          </div>
        </header>
        <main className="mv-ops-content">
          <header className="mv-ops-toolbar">
            <div>
              <h1>全局总览</h1>
              <p>
                {dashboard
                  ? `近 ${dashboard.window_days} 天 · UTC 自然日`
                  : "任务、资金、账户与规则检查"}
                <span>
                  {dashboard
                    ? `最近同步 ${formatUtc(dashboard.generated_at)}`
                    : "等待同步"}
                </span>
              </p>
            </div>
            {!denied && (
              <div className="mv-ops-toolbar__actions">
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={windowDays}
                  onChange={(_, value: OpsDashboardWindowDays | null) => {
                    if (value !== null) setWindowDays(value);
                  }}
                  aria-label="运营统计窗口"
                >
                  {([7, 30, 90] as const).map((days) => (
                    <ToggleButton
                      key={days}
                      value={days}
                      aria-label={`${days} 天`}
                    >
                      {days} 天
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={
                    <RefreshIcon
                      className={isLoading ? "mv-ops-refreshing" : undefined}
                    />
                  }
                  onClick={refresh}
                  disabled={isLoading}
                  aria-label="刷新运营数据"
                >
                  {isLoading ? "同步中" : "刷新"}
                </Button>
              </div>
            )}
          </header>
          {denied ? (
            <PermissionPanel onRequireLogin={onRequireLogin} />
          ) : (
            <>
              {isLoading && dashboard && (
                <p className="mv-ops-loading-note" role="status">
                  正在读取近 {windowDays} 天数据，当前保留近{" "}
                  {dashboard.window_days} 天的上次成功结果。
                </p>
              )}
              {error && dashboard && (
                <ErrorBanner error={error} onRefresh={refresh} />
              )}
              {!dashboard &&
                (error ? (
                  <StatePanel title="加载失败" description={error}>
                    <Button variant="outlined" onClick={refresh}>
                      重新加载
                    </Button>
                  </StatePanel>
                ) : (
                  <StatePanel
                    title="同步运营数据"
                    description="正在汇总任务、资金与账户数据。"
                  >
                    <CircularProgress size={24} />
                  </StatePanel>
                ))}
              {dashboard && (
                <Overview
                  dashboard={dashboard}
                  onOpenAccounts={() => setAccountsOpen(true)}
                />
              )}
            </>
          )}
        </main>
        {accountsOpen && !denied && (
          <OpsDialog
            title="账户查询"
            subtitle="全站账户 · 按注册时间倒序 · 只读"
            onClose={() => setAccountsOpen(false)}
            wide
          >
            <AccountsSection />
          </OpsDialog>
        )}
      </div>
    </ThemeProvider>
  );
}

function Overview({
  dashboard,
  onOpenAccounts,
}: {
  dashboard: OpsDashboardResponse;
  onOpenAccounts: () => void;
}) {
  const [panel, setPanel] = useState<DetailPanel>(null);
  const [tableTab, setTableTab] = useState<RecordTab>("runs");
  const [filter, setFilter] = useState("all");
  const recordsRef = useRef<HTMLElement>(null);
  const points = useMemo(() => alignDashboardTrends(dashboard), [dashboard]);
  const metric = (id: string) => dashboard.kpis.find((item) => item.id === id);
  const refund = findHealthItem(dashboard.health_tree, "billing-refund");
  const paidOrders = dashboard.revenue_trend.reduce(
    (total, point) => total + point.paid_orders,
    0,
  );
  const changeTab = (next: RecordTab) => {
    setTableTab(next);
    setFilter("all");
  };
  return (
    <div className="mv-ops-overview">
      <section className="mv-ops-atlas" aria-label="生成、资金与全站存量">
        <div className="mv-ops-tracks">
          <section
            className="mv-ops-track"
            aria-labelledby="ops-generation-title"
          >
            <div className="mv-ops-track__summary">
              <h2 id="ops-generation-title">生成任务</h2>
              <strong className="mv-ops-track__number">
                {metric("runs")?.value ?? "—"}
              </strong>
              <MetricDelta metric={metric("runs")} />
              <p className="mv-ops-track__helper">
                {metric("runs")?.helper ?? "暂无任务指标"}
              </p>
              <div className="mv-ops-terminal">
                <span>终态成功率</span>
                <strong>{metric("success_rate")?.value ?? "—"}</strong>
                <small>
                  {metric("success_rate")?.helper ??
                    "仅统计成功 / 失败终态任务"}
                </small>
              </div>
            </div>
            <div className="mv-ops-track__chart">
              <div className="mv-ops-chart-caption">
                <span>按任务创建日 · 个</span>
                <div className="mv-ops-legend">
                  <span data-series="succeeded">完成</span>
                  <span data-series="failed">失败</span>
                  <span data-series="in_flight">进行中</span>
                </div>
              </div>
              <OpsTimeline points={points} kind="runs" />
              <div
                className="mv-ops-window-status"
                role="group"
                aria-label="窗口任务状态分布"
              >
                {dashboard.status_distribution.length ? (
                  dashboard.status_distribution.map((item) => (
                    <span key={item.id} data-status={item.id}>
                      <i data-tone={statusTone(item.id)} aria-hidden="true" />
                      {item.label}
                      <strong>{item.count}</strong>
                    </span>
                  ))
                ) : (
                  <span>窗口内暂无任务</span>
                )}
                <Button
                  size="small"
                  onClick={() => {
                    setTableTab("runs");
                    setFilter("failed");
                    recordsRef.current?.scrollIntoView?.({
                      block: "nearest",
                      behavior: "auto",
                    });
                  }}
                >
                  核查最近失败
                </Button>
              </div>
            </div>
          </section>
          <section className="mv-ops-track" aria-labelledby="ops-revenue-title">
            <div className="mv-ops-track__summary">
              <h2 id="ops-revenue-title">充值收入</h2>
              <strong className="mv-ops-track__number mv-ops-track__number--money">
                {metric("revenue")?.value ?? "—"}
              </strong>
              <MetricDelta metric={metric("revenue")} />
              <p className="mv-ops-track__helper">
                {metric("revenue")?.helper ?? "暂无充值指标"}
              </p>
              <div className="mv-ops-paid">
                <span>已支付订单</span>
                <strong>
                  {paidOrders} <small>笔</small>
                </strong>
              </div>
            </div>
            <div className="mv-ops-track__chart">
              <div className="mv-ops-chart-caption">
                <span>按支付日 · 人民币元</span>
                <span>与生成轨道共用日期尺</span>
              </div>
              <OpsTimeline points={points} kind="revenue" />
              <div className="mv-ops-money-facts">
                <div>
                  <span>生成消耗</span>
                  <strong>{metric("consumption")?.value ?? "—"}</strong>
                </div>
                <div>
                  <span>退款回补</span>
                  <strong>{refund?.value ?? "—"}</strong>
                </div>
                <Button size="small" onClick={() => setPanel("definitions")}>
                  金额口径
                </Button>
              </div>
            </div>
          </section>
          <div className="mv-ops-tracks__footnote">
            <span>消耗 / 回补各按独立账本汇总，不由任务数推算。</span>
            <Button size="small" onClick={() => setPanel("daily")}>
              逐日数据
            </Button>
          </div>
        </div>
        <aside className="mv-ops-snapshot" aria-label="全站当前快照">
          <header>
            <h2>账户与余额</h2>
            <span>全站当前存量</span>
          </header>
          <div>
            <span className="mv-ops-snapshot__label">
              {metric("users")?.label ?? "用户数"}
              <small>微信账户</small>
            </span>
            <strong className="mv-ops-snapshot__number">
              {metric("users")?.value ?? "—"}
            </strong>
            <p>{metric("users")?.helper ?? "暂无账户统计"}</p>
            <small>活跃指窗口内创建过生成任务</small>
          </div>
          <div className="mv-ops-snapshot__balance">
            <span className="mv-ops-snapshot__label">未消费余额</span>
            <strong className="mv-ops-snapshot__number">
              {metric("balance")?.value ?? "—"}
            </strong>
            <p>{metric("balance")?.helper ?? "全站账户未消费余额"}</p>
            <small>存量不随窗口裁剪</small>
          </div>
          <Button
            variant="outlined"
            onClick={onOpenAccounts}
            endIcon={<ArrowForwardIcon />}
          >
            查询账户
          </Button>
        </aside>
      </section>
      <section className="mv-ops-rules" aria-label="规则检查">
        <span className="mv-ops-rules__label">
          规则检查<small>依据现有数据，非在线监测</small>
        </span>
        <div>
          {dashboard.health_tree.map((item) => (
            <button
              type="button"
              key={item.id}
              data-health-id={item.id}
              data-health-status={item.status}
              onClick={() => setPanel("health")}
            >
              <i data-tone={statusTone(item.status)} aria-hidden="true" />
              <span>{item.label}</span>
              <strong>{healthLabel(item.status)}</strong>
              <ExpandMoreIcon />
            </button>
          ))}
        </div>
        <Button size="small" onClick={() => setPanel("health")}>
          全部依据
        </Button>
      </section>
      <section
        className="mv-ops-records"
        ref={recordsRef}
        aria-label="全站最近记录"
      >
        <header className="mv-ops-records__header">
          <div>
            <h2>最近记录</h2>
            <p>全站按创建时间倒序，独立于统计窗口</p>
          </div>
          <Tabs
            value={tableTab}
            onChange={(_, value: RecordTab) => changeTab(value)}
            aria-label="运营明细表"
          >
            <Tab value="runs" label="任务" />
            <Tab value="orders" label="订单" />
          </Tabs>
        </header>
        <RecentRecords
          key={`${tableTab}-${filter}`}
          dashboard={dashboard}
          tab={tableTab}
          filter={filter}
          onFilter={setFilter}
        />
      </section>
      <footer className="mv-ops-overview__footer">
        <span>
          窗口学科{" "}
          {dashboard.domain_distribution.length
            ? dashboard.domain_distribution
                .map((item) => `${item.label} ${item.count}`)
                .join(" · ")
            : "暂无数据"}
        </span>
        <Button size="small" onClick={() => setPanel("domains")}>
          学科分布与口径
        </Button>
      </footer>
      {panel && (
        <OpsDialog
          title={
            panel === "health"
              ? "规则检查依据"
              : panel === "definitions"
                ? "数据口径"
                : panel === "daily"
                  ? "逐日数据"
                  : "窗口学科分布"
          }
          subtitle={`近 ${dashboard.window_days} 天 · UTC 自然日`}
          onClose={() => setPanel(null)}
        >
          {panel === "health" && (
            <>
              <HealthTree items={dashboard.health_tree} />
              <p className="mv-ops-definition">
                父级与每个子项各有自己的状态，不按最严重子项自动上卷。待支付或禁用账户会触发关注，但不能据此判断支付故障或违规。这里不监测服务是否在线。
              </p>
            </>
          )}
          {panel === "definitions" && <Definitions dashboard={dashboard} />}
          {panel === "daily" && (
            <>
              <p className="mv-ops-definition">
                任务按创建日；充值按支付日，缺失支付时间时回退创建日。两条轨道使用各自纵轴。
              </p>
              <DailyData dashboard={dashboard} />
            </>
          )}
          {panel === "domains" && (
            <>
              <ul className="mv-ops-domains">
                {dashboard.domain_distribution.map((item) => (
                  <li key={item.id}>
                    <span>{item.label}</span>
                    <span className="mv-ops-domains__track">
                      <i
                        style={{
                          width: `${(item.count / Math.max(1, ...dashboard.domain_distribution.map((point) => point.count))) * 100}%`,
                        }}
                      />
                    </span>
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
              <p className="mv-ops-definition">
                学科取自持久化的 Playbook
                元数据，缺失为未识别；失败或进行中的任务可能尚无内容。未识别不能归为某门学科。
              </p>
            </>
          )}
        </OpsDialog>
      )}
    </div>
  );
}

function MetricDelta({ metric }: { metric: OpsMetricCard | undefined }) {
  return (
    <span className="mv-ops-delta" data-trend={metric?.trend ?? "neutral"}>
      {metric?.delta_percent == null
        ? "暂无环比"
        : `较前窗 ${metric.delta_percent > 0 ? "+" : ""}${metric.delta_percent}%`}
    </span>
  );
}
function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className="mv-ops-status"
      data-tone={statusTone(status)}
      data-status={status}
    >
      <i aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

function RecentRecords({
  dashboard,
  tab,
  filter,
  onFilter,
}: {
  dashboard: OpsDashboardResponse;
  tab: RecordTab;
  filter: string;
  onFilter: (filter: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const reducedMotion = usePrefersReducedMotion();
  const source: Array<OpsRunRow | OpsOrderRow> =
    tab === "runs" ? dashboard.recent_runs : dashboard.recent_orders;
  const rows = source.filter(
    (row) =>
      filter === "all" ||
      (filter === "in_flight"
        ? ["queued", "running", "reviewing"].includes(row.status)
        : row.status === filter),
  );
  const filters =
    tab === "runs"
      ? [
          ["all", "全部"],
          ["failed", "失败"],
          ["in_flight", "进行中"],
        ]
      : [
          ["all", "全部"],
          ["pending", "待支付"],
          ["paid", "已支付"],
        ];
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const currentPage = Math.min(page, pages);
  const visible = rows.slice((currentPage - 1) * 10, currentPage * 10);
  return (
    <>
      <div className="mv-ops-records__filters">
        <div>
          {filters.map(([value, label]) => (
            <Button
              key={value}
              size="small"
              variant={filter === value ? "contained" : "text"}
              aria-pressed={filter === value}
              onClick={() => onFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <p role="status">
          已载 {source.length} 条 · 最多 50 条
          {filter !== "all" && ` · 匹配 ${rows.length} 条`}
        </p>
      </div>
      <div className="mv-ops-record-grid" aria-hidden="true">
        <span>{tab === "runs" ? "任务 / ID" : "订单 / 渠道"}</span>
        <span>状态</span>
        <span>{tab === "runs" ? "学科" : "金额"}</span>
        <span>创建时间 · UTC</span>
        <span />
      </div>
      {visible.map((row) => {
        const run = "run_id" in row ? row : null;
        const order = "order_id" in row ? row : null;
        const id = run?.run_id ?? order!.order_id;
        const open = expanded === id;
        return (
          <article
            key={id}
            className={`mv-ops-record${open ? " is-open" : ""}`}
            data-status={row.status}
          >
            <div className="mv-ops-record-grid">
              <div className="mv-ops-record__object">
                <strong>
                  {run ? run.title || run.prompt || "未命名任务" : id}
                </strong>
                <small>{run ? id : order!.channel}</small>
              </div>
              <StatusBadge status={row.status} />
              <span className="mv-ops-record__context">
                {run ? domainLabel(run.domain) : money(order!.amount_cents)}
              </span>
              <time dateTime={row.created_at}>{formatUtc(row.created_at)}</time>
              <Button
                size="small"
                variant={open ? "contained" : "outlined"}
                aria-expanded={open}
                aria-controls={`ops-record-${id}`}
                onClick={() => setExpanded(open ? null : id)}
              >
                {open ? "收起" : "核查"}
              </Button>
            </div>
            <Collapse
              in={open}
              timeout={reducedMotion ? 0 : OPS_MOTION.panel}
              unmountOnExit
            >
              <div id={`ops-record-${id}`} className="mv-ops-record-detail">
                <h3>{run ? "任务核查" : "订单核查"}</h3>
                <dl>
                  {run ? (
                    <>
                      <dt>原始输入</dt>
                      <dd>{run.prompt || "—"}</dd>
                      <dt>错误记录</dt>
                      <dd>{run.error || "— 未记录错误"}</dd>
                    </>
                  ) : (
                    <>
                      <dt>支付时间</dt>
                      <dd>
                        {order!.paid_at ? formatUtc(order!.paid_at) : "—"}
                      </dd>
                      <dt>渠道</dt>
                      <dd>{order!.channel}</dd>
                      <dt>金额</dt>
                      <dd>{money(order!.amount_cents)}</dd>
                    </>
                  )}
                  <dt>完整 ID</dt>
                  <dd className="mv-ops-mono">{id}</dd>
                  <dt>原始状态</dt>
                  <dd className="mv-ops-mono">{row.status}</dd>
                </dl>
              </div>
            </Collapse>
          </article>
        );
      })}
      {!visible.length && (
        <p className="mv-ops-empty">
          {source.length
            ? "已载最近记录中没有匹配项，窗口聚合不受此筛选影响。"
            : tab === "runs"
              ? "暂无任务记录"
              : "暂无订单记录"}
        </p>
      )}
      <div className="mv-ops-records__foot">
        <span>筛选只作用已载记录，不代表窗口内全部记录。</span>
        <div>
          <Button
            size="small"
            disabled={currentPage === 1}
            onClick={() => {
              setPage(currentPage - 1);
              setExpanded(null);
            }}
            aria-label="最近记录上一页"
          >
            上一页
          </Button>
          <span>
            {currentPage} / {pages}
          </span>
          <Button
            size="small"
            disabled={currentPage === pages}
            onClick={() => {
              setPage(currentPage + 1);
              setExpanded(null);
            }}
            aria-label="最近记录下一页"
          >
            下一页
          </Button>
        </div>
      </div>
    </>
  );
}

function HealthTree({ items }: { items: OpsHealthTreeItem[] }) {
  if (!items.length) return <p className="mv-ops-empty">暂无规则检查结果</p>;
  return (
    <ul className="mv-ops-health-tree">
      {items.map((item) => (
        <li
          key={item.id}
          data-health-id={item.id}
          data-health-status={item.status}
        >
          <div>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small data-tone={statusTone(item.status)}>
              {healthLabel(item.status)} · {item.status}
            </small>
          </div>
          {item.children.length > 0 && <HealthTree items={item.children} />}
        </li>
      ))}
    </ul>
  );
}

function Definitions({ dashboard }: { dashboard: OpsDashboardResponse }) {
  return (
    <>
      <dl className="mv-ops-definitions">
        <dt>窗口与最近记录</dt>
        <dd>
          统计覆盖近 {dashboard.window_days} 个 UTC 自然日，含当天。最近任务 /
          订单是全站按创建时间倒序返回的至多 50
          条记录，独立于窗口，不能当作完整历史。
        </dd>
        <dt>充值收入</dt>
        <dd>仅已支付订单，按支付时间统计；支付时间缺失时回退创建时间。</dd>
        <dt>生成消耗 / 退款回补</dt>
        <dd>
          分别读取 consume / refund 账本汇总，不由任务 /
          失败数推算。消耗不是供应商成本，回补另计，不据此计算利润。
        </dd>
        <dt>未消费余额</dt>
        <dd>全站账户当前余额汇总，不随统计窗口裁剪。</dd>
        <dt>成功率</dt>
        <dd>仅成功 / 失败终态进入分母，排队 / 生成中 / 审核中不参与。</dd>
        <dt>环比</dt>
        <dd>
          任务、充值和消耗对比前一等长窗口。用户指标的 delta
          是窗口新增相对此前存量，不能当作前窗用户增幅。
        </dd>
      </dl>
      <div className="mv-ops-metric-notes">
        {dashboard.kpis.map((metric) => (
          <p key={metric.id}>
            <strong>
              {metric.label} {metric.value}
            </strong>
            <span>{metric.helper}</span>
            {metric.delta_percent != null && (
              <small>
                原始变化值 {metric.delta_percent > 0 ? "+" : ""}
                {metric.delta_percent}%
              </small>
            )}
          </p>
        ))}
      </div>
    </>
  );
}

function AccountsSection() {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { accounts, isLoading, error, refresh } = useOpsAccounts({
    search,
    page,
    pageSize,
  });
  const commitSearch = () => {
    const term = searchDraft.trim();
    if (term !== search) {
      setSearch(term);
      setPage(1);
    }
  };
  return (
    <section aria-label="账户列表" aria-busy={isLoading}>
      <div className="mv-ops-accounts-toolbar">
        <TextField
          size="small"
          label="昵称 / 用户 ID"
          placeholder="回车确认搜索"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitSearch();
          }}
          onBlur={commitSearch}
          slotProps={{
            htmlInput: { "aria-label": "搜索账户", maxLength: 100 },
          }}
        />
        <Button onClick={commitSearch} variant="outlined">
          查询
        </Button>
        <span>{accounts ? `共 ${accounts.total} 个账户` : "加载账户…"}</span>
      </div>
      {error && accounts && <ErrorBanner error={error} onRefresh={refresh} />}
      {error && !accounts ? (
        <StatePanel title="加载失败" description={error}>
          <Button onClick={refresh}>重试</Button>
        </StatePanel>
      ) : (
        <>
          <div className="mv-ops-account-head" aria-hidden="true">
            <span>账户</span>
            <span>登录方式</span>
            <span>状态 / 角色</span>
            <span>余额</span>
            <span>注册 / 最近登录 · UTC</span>
          </div>
          {accounts?.items.map((account) => (
            <article className="mv-ops-account-row" key={account.user_id}>
              <div>
                <strong>{account.display_name}</strong>
                <small className="mv-ops-mono">{account.user_id}</small>
              </div>
              <span>
                {account.login_provider === "wechat"
                  ? "微信"
                  : account.login_provider === "guest"
                    ? "游客"
                    : account.login_provider}
              </span>
              <div>
                <StatusBadge status={account.status} />
                <small>
                  {account.role === "admin"
                    ? "管理员"
                    : account.role === "user"
                      ? "用户"
                      : account.role}
                </small>
              </div>
              <strong>¥ {account.balance_yuan}</strong>
              <div>
                <time dateTime={account.created_at}>
                  {formatUtc(account.created_at)}
                </time>
                <small>
                  最近登录{" "}
                  {account.last_active_at
                    ? formatUtc(account.last_active_at)
                    : "—"}
                </small>
              </div>
            </article>
          ))}
          {isLoading && !accounts && (
            <p className="mv-ops-empty" role="status">
              加载账户…
            </p>
          )}
          {accounts && !accounts.items.length && (
            <p className="mv-ops-empty">暂无账户记录</p>
          )}
          <div className="mv-ops-account-pagination">
            <label>
              每页{" "}
              <select
                aria-label="每页账户数"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {[10, 20, 50].map((size) => (
                  <option value={size} key={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <Button
                onClick={() => setPage(page - 1)}
                disabled={page === 1 || isLoading}
                aria-label="上一页"
              >
                上一页
              </Button>
              <span>{accounts?.page ?? page}</span>
              <Button
                onClick={() => setPage(page + 1)}
                disabled={
                  isLoading || !accounts || page * pageSize >= accounts.total
                }
                aria-label="下一页"
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      )}
      <p className="mv-ops-definition">
        最近登录来自登录或会话记录，不等同于窗口内的生成活跃。
      </p>
    </section>
  );
}

function OpsDialog({
  title,
  subtitle,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth={wide ? "lg" : "md"}
      className="mv-ops-dialog"
      style={OPS_THEME_VARS}
      transitionDuration={reducedMotion ? 0 : OPS_MOTION.panel}
      aria-labelledby="ops-dialog-title"
    >
      <header className="mv-ops-dialog__header">
        <div>
          <h2 id="ops-dialog-title">{title}</h2>
          <p>{subtitle}</p>
        </div>
        <IconButton onClick={onClose} aria-label={`关闭${title}`}>
          <CloseIcon />
        </IconButton>
      </header>
      <DialogContent>
        <div className="mv-ops-dialog__body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
function StatePanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="mv-ops-state-panel" role="status">
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </section>
  );
}
function PermissionPanel({ onRequireLogin }: { onRequireLogin?: () => void }) {
  return (
    <StatePanel
      title="需要管理员权限"
      description="仅运营版启用状态的绑定管理员可查看全站数据。请使用绑定的微信账户登录。"
    >
      {onRequireLogin && (
        <Button variant="contained" onClick={onRequireLogin}>
          微信登录
        </Button>
      )}
    </StatePanel>
  );
}
function ErrorBanner({
  error,
  onRefresh,
}: {
  error: string;
  onRefresh: () => void;
}) {
  return (
    <div className="mv-ops-error-banner" role="alert">
      <p>刷新失败，当前仍显示上次成功数据：{error}</p>
      <Button size="small" variant="outlined" onClick={onRefresh}>
        重试
      </Button>
    </div>
  );
}
