import React, { useState } from 'react';
import { TweakValues } from '../../features/studio-editor/hooks/useTweaks';
import { useHistoryRuns } from '../../features/history/hooks/useHistoryRuns';
import { PlaybookPlayer } from '../../features/playbook/engine/player/PlaybookPlayer';
import type { PipelineRunResult } from '../../entities/pipeline/types';
import type { PlaybookScript } from '../../entities/playbook/types';
import { GlobalTopbar, Stage } from '../../shared/ui/GlobalTopbar';

// ── Status badge ──────────────────────────────────────────────────────────

const STATUS_LABEL: Record<PipelineRunResult['status'], string> = {
  queued: '排队',
  running: '生成中',
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

// ── Run list item ─────────────────────────────────────────────────────────

interface RunItemProps {
  run: PipelineRunResult;
  isSelected: boolean;
  onClick: () => void;
}

function RunItem({ run, isSelected, onClick }: RunItemProps) {
  const title = run.playbook?.title ?? run.prompt ?? '未命名';
  const domain = run.playbook?.domain ?? '—';
  const date = new Date(run.created_at).toLocaleString('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const showPromptSubtitle = !!run.playbook?.title && !!run.prompt;

  return (
    <button
      type="button"
      className="mv-history-item"
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
      </div>
    </button>
  );
}

// ── Empty / loading / error states ────────────────────────────────────────

function CenterHint({ children }: { children: React.ReactNode }) {
  return <div className="mv-history-hint">{children}</div>;
}

// ── HistoryPage ───────────────────────────────────────────────────────────

export interface HistoryPageProps {
  t: TweakValues;
  setTweak: (key: keyof TweakValues, value: TweakValues[keyof TweakValues]) => void;
  onNavigate: (stage: Stage) => void;
  isProviderConfigured: boolean;
  onOpenProviderSettings?: () => void;
}

export function HistoryPage({ t, setTweak, onNavigate, isProviderConfigured, onOpenProviderSettings }: HistoryPageProps) {
  const isDark = t.theme === 'dark';
  const { runs, isLoading, error, refresh } = useHistoryRuns();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const selectedRun = runs.find((r) => r.run_id === selectedRunId) ?? null;
  const playbook = selectedRun?.status === 'succeeded' ? (selectedRun.playbook as PlaybookScript | null) : null;

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
        {/* Left: run list */}
        <aside className="mv-history-list">
          <div className="mv-history-list-head">
            <span className="mv-history-list-count">
              {isLoading ? '加载中…' : `${runs.length} 条记录`}
            </span>
            <button type="button" className="mv-chip" onClick={refresh}>
              ↻ 刷新
            </button>
          </div>

          <div className="mv-history-list-body">
            {error && <div className="mv-history-error">{error}</div>}
            {!isLoading && !error && runs.length === 0 && (
              <CenterHint>暂无历史记录</CenterHint>
            )}
            {runs.map((run) => (
              <RunItem
                key={run.run_id}
                run={run}
                isSelected={run.run_id === selectedRunId}
                onClick={() => setSelectedRunId(run.run_id)}
              />
            ))}
          </div>
        </aside>

        {/* Right: playbook preview */}
        <div className="mv-history-detail">
          {!selectedRun && (
            <CenterHint>← 选择一条记录回放动画</CenterHint>
          )}
          {selectedRun && selectedRun.status === 'failed' && (
            <CenterHint>该任务生成失败：{selectedRun.error ?? '未知错误'}</CenterHint>
          )}
          {selectedRun && selectedRun.status === 'queued' && (
            <CenterHint>该任务仍在排队</CenterHint>
          )}
          {selectedRun && selectedRun.status === 'running' && (
            <CenterHint>该任务仍在生成中</CenterHint>
          )}
          {playbook && (
            <PlaybookPlayer
              script={playbook}
              theme={isDark ? 'dark' : 'light'}
              swapDurationFrames={t.swapFrames}
            />
          )}
        </div>
      </main>
    </>
  );
}
