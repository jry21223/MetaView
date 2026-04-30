import React, { useState } from 'react';
import { TweakValues } from '../../features/studio-editor/hooks/useTweaks';
import { useHistoryRuns } from '../../features/history/hooks/useHistoryRuns';
import { PlaybookPlayer } from '../../features/playbook/engine/player/PlaybookPlayer';
import type { PipelineRunResult } from '../../entities/pipeline/types';
import type { PlaybookScript } from '../../entities/playbook/types';

// ── Status badge ──────────────────────────────────────────────────────────

const STATUS_COLOR: Record<PipelineRunResult['status'], string> = {
  queued: 'var(--ink-3)',
  running: 'var(--accent)',
  succeeded: '#5be8b4',
  failed: '#ff9e8a',
};

const STATUS_LABEL: Record<PipelineRunResult['status'], string> = {
  queued: '排队',
  running: '生成中',
  succeeded: '完成',
  failed: '失败',
};

function StatusBadge({ status }: { status: PipelineRunResult['status'] }) {
  return (
    <span style={{
      fontSize: 10,
      fontFamily: 'IBM Plex Mono, monospace',
      color: STATUS_COLOR[status],
      border: `1px solid ${STATUS_COLOR[status]}`,
      borderRadius: 4,
      padding: '1px 6px',
      flexShrink: 0,
    }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── Run list item ─────────────────────────────────────────────────────────

function RunItem({
  run,
  isSelected,
  onClick,
}: {
  run: PipelineRunResult;
  isSelected: boolean;
  onClick: () => void;
}) {
  const title = run.playbook?.title ?? '未命名';
  const domain = run.playbook?.domain ?? '—';
  const date = new Date(run.created_at).toLocaleString('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '12px 14px',
        borderRadius: 8,
        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--line)'}`,
        background: isSelected ? 'rgba(77,232,176,0.06)' : 'var(--surface)',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--ink)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {title}
        </span>
        <StatusBadge status={run.status} />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'IBM Plex Mono, monospace' }}>
          {domain.toUpperCase()}
        </span>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{date}</span>
      </div>
    </button>
  );
}

// ── Empty / loading / error states ────────────────────────────────────────

function CenterHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: 'var(--ink-3)', fontSize: 13,
      fontFamily: 'IBM Plex Mono, monospace',
    }}>
      {children}
    </div>
  );
}

// ── HistoryPage ───────────────────────────────────────────────────────────

export interface HistoryPageProps {
  t: TweakValues;
  setTweak: (key: keyof TweakValues, value: TweakValues[keyof TweakValues]) => void;
  onHome: () => void;
}

export function HistoryPage({ t, setTweak, onHome }: HistoryPageProps) {
  const isDark = t.theme === 'dark';
  const { runs, isLoading, error, refresh } = useHistoryRuns();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const selectedRun = runs.find((r) => r.run_id === selectedRunId) ?? null;
  const playbook = selectedRun?.status === 'succeeded' ? (selectedRun.playbook as PlaybookScript | null) : null;

  return (
    <>
      {/* Topbar */}
      <header className="mv-top">
        <div className="mv-brand">
          <span className="mv-pulse" />
          <span className="mv-brand-name">MetaView</span>
          <span className="mv-brand-meta">/ 任务历史</span>
        </div>

        <nav className="mv-nav">
          <button className="mv-nav-item" onClick={onHome}>工作台</button>
          <button className="mv-nav-item is-active">任务历史</button>
          <button className="mv-nav-item">模板</button>
          <button className="mv-nav-item">设置</button>
        </nav>

        <div className="mv-top-right">
          <div className="mv-status">
            <span className="mv-dot" />
            <span>CORE NODES ONLINE</span>
          </div>
          <button className="mv-icon-btn" title="切换主题"
            onClick={() => setTweak('theme', isDark ? 'light' : 'dark')}>
            {isDark ? '☀' : '☾'}
          </button>
          <div className="mv-avatar">MV</div>
        </div>
      </header>

      {/* Body */}
      <main style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '300px 1fr',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {/* Left: run list */}
        <aside style={{
          borderRight: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--ink-3)' }}>
              {isLoading ? '加载中…' : `${runs.length} 条记录`}
            </span>
            <button className="mv-chip" onClick={refresh} style={{ padding: '3px 10px', fontSize: 12 }}>
              ↻ 刷新
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {error && (
              <div style={{ fontSize: 12, color: '#ff9e8a', padding: '8px 4px' }}>{error}</div>
            )}
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
        <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
            <PlaybookPlayer script={playbook} theme={isDark ? 'dark' : 'light'} />
          )}
        </div>
      </main>
    </>
  );
}
