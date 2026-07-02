import React, { useMemo, useState } from "react";
import { TweakValues } from "../../features/studio-editor/hooks/useTweaks";
import { deletePipelineRun } from "../../features/history/api/historyApi";
import { useHistoryRuns } from "../../features/history/hooks/useHistoryRuns";
import {
  applyHistoryFilter,
  computeHistoryStats,
  DEFAULT_FILTER,
  uniqueDomains,
  type HistoryFilter,
  type StatusFilter,
  type TimeWindow,
} from "../../features/history/lib/historyFilters";
import { PlaybookPlayer } from "../../features/playbook/engine/player/PlaybookPlayer";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { HistoryListSkeleton } from "./HistoryListSkeleton";
import { AutoRefinedBadge } from "../../features/runs/AutoRefinedBadge";
import { PromptDoctor } from "../../features/runs/PromptDoctor";
import { RunProgressStepper } from "../../features/runs/RunProgressStepper";
import { themeMode } from "../../features/studio-editor/hooks/useTweaks";
import type { PipelineRunResult } from "../../entities/pipeline/types";
import type { PlaybookScript } from "../../entities/playbook/types";

const STATUS_LABEL: Record<PipelineRunResult["status"], string> = {
  queued: "排队",
  running: "生成中",
  reviewing: "审核中",
  succeeded: "完成",
  failed: "失败",
};

