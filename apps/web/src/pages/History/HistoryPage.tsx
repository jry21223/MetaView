import React, { useMemo, useState } from 'react';
import { TweakValues } from '../../features/studio-editor/hooks/useTweaks';
import { useHistoryRuns } from '../../features/history/hooks/useHistoryRuns';
import {
  applyHistoryFilter,
  computeHistoryStats,
  DEFAULT_FILTER,
  runsToCsv,
  uniqueDomains,
  type HistoryFilter,
  type StatusFilter,
  type TimeWindow,
} from '../../features/history/lib/historyFilters';
import { PlaybookPlayer } from '../../features/playbook/engine/player/PlaybookPlayer';
import { AutoRefinedBadge } from '../../features/runs/AutoRefinedBadge';
import { PromptDoctor } from '../../features/runs/PromptDoctor';
import { RunProgressStepper } from '../../features/runs/RunProgressStepper';
import { themeMode } from '../../features/studio-editor/hooks/useTweaks';
import type { PipelineRunResult } from '../../entities/pipeline/types';
import type { PlaybookScript } from '../../entities/playbook/types';
import { GlobalTopbar, Stage } from '../../shared/ui/GlobalTopbar';

const STATUS_LABEL: Record<PipelineRunResult['status'], string> = {
  queued: '排队',
  running: '生成中',
  reviewing: '审核中',
  succeeded: '完成',
  failed: '失败',
};

