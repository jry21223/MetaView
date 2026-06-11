import React, { useMemo, useState } from "react";
import MenuIcon from "@mui/icons-material/Menu";
import RefreshIcon from "@mui/icons-material/Refresh";
import HistoryIcon from "@mui/icons-material/History";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SettingsIcon from "@mui/icons-material/Settings";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import CssBaseline from "@mui/material/CssBaseline";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { alpha, createTheme, ThemeProvider } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { BarChart, LineChart, PieChart } from "@mui/x-charts";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";

import {
  useOpsDashboard,
  type OpsDashboardResponse,
  type OpsDashboardWindowDays,
  type OpsHealthTreeItem,
  type OpsMetricCard,
  type OpsOrderRow,
  type OpsRunRow,
} from "../../features/ops-dashboard";
import type { Stage } from "../../shared/ui/GlobalTopbar";

const drawerWidth = 248;
const windowOptions: OpsDashboardWindowDays[] = [7, 30, 90];

interface OpsDashboardPageProps {
  accountName?: string | null;
  accountBalanceYuan?: string | null;
  accountAvatarUrl?: string | null;
  onNavigate: (stage: Stage) => void;
  onOpenProviderSettings?: () => void;
}

type TableTab = "runs" | "orders";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#2563eb" },
    success: { main: "#12805c" },
    warning: { main: "#b7791f" },
    error: { main: "#c2413a" },
    background: {
      default: "#f7f8fb",
      paper: "#ffffff",
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: [
      "Inter",
      "-apple-system",
      "BlinkMacSystemFont",
      "PingFang SC",
      "Noto Sans SC",
      "sans-serif",
    ].join(","),
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
  },
});

export function OpsDashboardPage({
  accountName,
  accountBalanceYuan,
  accountAvatarUrl,
  onNavigate,
  onOpenProviderSettings,
}: OpsDashboardPageProps) {
  const [windowDays, setWindowDays] = useState<OpsDashboardWindowDays>(30);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tableTab, setTableTab] = useState<TableTab>("runs");
  const { dashboard, isLoading, error, errorStatus, refresh } = useOpsDashboard(windowDays);
  const isPermissionError = errorStatus === 403;

  const handleWindowChange = (
    _: React.MouseEvent<HTMLElement>,
    value: OpsDashboardWindowDays | null,
  ) => {
    if (value) setWindowDays(value);
  };

  const drawer = (
    <SideMenu
      accountName={accountName}
      accountBalanceYuan={accountBalanceYuan}
      accountAvatarUrl={accountAvatarUrl}
      onNavigate={(stage) => {
        setMobileOpen(false);
        onNavigate(stage);
      }}
      onOpenProviderSettings={onOpenProviderSettings}
    />
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
        <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{
              display: { xs: "block", md: "none" },
              "& .MuiDrawer-paper": { width: drawerWidth },
            }}
          >
            {drawer}
          </Drawer>
          <Drawer
            variant="permanent"
            sx={{
              display: { xs: "none", md: "block" },
              "& .MuiDrawer-paper": {
                width: drawerWidth,
                boxSizing: "border-box",
                borderRightColor: "divider",
              },
            }}
            open
          >
            {drawer}
          </Drawer>
        </Box>

        <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
          <MobileHeader onOpenMenu={() => setMobileOpen(true)} />
          <Stack
            spacing={2.5}
            sx={{
              width: "100%",
              maxWidth: 1680,
              mx: "auto",
              px: { xs: 2, md: 3 },
              py: { xs: 2, md: 3 },
            }}
          >
            <Header
              windowDays={windowDays}
              generatedAt={dashboard?.generated_at ?? null}
              onWindowChange={handleWindowChange}
              onRefresh={refresh}
              isLoading={isLoading}
            />

            {isLoading && !dashboard && <LoadingPanel />}
            {error && !isPermissionError && <ErrorPanel error={error} onRefresh={refresh} />}
            {isPermissionError && <PermissionPanel />}
            {dashboard && !isPermissionError && (
              <DashboardMainGrid
                dashboard={dashboard}
                tableTab={tableTab}
                onTableTabChange={setTableTab}
              />
            )}
          </Stack>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function MobileHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <Box
      sx={{
        display: { xs: "flex", md: "none" },
        alignItems: "center",
        gap: 1,
        px: 2,
        py: 1.5,
        bgcolor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <IconButton aria-label="打开运营导航" onClick={onOpenMenu}>
        <MenuIcon />
      </IconButton>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        MetaView 运营
      </Typography>
    </Box>
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
    <Stack
      direction={{ xs: "column", lg: "row" }}
      spacing={2}
      sx={{ alignItems: { xs: "stretch", lg: "center" }, justifyContent: "space-between" }}
    >
      <Box>
        <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 0 }}>
          MetaView Ops
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.15 }}>
          全局运营
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.75 }}>
          全站任务、收入、账户与充值状态。最近同步：
          {generatedAt ? formatDateTime(generatedAt) : "等待同步"}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <ToggleButtonGroup
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
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="刷新运营数据"
        >
          刷新
        </Button>
      </Stack>
    </Stack>
  );
}