function StatusBadge({ status }: { status: PipelineRunResult["status"] }) {
  return (
    <span className="mv-history-badge" data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function HistorySearchIcon() {
  return (
    <svg
      className="mv-history-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function HistoryRefreshIcon() {
  return (
    <svg
      className="mv-history-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M20 12a8 8 0 0 1-13.7 5.6" />
      <path d="M4 12A8 8 0 0 1 17.7 6.4" />
      <path d="M17 3v4h4" />
      <path d="M7 21v-4H3" />
    </svg>
  );
}

function HistoryChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`mv-history-icon mv-history-chevron${open ? " is-open" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function HistoryPointerIcon() {
  return (
    <svg
      className="mv-history-icon mv-history-pointer"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

interface RunItemProps {
  run: PipelineRunResult;
  isSelected: boolean;
  /** Stagger slot for the mount-time enter animation. */
  enterIndex: number;
  onClick: () => void;
  onOpenInWorkbench: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function RunItem({
  run,
  isSelected,
  enterIndex,
  onClick,
  onOpenInWorkbench,
  onDelete,
  isDeleting,
}: RunItemProps) {
  // Latch the mount-time stagger slot: list reorders after a background
  // refresh must not shift the delay of an animation that already played.
  // Stable keys keep existing nodes mounted, so the animation runs once.
  const [mountEnterIndex] = useState(enterIndex);
  const title = run.playbook?.title ?? run.prompt ?? "未命名";
  const domain = run.playbook?.domain ?? "—";
  const date = new Date(run.created_at).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const stepCount = run.playbook?.steps?.length ?? "—";
  const showPromptSubtitle = !!run.playbook?.title && !!run.prompt;
  const itemClassName = [
    "mv-history-item",
    "is-entering",
    isSelected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={itemClassName}
      style={{ animationDelay: `${Math.min(mountEnterIndex, 10) * 30}ms` }}
    >
      <button
        type="button"
        className="mv-history-item__main"
        aria-pressed={isSelected}
        onClick={onClick}
      >
        <div className="mv-history-item-head">
          <span className="mv-history-item-title">{title}</span>
          <StatusBadge status={run.status} />
        </div>
        {showPromptSubtitle && (
          <span className="mv-history-item-subtitle">{run.prompt}</span>
        )}
        <div className="mv-history-item-meta">
          <span className="mv-history-item-domain">{domain.toUpperCase()}</span>
          <span className="mv-history-item-date">{date}</span>
          <span className="mv-history-item-steps">{stepCount} 步</span>
        </div>
      </button>
      <div className="mv-history-item__actions">
        <button
          type="button"
          className="mv-history-item__open"
          onClick={onOpenInWorkbench}
          title="在工作台打开完整功能"
        >
          在工作台打开
        </button>
        <button
          type="button"
          className="mv-history-item__delete"
          disabled={isDeleting}
          onClick={onDelete}
          title="删除历史记录"
          aria-label="删除历史记录"
        >
          删除
        </button>
      </div>
    </div>
  );
}

function CenterHint({ children }: { children: React.ReactNode }) {
  return <div className="mv-history-hint">{children}</div>;
}

function isGenericLoadError(error: string): boolean {
  return /failed to fetch|load failed|networkerror/i.test(error);
}

function HistoryLoadError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  const detail = isGenericLoadError(error) ? null : error;
  return (
    <div className="mv-history-load-error" role="status">
      <strong>无法加载历史记录</strong>
      <span>请确认后端服务正在运行，或稍后重试。</span>
      {detail && <small>{detail}</small>}
      <button type="button" className="mv-chip" onClick={onRetry}>
        重试加载历史记录
      </button>
    </div>
  );
}

interface StatsLineProps {
  total: number;
  succeeded: number;
  failed: number;
  inFlight: number;
  averageSteps: number | null;
}

function StatsLine({
  total,
  succeeded,
  failed,
  inFlight,
  averageSteps,
}: StatsLineProps) {
  const avg = averageSteps === null ? "—" : averageSteps.toFixed(1);
  return (
    <div className="mv-history-stats-line">
      <span>
        总计 <b>{total}</b>
      </span>
      <span className="is-ok">
        成功 <b>{succeeded}</b>
      </span>
      <span className="is-bad">
        失败 <b>{failed}</b>
      </span>
      <span>
        进行中 <b>{inFlight}</b>
      </span>
      <span>
        平均 <b>{avg}</b> 步
      </span>
    </div>
  );
}

const PRIMARY_STATUS_CHIPS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "succeeded", label: "成功" },
  { value: "failed", label: "失败" },
  { value: "running", label: "生成中" },
];

export interface HistoryPageProps {
  t: TweakValues;
  onOpenInWorkbench?: (runId: string) => void;
}

export function HistoryPage({
  t,
  onOpenInWorkbench,
}: HistoryPageProps) {
  const mode = themeMode(t);
  const isDark = mode === "dark";
  const { runs, isLoading, error, refresh } = useHistoryRuns();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>(DEFAULT_FILTER);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingRun, setConfirmingRun] = useState<PipelineRunResult | null>(
    null,
  );
  const hasExtraStatusFilter =
    filter.status === "queued" || filter.status === "reviewing";
  const hasExtraFilter =
    filter.domain !== "" || filter.timeWindow !== "all" || hasExtraStatusFilter;
  const moreFiltersClassName = [
    "mv-history-chip",
    "mv-history-chip--ghost",
    moreFiltersOpen ? "is-active" : "",
    hasExtraFilter ? "has-dot" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const domains = useMemo(() => uniqueDomains(runs), [runs]);
  const filtered = useMemo(
    () => applyHistoryFilter(runs, filter),
    [runs, filter],
  );
  const stats = useMemo(() => computeHistoryStats(filtered), [filtered]);


  const handleDelete = async (run: PipelineRunResult) => {
    setConfirmingRun(null);
    setDeletingRunId(run.run_id);
    setDeleteError(null);
    try {
      await deletePipelineRun(run.run_id);
      if (selectedRunId === run.run_id) setSelectedRunId(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingRunId(null);
    }
  };

  const selectedRun =
    filtered.find((r) => r.run_id === selectedRunId) ?? filtered[0] ?? null;
  const effectiveSelectedRunId = selectedRun?.run_id ?? null;
  const playbook =
    selectedRun?.status === "succeeded"
      ? (selectedRun.playbook as PlaybookScript | null)
      : null;

  return (
    <>
      <main className="mv-history-main">
        <aside className="mv-history-list">
          <StatsLine {...stats} />

          <div className="mv-history-toolbar">
            <div className="mv-history-search-wrap">
              <HistorySearchIcon />
              <input
                type="search"
                className="mv-history-search"
                placeholder="搜索标题 / 摘要 / prompt..."
                value={filter.search}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, search: e.target.value }))
                }
              />
            </div>

            <div
              className="mv-history-status-chips"
              role="group"
              aria-label="状态筛选"
            >
              {PRIMARY_STATUS_CHIPS.map((chip) => {
                const active = filter.status === chip.value;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    aria-pressed={active}
                    className={`mv-history-chip${active ? " is-active" : ""}`}
                    onClick={() =>
                      setFilter((f) => ({ ...f, status: chip.value }))
                    }
                  >
                    {chip.label}
                  </button>
                );
              })}
              <button
                type="button"
                className={moreFiltersClassName}
                aria-expanded={moreFiltersOpen}
                onClick={() => setMoreFiltersOpen((v) => !v)}
              >
                <span>更多筛选</span>
                <HistoryChevronIcon open={moreFiltersOpen} />
              </button>
            </div>

            {moreFiltersOpen && (
              <div className="mv-history-more-filters">
                <select
                  aria-label="学科筛选"
                  className="mv-history-filter"
                  value={filter.domain}
                  onChange={(e) =>
                    setFilter((f) => ({ ...f, domain: e.target.value }))
                  }
                >
                  <option value="">全部学科</option>
                  {domains.map((d) => (
                    <option key={d} value={d}>
                      {d.toUpperCase()}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="时间筛选"
                  className="mv-history-filter"
                  value={filter.timeWindow}
                  onChange={(e) =>
                    setFilter((f) => ({
                      ...f,
                      timeWindow: e.target.value as TimeWindow,
                    }))
                  }
                >
                  <option value="all">全部时间</option>
                  <option value="today">今天</option>
                  <option value="week">本周</option>
                  <option value="month">本月</option>
                </select>
                <select
                  aria-label="其它状态筛选"
                  className="mv-history-filter"
                  value={hasExtraStatusFilter ? filter.status : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "queued" || v === "reviewing") {
                      setFilter((f) => ({ ...f, status: v }));
                    } else {
                      setFilter((f) => ({ ...f, status: "all" }));
                    }
                  }}
                >
                  <option value="">其它状态…</option>
                  <option value="queued">排队</option>
                  <option value="reviewing">审核中</option>
                </select>
              </div>
            )}
          </div>

          <div className="mv-history-list-head">
            <span className="mv-history-list-count">
              {isLoading ? "同步中" : `${filtered.length} / ${runs.length} 条`}
            </span>
            <div className="mv-history-list-actions">
              <button type="button" className="mv-chip" onClick={refresh}>
                <HistoryRefreshIcon />
                <span>刷新</span>
              </button>
            </div>
          </div>

          <div className="mv-history-list-body">
            {error && (
              <HistoryLoadError error={error} onRetry={refresh} />
            )}
            {deleteError && (
              <div className="mv-history-error">{deleteError}</div>
            )}
            {isLoading && runs.length === 0 && !error && <HistoryListSkeleton />}
            {!isLoading && !error && filtered.length === 0 && (
              <CenterHint>没有匹配的记录</CenterHint>
            )}
            {filtered.map((run, index) => (
              <RunItem
                key={run.run_id}
                run={run}
                isSelected={run.run_id === effectiveSelectedRunId}
                enterIndex={index}
                onClick={() => setSelectedRunId(run.run_id)}
                onOpenInWorkbench={() => onOpenInWorkbench?.(run.run_id)}
                onDelete={() => setConfirmingRun(run)}
                isDeleting={deletingRunId === run.run_id}
              />
            ))}
          </div>
        </aside>

        <div className="mv-history-detail">
          {!selectedRun && (
            <CenterHint>
              <HistoryPointerIcon />
              <span>选择一条记录回放动画，或在工作台打开使用完整功能</span>
            </CenterHint>
          )}
          {selectedRun && selectedRun.status === "failed" && (
            <PromptDoctor
              report={selectedRun.review ?? null}
              error={selectedRun.error}
            />
          )}
          {selectedRun &&
            (selectedRun.status === "queued" ||
              selectedRun.status === "running" ||
              selectedRun.status === "reviewing") && (
              <div className="mv-history-detail__stepper">
                <RunProgressStepper
                  status={selectedRun.status}
                  attempts={selectedRun.review?.attempts ?? 0}
                  maxAttempts={2}
                />
              </div>
            )}
          {playbook && (
            <>
              {(selectedRun?.review?.attempts ?? 0) > 0 && (
                <div className="mv-history-detail__badge-row">
                  <AutoRefinedBadge report={selectedRun?.review ?? null} />
                </div>
              )}
              <PlaybookPlayer
                script={playbook}
                director={selectedRun?.director ?? null}
                theme={isDark ? "dark" : "light"}
                swapDurationFrames={t.swapFrames}
                showLearningConsole={false}
              />
            </>
          )}
        </div>
      </main>

      {confirmingRun && (
        <ConfirmDialog
          title="确定删除这条历史记录吗？"
          description={confirmingRun.playbook?.title ?? confirmingRun.prompt ?? undefined}
          confirmLabel="删除"
          danger
          busy={deletingRunId !== null}
          onConfirm={() => void handleDelete(confirmingRun)}
          onCancel={() => setConfirmingRun(null)}
        />
      )}
    </>
  );
}