function StatusBadge({ status }: { status: PipelineRunResult['status'] }) {
  return (
    <span className="mv-history-badge" data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}

interface RunItemProps {
  run: PipelineRunResult;
  isSelected: boolean;
  isCompared: boolean;
  compareDisabled: boolean;
  onClick: () => void;
  onToggleCompare: () => void;
  onRerun: () => void;
}

function RunItem({
  run,
  isSelected,
  isCompared,
  compareDisabled,
  onClick,
  onToggleCompare,
  onRerun,
}: RunItemProps) {
  const title = run.playbook?.title ?? run.prompt ?? '未命名';
  const domain = run.playbook?.domain ?? '—';
  const date = new Date(run.created_at).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const stepCount = run.playbook?.steps?.length ?? '—';
  const showPromptSubtitle = !!run.playbook?.title && !!run.prompt;

  return (
    <div className={`mv-history-item${isSelected ? ' is-selected' : ''}`} aria-pressed={isSelected}>
      <button type="button" className="mv-history-item__main" onClick={onClick}>
        <div className="mv-history-item-head">
          <span className="mv-history-item-title">{title}</span>
          <StatusBadge status={run.status} />
        </div>
        {showPromptSubtitle && <span className="mv-history-item-subtitle">{run.prompt}</span>}
        <div className="mv-history-item-meta">
          <span className="mv-history-item-domain">{domain.toUpperCase()}</span>
          <span className="mv-history-item-date">{date}</span>
          <span className="mv-history-item-steps">{stepCount} 步</span>
        </div>
      </button>
      <div className="mv-history-item__actions">
        <label
          className="mv-history-item__compare"
          title={isCompared ? '取消对比' : compareDisabled ? '最多同时对比两条' : '加入对比'}
        >
          <input
            type="checkbox"
            checked={isCompared}
            disabled={!isCompared && compareDisabled}
            onChange={onToggleCompare}
          />
          <span>对比</span>
        </label>
        <button
          type="button"
          className="mv-history-item__rerun"
          disabled={!run.prompt?.trim()}
          onClick={onRerun}
          title="使用原 prompt 重新执行"
        >
          ⚡ 重跑
        </button>
      </div>
    </div>
  );
}

function CenterHint({ children }: { children: React.ReactNode }) {
  return <div className="mv-history-hint">{children}</div>;
}

interface StatsBarProps {
  total: number;
  succeeded: number;
  failed: number;
  inFlight: number;
  averageSteps: number | null;
}

function StatsBar({ total, succeeded, failed, inFlight, averageSteps }: StatsBarProps) {
  const cards: Array<{ label: string; value: string }> = [
    { label: '总计', value: String(total) },
    { label: '成功', value: String(succeeded) },
    { label: '失败', value: String(failed) },
    { label: '进行中', value: String(inFlight) },
    {
      label: '平均步数',
      value: averageSteps === null ? '—' : averageSteps.toFixed(1),
    },
  ];
  return (
    <div className="mv-history-stats">
      {cards.map((card) => (
        <div key={card.label} className="mv-history-stats__card">
          <div className="mv-history-stats__label">{card.label}</div>
          <div className="mv-history-stats__value">{card.value}</div>
        </div>
      ))}
    </div>
  );
}

interface CompareDrawerProps {
  runs: PipelineRunResult[];
  onClose: () => void;
}

function CompareDrawer({ runs, onClose }: CompareDrawerProps) {
  if (runs.length === 0) return null;
  return (
    <div className="mv-history-compare" role="dialog" aria-label="对比">
      <div className="mv-history-compare__head">
        <span>对比 {runs.length} 条记录</span>
        <button type="button" onClick={onClose} aria-label="关闭对比">
          ×
        </button>
      </div>
      <div className="mv-history-compare__grid">
        {runs.map((run) => (
          <div key={run.run_id} className="mv-history-compare__col">
            <div className="mv-history-compare__title">
              {run.playbook?.title ?? run.prompt ?? '未命名'}
            </div>
            <dl>
              <dt>状态</dt>
              <dd>
                <StatusBadge status={run.status} />
              </dd>
              <dt>时间</dt>
              <dd>{new Date(run.created_at).toLocaleString('zh-CN')}</dd>
              <dt>学科</dt>
              <dd>{run.playbook?.domain?.toUpperCase() ?? '—'}</dd>
              <dt>步数</dt>
              <dd>{run.playbook?.steps?.length ?? '—'}</dd>
              <dt>修订</dt>
              <dd>{run.review?.attempts ?? 0}</dd>
              <dt>错误</dt>
              <dd>{run.error ?? '—'}</dd>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface HistoryPageProps {
  t: TweakValues;
  setTweak: (key: keyof TweakValues, value: TweakValues[keyof TweakValues]) => void;
  onNavigate: (stage: Stage) => void;
  isProviderConfigured: boolean;
  onOpenProviderSettings?: () => void;
  /**
   * Re-run a stored prompt. Returns once the new run has been queued so the
   * caller can navigate to the workbench. Issue #16.
   */
  onRerun?: (prompt: string) => void;
}

export function HistoryPage({
  t,
  setTweak,
  onNavigate,
  isProviderConfigured,
  onOpenProviderSettings,
  onRerun,
}: HistoryPageProps) {
  const mode = themeMode(t);
  const isDark = mode === 'dark';
  const { runs, isLoading, error, refresh } = useHistoryRuns();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>(DEFAULT_FILTER);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const domains = useMemo(() => uniqueDomains(runs), [runs]);
  const filtered = useMemo(() => applyHistoryFilter(runs, filter), [runs, filter]);
  const stats = useMemo(() => computeHistoryStats(filtered), [filtered]);
  const compareRuns = useMemo(
    () =>
      compareIds
        .map((id) => runs.find((r) => r.run_id === id))
        .filter((r): r is PipelineRunResult => !!r),
    [compareIds, runs],
  );

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev; // cap at 2-way compare for MVP
      return [...prev, id];
    });
  };

  const handleExportCsv = () => {
    // Issue #64: prompts may contain PII (pasted source, names, emails).
    // Make sharing them an explicit confirmation step before we serialize.
    const includePrompt = window.confirm(
      "导出 CSV 时是否包含原始 prompt？\n勾选 “确定” 包含 prompt（可能含敏感信息），“取消” 仅导出元数据。",
    );
    const csv = runsToCsv(filtered, { includePrompt });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metaview-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRerun = (run: PipelineRunResult) => {
    const prompt = run.prompt?.trim();
    if (!prompt) return;
    onRerun?.(prompt);
  };

  const selectedRun = filtered.find((r) => r.run_id === selectedRunId) ?? null;
  const playbook =
    selectedRun?.status === 'succeeded' ? (selectedRun.playbook as PlaybookScript | null) : null;

  return (
    <>
      <GlobalTopbar
        stage="history"
        isProviderConfigured={isProviderConfigured}
        onNavigate={onNavigate}
        isDark={isDark}
        onToggleTheme={() => setTweak('theme', isDark ? 'light' : 'dark')}
        onOpenProviderSettings={onOpenProviderSettings}
      />
      <main className="mv-history-main">
        <aside className="mv-history-list">
          <StatsBar {...stats} />

          <div className="mv-history-toolbar">
            <input
              type="search"
              className="mv-history-search"
              placeholder="🔍 搜索标题 / 摘要 / prompt…"
              value={filter.search}
              onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            />
            <select
              aria-label="学科筛选"
              className="mv-history-filter"
              value={filter.domain}
              onChange={(e) => setFilter((f) => ({ ...f, domain: e.target.value }))}
            >
              <option value="">全部学科</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d.toUpperCase()}
                </option>
              ))}
            </select>
            <select
              aria-label="状态筛选"
              className="mv-history-filter"
              value={filter.status}
              onChange={(e) =>
                setFilter((f) => ({ ...f, status: e.target.value as StatusFilter }))
              }
            >
              <option value="all">全部状态</option>
              <option value="succeeded">成功</option>
              <option value="failed">失败</option>
              <option value="running">生成中</option>
              <option value="queued">排队</option>
              <option value="reviewing">审核中</option>
            </select>
            <select
              aria-label="时间筛选"
              className="mv-history-filter"
              value={filter.timeWindow}
              onChange={(e) =>
                setFilter((f) => ({ ...f, timeWindow: e.target.value as TimeWindow }))
              }
            >
              <option value="all">全部时间</option>
              <option value="today">今天</option>
              <option value="week">本周</option>
              <option value="month">本月</option>
            </select>
          </div>

          <div className="mv-history-list-head">
            <span className="mv-history-list-count">
              {isLoading ? '加载中…' : `${filtered.length} / ${runs.length} 条`}
            </span>
            <div className="mv-history-list-actions">
              <button type="button" className="mv-chip" onClick={handleExportCsv}>
                ↓ CSV
              </button>
              <button type="button" className="mv-chip" onClick={refresh}>
                ↻ 刷新
              </button>
            </div>
          </div>

          <div className="mv-history-list-body">
            {error && <div className="mv-history-error">{error}</div>}
            {!isLoading && !error && filtered.length === 0 && (
              <CenterHint>没有匹配的记录</CenterHint>
            )}
            {filtered.map((run) => (
              <RunItem
                key={run.run_id}
                run={run}
                isSelected={run.run_id === selectedRunId}
                isCompared={compareIds.includes(run.run_id)}
                compareDisabled={compareIds.length >= 2}
                onClick={() => setSelectedRunId(run.run_id)}
                onToggleCompare={() => toggleCompare(run.run_id)}
                onRerun={() => handleRerun(run)}
              />
            ))}
          </div>
        </aside>

        <div className="mv-history-detail">
          {compareRuns.length > 0 && (
            <CompareDrawer runs={compareRuns} onClose={() => setCompareIds([])} />
          )}
          {!selectedRun && compareRuns.length === 0 && (
            <CenterHint>← 选择一条记录回放动画，或勾选两条进行对比</CenterHint>
          )}
          {selectedRun && selectedRun.status === 'failed' && (
            <PromptDoctor report={selectedRun.review ?? null} error={selectedRun.error} />
          )}
          {selectedRun &&
            (selectedRun.status === 'queued' ||
              selectedRun.status === 'running' ||
              selectedRun.status === 'reviewing') && (
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
                theme={isDark ? 'dark' : 'light'}
                swapDurationFrames={t.swapFrames}
              />
            </>
          )}
        </div>
      </main>
    </>
  );
}