function DashboardMainGrid({
  dashboard,
  tableTab,
  onTableTabChange,
}: {
  dashboard: OpsDashboardResponse;
  tableTab: TableTab;
  onTableTabChange: (tab: TableTab) => void;
}) {
  const runLabels = dashboard.run_trend.map((point) => shortDate(point.date));
  const revenueLabels = dashboard.revenue_trend.map((point) => shortDate(point.date));
  const healthTree = useMemo(() => toTreeItems(dashboard.health_tree), [dashboard.health_tree]);
  const runRows = useMemo(() => dashboard.recent_runs.map(runTableRow), [dashboard.recent_runs]);
  const orderRows = useMemo(
    () => dashboard.recent_orders.map(orderTableRow),
    [dashboard.recent_orders],
  );

  return (
    <Stack spacing={2.5}>
      <Grid container spacing={2} columns={12}>
        {dashboard.kpis.map((metric) => (
          <Grid key={metric.id} size={{ xs: 12, sm: 6, lg: 4, xl: 2 }}>
            <MetricPanel metric={metric} />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Panel title="任务趋势" subtitle={`近 ${dashboard.window_days} 天生成状态`}>
            <LineChart
              height={280}
              margin={{ top: 20, right: 28, bottom: 32, left: 42 }}
              xAxis={[{ scaleType: "point", data: runLabels }]}
              series={[
                {
                  data: dashboard.run_trend.map((point) => point.total),
                  label: "全部任务",
                  color: "#2563eb",
                },
                {
                  data: dashboard.run_trend.map((point) => point.succeeded),
                  label: "完成",
                  color: "#12805c",
                },
                {
                  data: dashboard.run_trend.map((point) => point.failed),
                  label: "失败",
                  color: "#c2413a",
                },
              ]}
            />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Panel title="收入趋势" subtitle="按 paid_at 统计已支付订单">
            <BarChart
              height={280}
              margin={{ top: 20, right: 20, bottom: 32, left: 56 }}
              xAxis={[{ scaleType: "band", data: revenueLabels }]}
              series={[
                {
                  data: dashboard.revenue_trend.map((point) =>
                    Number((point.revenue_cents / 100).toFixed(2)),
                  ),
                  label: "充值收入",
                  color: "#2563eb",
                },
              ]}
            />
          </Panel>
        </Grid>
      </Grid>

      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Panel
            title={tableTab === "runs" ? "最近任务" : "最近订单"}
            subtitle="全站最新记录，按创建时间倒序"
            action={
              <Tabs
                value={tableTab}
                onChange={(_, value: TableTab) => onTableTabChange(value)}
                aria-label="运营明细表"
              >
                <Tab value="runs" label="任务" />
                <Tab value="orders" label="订单" />
              </Tabs>
            }
          >
            <Box sx={{ height: 420, width: "100%" }}>
              {tableTab === "runs" ? (
                <DataGrid
                  rows={runRows}
                  columns={runColumns}
                  density="compact"
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                  pageSizeOptions={[10, 20, 50]}
                  disableRowSelectionOnClick
                />
              ) : (
                <DataGrid
                  rows={orderRows}
                  columns={orderColumns}
                  density="compact"
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                  pageSizeOptions={[10, 20, 50]}
                  disableRowSelectionOnClick
                />
              )}
            </Box>
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2}>
            <Panel title="状态分布" subtitle="窗口内任务状态">
              <PieChart
                height={220}
                series={[
                  {
                    data: dashboard.status_distribution.map((item, index) => ({
                      id: item.id,
                      value: item.count,
                      label: item.label,
                      color: pieColors[index % pieColors.length],
                    })),
                    innerRadius: 48,
                  },
                ]}
              />
            </Panel>
            <Panel title="运营健康树" subtitle="按任务、计费、账户分组">
              <RichTreeView
                items={healthTree}
                defaultExpandedItems={["generation", "billing", "accounts"]}
                sx={{ minHeight: 188, "& .MuiTreeItem-label": { fontSize: 13 } }}
              />
            </Panel>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}

function MetricPanel({ metric }: { metric: OpsMetricCard }) {
  const color = metric.trend === "down" ? "error.main" : metric.trend === "up" ? "success.main" : "text.secondary";
  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {metric.label}
          </Typography>
          <Chip
            size="small"
            label={
              metric.delta_percent == null
                ? "持平"
                : `${metric.delta_percent > 0 ? "+" : ""}${metric.delta_percent}%`
            }
            sx={{ color, bgcolor: (t) => alpha(t.palette.text.primary, 0.04) }}
          />
        </Stack>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {metric.value}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary", minHeight: 34 }}>
          {metric.helper}
        </Typography>
        {metric.data.length > 0 && (
          <MetricSparkline values={metric.data} />
        )}
      </Stack>
    </Paper>
  );
}

function MetricSparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <Stack direction="row" spacing={0.4} sx={{ height: 54, alignItems: "flex-end" }}>
      {values.map((value, index) => (
        <Box
          key={`${index}-${value}`}
          sx={{
            flex: 1,
            height: `${Math.max(10, (value / max) * 100)}%`,
            minWidth: 2,
            borderRadius: 0.5,
            bgcolor: index === values.length - 1 ? "primary.main" : "primary.light",
            opacity: index === values.length - 1 ? 1 : 0.45,
          }}
        />
      ))}
    </Stack>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between", mb: 1.5 }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
            {title}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {subtitle}
          </Typography>
        </Box>
        {action}
      </Stack>
      {children}
    </Paper>
  );
}

