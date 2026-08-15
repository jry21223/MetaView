import React, { useMemo, useState } from "react";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import DashboardIcon from "@mui/icons-material/Dashboard";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import MenuIcon from "@mui/icons-material/Menu";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { ThemeProvider } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { zhCN as dataGridZhCN } from "@mui/x-data-grid/locales";
import {
  BarChart,
  LineChart,
  PieChart,
} from "@mui/x-charts";

import {
  useOpsDashboard,
  type OpsDashboardResponse,
  type OpsDashboardWindowDays,
  type OpsHealthStatus,
  type OpsHealthTreeItem,
  type OpsMetricCard,
  type OpsOrderRow,
  type OpsRunRow,
} from "../../features/ops-dashboard";
import { usePrefersReducedMotion } from "../../shared/hooks/usePrefersReducedMotion";
import { OPS_THEME_VARS, opsDashboardTheme } from "./opsDashboardTheme";

const windowOptions: OpsDashboardWindowDays[] = [7, 30, 90];
const dataGridLocaleText = dataGridZhCN.components.MuiDataGrid.defaultProps.localeText;

/**
 * Admin destinations of the `/admin` surface. Kept local to the admin shell
 * area on purpose: these are NOT user shell stages and must not join the
 * shared Stage type used by the public GlobalTopbar navigation.
 */
export type AdminSection = "overview" | "accounts" | "runs" | "health";

interface OpsDashboardPageProps {
  accountName?: string | null;
  accountBalanceYuan?: string | null;
  accountAvatarUrl?: string | null;
  onOpenProviderSettings?: () => void;
  /** When provided, the permission panel renders a primary WeChat login CTA that invokes it. */
  onRequireLogin?: () => void;
}

type TableTab = "runs" | "orders";
type StatusTone = "positive" | "negative" | "warning" | "neutral";

interface RunTableRow {
  id: string;
  title: string;
  status: string;
  domain: string;
  createdAt: string;
}

interface OrderTableRow {
  id: string;
  order: string;
  amount: string;
  status: string;
  createdAt: string;
}

export function OpsDashboardPage({
  accountName,
  accountBalanceYuan,
  accountAvatarUrl,
  onOpenProviderSettings,
  onRequireLogin,
}: OpsDashboardPageProps) {
  const [windowDays, setWindowDays] = useState<OpsDashboardWindowDays>(30);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tableTab, setTableTab] = useState<TableTab>("runs");
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const { dashboard, isLoading, error, errorStatus, refresh } =
    useOpsDashboard(windowDays);
  const isPermissionError = errorStatus === 403;

  const handleSelectSection = (section: AdminSection) => {
    setActiveSection(section);
    setMobileOpen(false);
  };

  const drawer = (
    <SideMenu
      accountName={accountName}
      accountBalanceYuan={accountBalanceYuan}
      accountAvatarUrl={accountAvatarUrl}
      activeSection={activeSection}
      onSelectSection={handleSelectSection}
      onOpenProviderSettings={onOpenProviderSettings}
    />
  );

  return (
    <ThemeProvider theme={opsDashboardTheme}>
      <Box
        className="mv-root mv-light mv-theme-light mv-density-compact mv-ops-dashboard"
        style={OPS_THEME_VARS}
      >
        <Box component="nav" className="mv-ops-nav-desktop" aria-label="运营导航">
          <Drawer
            variant="permanent"
            open
            slotProps={{
              paper: { className: "mv-ops-sidebar", style: OPS_THEME_VARS },
            }}
          >
            {drawer}
          </Drawer>
        </Box>

        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          slotProps={{
            paper: { className: "mv-ops-sidebar", style: OPS_THEME_VARS },
          }}
        >
          {drawer}
        </Drawer>

        <Box component="main" className="mv-ops-main">
          <MobileHeader onOpenMenu={() => setMobileOpen(true)} />
          <div className="mv-ops-content" aria-busy={isLoading}>
            {isPermissionError ? (
              <PermissionPanel onRequireLogin={onRequireLogin} />
            ) : activeSection === "overview" ? (
              <>
                <Header
                  windowDays={windowDays}
                  generatedAt={dashboard?.generated_at ?? null}
                  onWindowChange={(_, value) => {
                    if (value !== null) setWindowDays(value);
                  }}
                  onRefresh={refresh}
                  isLoading={isLoading}
                />
                {isLoading && !dashboard && <LoadingPanel />}
                {error && dashboard && <ErrorBanner error={error} onRefresh={refresh} />}
                {error && !dashboard && <ErrorPanel error={error} onRefresh={refresh} />}
                {dashboard && (
                  <DashboardContent
                    dashboard={dashboard}
                    tableTab={tableTab}
                    onTableTabChange={setTableTab}
                  />
                )}
              </>
            ) : (
              <SectionPlaceholder section={activeSection} />
            )}
          </div>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function MobileHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="mv-ops-mobile-header">
      <IconButton
        className="mv-ops-mobile-header__menu"
        aria-label="打开运营导航"
        onClick={onOpenMenu}
      >
        <MenuIcon fontSize="small" />
      </IconButton>
      <img
        className="mv-ops-mobile-header__mark"
        src="/brand/metaview-mark.svg"
        alt=""
      />
      <span className="mv-ops-mobile-header__title">MetaView 运营</span>
    </header>
  );
}