function SideMenu({
  accountName,
  accountBalanceYuan,
  accountAvatarUrl,
  onNavigate,
  onOpenProviderSettings,
}: OpsDashboardPageProps) {
  const navItems: Array<{ stage: Stage; label: string; icon: React.ReactNode }> = [
    { stage: "intake", label: "工作台", icon: <PlayCircleIcon /> },
    { stage: "history", label: "任务历史", icon: <HistoryIcon /> },
    { stage: "templates", label: "模板", icon: <ViewModuleIcon /> },
    { stage: "settings", label: "设置", icon: <SettingsIcon /> },
  ];

  return (
    <Stack sx={{ height: "100%", bgcolor: "background.paper" }}>
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 1.5,
              bgcolor: "primary.main",
              color: "primary.contrastText",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
            }}
          >
            MV
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
              MetaView
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              运营后台
            </Typography>
          </Box>
        </Stack>
      </Box>
      <Divider />
      <List sx={{ p: 1, flex: 1 }}>
        {navItems.map((item) => (
          <ListItemButton
            key={item.stage}
            selected={item.stage === "dashboard"}
            onClick={() => onNavigate(item.stage)}
            sx={{ borderRadius: 1, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          {accountAvatarUrl ? (
            <Box
              component="img"
              src={accountAvatarUrl}
              alt={`${accountName ?? "管理员"}头像`}
              sx={{ width: 36, height: 36, borderRadius: "50%" }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                bgcolor: "grey.100",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
              }}
            >
              管
            </Box>
          )}
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
              {accountName ?? "管理员"}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }} noWrap>
              余额 ¥ {accountBalanceYuan ?? "同步中"}
            </Typography>
          </Box>
          <IconButton size="small" aria-label="账户与充值" onClick={onOpenProviderSettings}>
            <ReceiptLongIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>
    </Stack>
  );
}

function LoadingPanel() {
  return (
    <Paper variant="outlined" sx={{ p: 4 }}>
      <Stack spacing={2} sx={{ alignItems: "center" }}>
        <CircularProgress size={28} />
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          同步运营数据
        </Typography>
      </Stack>
    </Paper>
  );
}

function PermissionPanel() {
  return (
    <Paper variant="outlined" sx={{ p: 4 }}>
      <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <WarningAmberIcon color="warning" />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          需要管理员权限
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          当前会话不是启用状态的 admin 账户，无法查看全站运营数据。
        </Typography>
      </Stack>
    </Paper>
  );
}

function ErrorPanel({ error, onRefresh }: { error: string; onRefresh: () => void }) {
  return (
    <Paper variant="outlined" sx={{ p: 4 }}>
      <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          加载失败
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", whiteSpace: "pre-wrap" }}>
          {error}
        </Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRefresh}>
          重新加载
        </Button>
      </Stack>
    </Paper>
  );
}

const runColumns: GridColDef[] = [
  { field: "title", headerName: "任务", flex: 1.2, minWidth: 180 },
  { field: "status", headerName: "状态", width: 96 },
  { field: "domain", headerName: "学科", width: 100 },
  { field: "createdAt", headerName: "创建时间", width: 150 },
];

const orderColumns: GridColDef[] = [
  { field: "order", headerName: "订单", flex: 1, minWidth: 160 },
  { field: "amount", headerName: "金额", width: 110 },
  { field: "status", headerName: "状态", width: 96 },
  { field: "createdAt", headerName: "创建时间", width: 150 },
];

function runTableRow(row: OpsRunRow) {
  return {
    id: row.run_id,
    title: row.title ?? row.prompt,
    status: statusLabel(row.status),
    domain: row.domain ?? "未识别",
    createdAt: formatDateTime(row.created_at),
  };
}

function orderTableRow(row: OpsOrderRow) {
  return {
    id: row.order_id,
    order: row.order_id,
    amount: `¥ ${row.amount_yuan}`,
    status: orderStatusLabel(row.status),
    createdAt: formatDateTime(row.created_at),
  };
}

function toTreeItems(items: OpsHealthTreeItem[]): Array<{ id: string; label: string; children?: Array<{ id: string; label: string }> }> {
  return items.map((item) => ({
    id: item.id,
    label: `${statusMark(item.status)} ${item.label} · ${item.value}`,
    children: item.children.map((child) => ({
      id: child.id,
      label: `${statusMark(child.status)} ${child.label} · ${child.value}`,
    })),
  }));
}

function statusMark(status: string): string {
  if (status === "ok") return "正常";
  if (status === "warn") return "关注";
  if (status === "bad") return "异常";
  return "记录";
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

const pieColors = ["#2563eb", "#12805c", "#c2413a", "#b7791f", "#64748b", "#7c3aed"];