function Header({
  windowDays,
  generatedAt,
  onWindowChange,
  onRefresh,
  isLoading,
}: {
  windowDays: OpsDashboardWindowDays;
  generatedAt: string | null;
  onWindowChange: (
    event: React.MouseEvent<HTMLElement>,
    value: OpsDashboardWindowDays | null,
  ) => void;
  onRefresh: () => void;
  isLoading: boolean;
}) {
  return (
    <header className="mv-ops-page-header">
      <div className="mv-ops-page-header__copy">
        <span className="mv-ops-eyebrow">OPS / 全局运营</span>
        <h1 className="mv-ops-page-title">运营总览</h1>
        <p className="mv-ops-page-summary">
          <span>任务、收入、账户与平台状态</span>
          <span className="mv-ops-sync-time" aria-live="polite">
            最近同步：
            {generatedAt ? (
              <time dateTime={generatedAt}>{formatDateTime(generatedAt)}</time>
            ) : (
              "等待同步"
            )}
          </span>
        </p>
      </div>

      <div className="mv-ops-header-actions">
        <ToggleButtonGroup
          className="mv-ops-window-toggle"
          exclusive
          size="small"
          value={windowDays}
          onChange={onWindowChange}
          aria-label="运营统计窗口"
        >
          {windowOptions.map((days) => (
            <ToggleButton key={days} value={days} aria-label={`${days} 天`}>
              {days} 天
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Button
          className="mv-ops-refresh"
          variant="outlined"
          size="small"
          startIcon={
            <RefreshIcon
              className={`mv-ops-refresh__icon${isLoading ? " is-spinning" : ""}`}
              fontSize="small"
            />
          }
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="刷新运营数据"
        >
          <span className="mv-ops-refresh__label">刷新</span>
        </Button>
      </div>
    </header>
  );
}

function DashboardContent({
  dashboard,
  tableTab,
  onTableTabChange,
}: {
  dashboard: OpsDashboardResponse;
  tableTab: TableTab;
  onTableTabChange: (tab: TableTab) => void;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const runLabels = dashboard.run_trend.map((point) => shortDate(point.date));
  const revenueLabels = dashboard.revenue_trend.map((point) => shortDate(point.date));
  const runRows = useMemo(
    () => dashboard.recent_runs.map(runTableRow),
    [dashboard.recent_runs],
  );
  const orderRows = useMemo(
    () => dashboard.recent_orders.map(orderTableRow),
    [dashboard.recent_orders],
  );
  const paidOrders = dashboard.revenue_trend.reduce(
    (total, point) => total + point.paid_orders,
    0,
  );
  const revenueValue =
    dashboard.kpis.find((metric) => metric.id === "revenue")?.value ?? "¥ 0.00";

  return (
    <>
      <section className="mv-ops-kpi-rail" aria-label="核心运营指标">
        {dashboard.kpis.map((metric) => (
          <MetricPanel key={metric.id} metric={metric} />
        ))}
      </section>

      <div className="mv-ops-analytics-grid">
        <Panel
          title="任务趋势"
          subtitle={`近 ${dashboard.window_days} 天生成状态`}
          action={<RunTrendLegend />}
        >
          <div role="img" aria-label={`近 ${dashboard.window_days} 天任务趋势图`}>
            <LineChart
              height={306}
              margin={{ top: 18, right: 18, bottom: 30, left: 12 }}
              xAxis={[
                {
                  scaleType: "point",
                  data: runLabels,
                  tickLabelStyle: { fontSize: 10, fill: "var(--ink-3)" },
                },
              ]}
              yAxis={[
                {
                  width: 38,
                  tickLabelStyle: { fontSize: 10, fill: "var(--ink-3)" },
                },
              ]}
              grid={{ horizontal: true }}
              hideLegend
              skipAnimation={prefersReducedMotion}
              series={[
                {
                  data: dashboard.run_trend.map((point) => point.total),
                  label: "全部任务",
                  color: "var(--accent)",
                  curve: "monotoneX",
                  showMark: false,
                },
                {
                  data: dashboard.run_trend.map((point) => point.succeeded),
                  label: "完成",
                  color: "var(--mv-ops-positive)",
                  curve: "monotoneX",
                  showMark: false,
                },
                {
                  data: dashboard.run_trend.map((point) => point.failed),
                  label: "失败",
                  color: "var(--mv-ops-negative)",
                  curve: "monotoneX",
                  showMark: false,
                },
                {
                  data: dashboard.run_trend.map((point) => point.in_flight),
                  label: "进行中",
                  color: "var(--warn)",
                  curve: "monotoneX",
                  showMark: false,
                },
              ]}
            />
          </div>
        </Panel>

        <Panel title="收入趋势" subtitle="按支付完成时间统计">
          <div className="mv-ops-revenue-summary" aria-label="收入摘要">
            <div className="mv-ops-revenue-stat">
              <span className="mv-ops-revenue-stat__label">窗口收入</span>
              <strong className="mv-ops-revenue-stat__value">{revenueValue}</strong>
            </div>
            <div className="mv-ops-revenue-stat">
              <span className="mv-ops-revenue-stat__label">已支付订单</span>
              <strong className="mv-ops-revenue-stat__value">{paidOrders}</strong>
            </div>
          </div>
          <div role="img" aria-label={`近 ${dashboard.window_days} 天充值收入趋势图`}>
            <BarChart
              height={242}
              margin={{ top: 18, right: 12, bottom: 30, left: 10 }}
              xAxis={[
                {
                  scaleType: "band",
                  data: revenueLabels,
                  tickLabelStyle: { fontSize: 10, fill: "var(--ink-3)" },
                },
              ]}
              yAxis={[
                {
                  width: 48,
                  tickLabelStyle: { fontSize: 10, fill: "var(--ink-3)" },
                  valueFormatter: (value: number) => `¥${value}`,
                },
              ]}
              grid={{ horizontal: true }}
              hideLegend
              skipAnimation={prefersReducedMotion}
              series={[
                {
                  data: dashboard.revenue_trend.map((point) =>
                    Number((point.revenue_cents / 100).toFixed(2)),
                  ),
                  label: "充值收入",
                  color: "var(--accent)",
                  valueFormatter: (value) => `¥ ${Number(value ?? 0).toFixed(2)}`,
                },
              ]}
            />
          </div>
        </Panel>
      </div>

      <div className="mv-ops-activity-grid">
        <Panel
          title={tableTab === "runs" ? "最近任务" : "最近订单"}
          subtitle="全站最新记录，按创建时间倒序"
          action={
            <Tabs
              className="mv-ops-tabs"
              value={tableTab}
              onChange={(_, value: TableTab) => onTableTabChange(value)}
              aria-label="运营明细表"
            >
              <Tab value="runs" label="任务" />
              <Tab value="orders" label="订单" />
            </Tabs>
          }
          flush
        >
          <div className="mv-ops-table">
            {tableTab === "runs" ? (
              <DataGrid
                rows={runRows}
                columns={runColumns}
                getRowClassName={({ row }) =>
                  row.status === "failed" ? "is-failed" : ""
                }
                density="compact"
                initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                pageSizeOptions={[10, 20, 50]}
                disableColumnMenu
                disableRowSelectionOnClick
                rowHeight={42}
                columnHeaderHeight={42}
                localeText={{ ...dataGridLocaleText, noRowsLabel: "暂无任务记录" }}
              />
            ) : (
              <DataGrid
                rows={orderRows}
                columns={orderColumns}
                getRowClassName={({ row }) =>
                  row.status === "pending" ? "is-pending" : ""
                }
                density="compact"
                initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                pageSizeOptions={[10, 20, 50]}
                disableColumnMenu
                disableRowSelectionOnClick
                rowHeight={42}
                columnHeaderHeight={42}
                localeText={{ ...dataGridLocaleText, noRowsLabel: "暂无订单记录" }}
              />
            )}
          </div>
        </Panel>

        <div className="mv-ops-side-stack">
          <HealthPanel items={dashboard.health_tree} />
          <TaskStructurePanel
            statusDistribution={dashboard.status_distribution}
            domainDistribution={dashboard.domain_distribution}
            skipAnimation={prefersReducedMotion}
          />
        </div>
      </div>
    </>
  );
}

function MetricPanel({
  metric,
}: {
  metric: OpsMetricCard;
}) {
  const deltaLabel =
    metric.delta_percent == null
      ? "—"
      : `${metric.delta_percent > 0 ? "+" : ""}${metric.delta_percent}%`;
  return (
    <article className="mv-ops-metric">
      <div className="mv-ops-metric__topline">
        <span className="mv-ops-metric__label">{metric.label}</span>
        <Chip
          className="mv-ops-delta"
          size="small"
          label={deltaLabel}
          data-trend={metric.trend}
          aria-label={
            metric.delta_percent == null ? "暂无环比" : `较前一窗口 ${deltaLabel}`
          }
        />
      </div>
      <div className="mv-ops-metric__value">{metric.value}</div>
      <div className="mv-ops-metric__helper">{metric.helper}</div>
      {metric.data.length > 0 ? (
        <MetricSparkline values={metric.data} />
      ) : (
        <div className="mv-ops-sparkline mv-ops-sparkline--empty" aria-hidden="true" />
      )}
    </article>
  );
}

function MetricSparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="mv-ops-sparkline" aria-hidden="true">
      {values.map((value, index) => (
        <span
          key={`${index}-${value}`}
          className="mv-ops-sparkline__bar"
          data-latest={index === values.length - 1 ? "true" : undefined}
          style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function RunTrendLegend() {
  const items: Array<{ label: string; tone: string }> = [
    { label: "全部", tone: "total" },
    { label: "完成", tone: "positive" },
    { label: "失败", tone: "negative" },
    { label: "进行中", tone: "warning" },
  ];
  return (
    <div className="mv-ops-chart-legend" aria-label="任务趋势图例">
      {items.map((item) => (
        <span key={item.label} className="mv-ops-chart-legend__item">
          <span
            className="mv-ops-chart-legend__swatch"
            data-tone={item.tone}
            aria-hidden="true"
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
  flush = false,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <Paper component="section" variant="outlined" className="mv-ops-panel">
      <header className="mv-ops-panel__header">
        <div>
          <h2 className="mv-ops-panel__title">{title}</h2>
          <span className="mv-ops-panel__subtitle">{subtitle}</span>
        </div>
        {action}
      </header>
      <div
        className={`mv-ops-panel__body${flush ? " mv-ops-panel__body--flush" : ""}`}
      >
        {children}
      </div>
    </Paper>
  );
}

function TaskStructurePanel({
  statusDistribution,
  domainDistribution,
  skipAnimation,
}: {
  statusDistribution: OpsDashboardResponse["status_distribution"];
  domainDistribution: OpsDashboardResponse["domain_distribution"];
  skipAnimation: boolean;
}) {
  const statusTotal = statusDistribution.reduce((total, item) => total + item.count, 0);
  const maxDomainCount = Math.max(...domainDistribution.map((item) => item.count), 1);

  return (
    <Panel title="任务结构" subtitle="状态与学科分布">
      <div className="mv-ops-structure">
        {statusTotal > 0 ? (
          <div className="mv-ops-status-layout">
            <div className="mv-ops-donut" aria-hidden="true">
              <PieChart
                height={132}
                hideLegend
                skipAnimation={skipAnimation}
                margin={0}
                series={[
                  {
                    data: statusDistribution.map((item) => ({
                      id: item.id,
                      value: item.count,
                      label: item.label,
                      color: statusColor(item.id),
                    })),
                    innerRadius: 45,
                    outerRadius: 59,
                    paddingAngle: 2,
                    cornerRadius: 2,
                  },
                ]}
              />
              <div className="mv-ops-donut__center">
                <strong className="mv-ops-donut__value">{statusTotal}</strong>
                <span className="mv-ops-donut__label">窗口任务</span>
              </div>
            </div>
            <ul className="mv-ops-status-list" aria-label="任务状态分布">
              {statusDistribution.map((item) => (
                <li key={item.id} className="mv-ops-status-list__item">
                  <span
                    className="mv-ops-status-dot"
                    data-tone={statusTone(item.id)}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                  <strong className="mv-ops-status-list__count">{item.count}</strong>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mv-ops-empty-inline">窗口内暂无任务</div>
        )}

        <div>
          <span className="mv-ops-section-label">学科分布</span>
          {domainDistribution.length > 0 ? (
            <ul className="mv-ops-domain-list">
              {domainDistribution.map((item) => (
                <li key={item.id} className="mv-ops-domain-row">
                  <span>{item.label}</span>
                  <span className="mv-ops-domain-track" aria-hidden="true">
                    <span
                      className="mv-ops-domain-fill"
                      style={{ width: `${(item.count / maxDomainCount) * 100}%` }}
                    />
                  </span>
                  <strong className="mv-ops-domain-count">{item.count}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mv-ops-empty-inline">暂无学科数据</div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function HealthPanel({ items }: { items: OpsHealthTreeItem[] }) {
  return (
    <Panel title="运行健康" subtitle="任务、计费与账户检查">
      {items.length > 0 ? (
        <ul className="mv-ops-health-list">
          {items.map((item) => (
            <li key={item.id} className="mv-ops-health-group">
              <HealthRow item={item} group />
              {item.children.length > 0 && (
                <ul className="mv-ops-health-children">
                  {item.children.map((child) => (
                    <li key={child.id}>
                      <HealthRow item={child} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mv-ops-empty-inline">暂无健康检查结果</div>
      )}
    </Panel>
  );
}

function HealthRow({ item, group = false }: { item: OpsHealthTreeItem; group?: boolean }) {
  const tone = healthTone(item.status);
  return (
    <div className={`mv-ops-health-row${group ? " mv-ops-health-row--group" : ""}`}>
      <span className="mv-ops-status-dot" data-tone={tone} aria-hidden="true" />
      <span>{item.label}</span>
      <strong className="mv-ops-health-value">{item.value}</strong>
      <span className="mv-ops-health-state" data-tone={tone}>
        {healthStatusLabel(item.status)}
      </span>
    </div>
  );
}

interface SideMenuProps {
  accountName?: string | null;
  accountBalanceYuan?: string | null;
  accountAvatarUrl?: string | null;
  activeSection: AdminSection;
  onSelectSection: (section: AdminSection) => void;
  onOpenProviderSettings?: () => void;
}

function SideMenu({
  accountName,
  accountBalanceYuan,
  accountAvatarUrl,
  activeSection,
  onSelectSection,
  onOpenProviderSettings,
}: SideMenuProps) {
  const navItems: Array<{ section: AdminSection; label: string; icon: React.ReactNode }> = [
    { section: "overview", label: "运营总览", icon: <DashboardIcon /> },
    { section: "accounts", label: "账户", icon: <AccountCircleIcon /> },
    { section: "runs", label: "任务审计", icon: <FactCheckIcon /> },
    { section: "health", label: "平台状态", icon: <MonitorHeartIcon /> },
  ];

  return (
    <div className="mv-ops-sidebar-inner">
      <div className="mv-ops-brand">
        <img className="mv-ops-brand__mark" src="/brand/metaview-mark.svg" alt="" />
        <div>
          <p className="mv-ops-brand__name">MetaView</p>
          <span className="mv-ops-brand__meta">OPERATIONS</span>
        </div>
      </div>
      <Divider />
      <span className="mv-ops-nav-label">Admin</span>
      <List className="mv-ops-nav-list">
        {navItems.map((item) => (
          <ListItemButton
            key={item.section}
            className="mv-ops-nav-item"
            selected={item.section === activeSection}
            aria-current={item.section === activeSection ? "page" : undefined}
            onClick={() => onSelectSection(item.section)}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      <div className="mv-ops-account">
        <Avatar
          className="mv-ops-account__avatar"
          src={accountAvatarUrl ?? undefined}
          alt={accountAvatarUrl ? `${accountName ?? "管理员"}头像` : ""}
          slotProps={{ img: { referrerPolicy: "no-referrer" } }}
        >
          {(accountName ?? "管理员").slice(0, 1)}
        </Avatar>
        <div>
          <div className="mv-ops-account__name">{accountName ?? "管理员"}</div>
          <div className="mv-ops-account__meta">
            {accountBalanceYuan ? `余额 ¥ ${accountBalanceYuan}` : "ADMIN ACCESS"}
          </div>
        </div>
        {onOpenProviderSettings && (
          <IconButton
            className="mv-ops-account__action"
            size="small"
            aria-label="账户与充值"
            onClick={onOpenProviderSettings}
          >
            <ReceiptLongIcon fontSize="small" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

const PLACEHOLDER_SECTIONS: Record<
  Exclude<AdminSection, "overview">,
  { title: string; description: string }
> = {
  accounts: {
    title: "账户",
    description: "账户与充值视图将在 #232 落地。",
  },
  runs: {
    title: "任务审计",
    description: "全站任务审计视图尚未落地。",
  },
  health: {
    title: "平台状态",
    description: "平台服务与依赖健康状态视图尚未落地。",
  },
};

/**
 * Minimal placeholder for admin sections whose real views ship in later
 * tickets. The account view is #232's job — nothing more than this belongs
 * in the admin shell yet.
 */
function SectionPlaceholder({ section }: { section: Exclude<AdminSection, "overview"> }) {
  const content = PLACEHOLDER_SECTIONS[section];
  return (
    <Paper component="section" variant="outlined" className="mv-ops-state-panel">
      <div className="mv-ops-state-panel__content">
        <h2 className="mv-ops-state-panel__title">{content.title}</h2>
        <p className="mv-ops-state-panel__body">{content.description}</p>
      </div>
    </Paper>
  );
}

function LoadingPanel() {
  return (
    <Paper
      component="section"
      variant="outlined"
      className="mv-ops-state-panel"
      role="status"
      aria-live="polite"
    >
      <div className="mv-ops-state-panel__content">
        <CircularProgress size={26} />
        <h2 className="mv-ops-state-panel__title">同步运营数据</h2>
        <p className="mv-ops-state-panel__body">正在汇总最近窗口的任务与计费状态。</p>
      </div>
    </Paper>
  );
}

function PermissionPanel({ onRequireLogin }: { onRequireLogin?: () => void }) {
  return (
    <Paper component="section" variant="outlined" className="mv-ops-state-panel">
      <div className="mv-ops-state-panel__content">
        <WarningAmberIcon className="mv-ops-state-panel__icon" />
        <h2 className="mv-ops-state-panel__title">需要管理员权限</h2>
        <p className="mv-ops-state-panel__body">
          当前会话不是启用状态的 admin 账户，无法查看全站运营数据。
        </p>
        {onRequireLogin && (
          <Button variant="contained" onClick={onRequireLogin}>
            微信登录
          </Button>
        )}
      </div>
    </Paper>
  );
}

function ErrorPanel({ error, onRefresh }: { error: string; onRefresh: () => void }) {
  return (
    <Paper component="section" variant="outlined" className="mv-ops-state-panel">
      <div className="mv-ops-state-panel__content">
        <h2 className="mv-ops-state-panel__title">加载失败</h2>
        <p className="mv-ops-state-panel__body">{error}</p>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRefresh}>
          重新加载
        </Button>
      </div>
    </Paper>
  );
}

function ErrorBanner({ error, onRefresh }: { error: string; onRefresh: () => void }) {
  return (
    <div className="mv-ops-error-banner" role="alert">
      <p>刷新失败，当前仍显示上次成功数据：{error}</p>
      <Button size="small" variant="outlined" onClick={onRefresh}>
        重试
      </Button>
    </div>
  );
}

const runColumns: GridColDef<RunTableRow>[] = [
  { field: "title", headerName: "任务", flex: 1.25, minWidth: 180 },
  {
    field: "status",
    headerName: "状态",
    width: 100,
    renderCell: ({ value }) => <StatusChip status={String(value)} kind="run" />,
  },
  { field: "domain", headerName: "学科", width: 100 },
  { field: "createdAt", headerName: "创建时间", width: 142 },
];

const orderColumns: GridColDef<OrderTableRow>[] = [
  {
    field: "order",
    headerName: "订单",
    flex: 1,
    minWidth: 170,
    cellClassName: "mv-ops-id-cell",
  },
  { field: "amount", headerName: "金额", width: 112 },
  {
    field: "status",
    headerName: "状态",
    width: 100,
    renderCell: ({ value }) => <StatusChip status={String(value)} kind="order" />,
  },
  { field: "createdAt", headerName: "创建时间", width: 142 },
];

function StatusChip({ status, kind }: { status: string; kind: "run" | "order" }) {
  return (
    <Chip
      className="mv-ops-status"
      size="small"
      label={kind === "run" ? statusLabel(status) : orderStatusLabel(status)}
      data-tone={statusTone(status)}
    />
  );
}

function runTableRow(row: OpsRunRow): RunTableRow {
  return {
    id: row.run_id,
    title: row.title || row.prompt || "未命名任务",
    status: row.status,
    domain: row.domain ?? "未识别",
    createdAt: formatDateTime(row.created_at),
  };
}

function orderTableRow(row: OpsOrderRow): OrderTableRow {
  return {
    id: row.order_id,
    order: row.order_id,
    amount: `¥ ${row.amount_yuan}`,
    status: row.status,
    createdAt: formatDateTime(row.created_at),
  };
}

function statusTone(status: string): StatusTone {
  if (status === "succeeded" || status === "paid") return "positive";
  if (status === "failed") return "negative";
  if (
    status === "queued" ||
    status === "running" ||
    status === "reviewing" ||
    status === "pending"
  ) {
    return "warning";
  }
  return "neutral";
}

function healthTone(status: OpsHealthStatus): StatusTone {
  if (status === "ok") return "positive";
  if (status === "bad") return "negative";
  if (status === "warn") return "warning";
  return "neutral";
}

function healthStatusLabel(status: OpsHealthStatus): string {
  if (status === "ok") return "正常";
  if (status === "bad") return "异常";
  if (status === "warn") return "关注";
  return "记录";
}

function statusColor(status: string): string {
  const tone = statusTone(status);
  if (tone === "positive") return "var(--mv-ops-positive)";
  if (tone === "negative") return "var(--mv-ops-negative)";
  if (tone === "warning") return "var(--warn)";
  return "var(--mv-ops-neutral)";
}

function statusLabel(status: string): string {
  return {
    queued: "排队",
    running: "生成中",
    reviewing: "审核中",
    succeeded: "完成",
    failed: "失败",
  }[status] ?? status;
}

function orderStatusLabel(status: string): string {
  return {
    pending: "待支付",
    paid: "已支付",
    closed: "已关闭",
  }[status] ?? status;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortDate(value: string): string {
  const parts = value.split("-");
  if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
  return value;
}
