import React from 'react';

export type Stage = 'intake' | 'workbench' | 'history' | 'templates' | 'settings';

interface GlobalTopbarProps {
  stage: Stage;
  isProviderConfigured: boolean;
  onNavigate: (stage: Stage) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenProviderSettings?: () => void;
  onOpenExport?: () => void;
  exportEnabled?: boolean;
}

export function GlobalTopbar({
  stage,
  isProviderConfigured,
  onNavigate,
  isDark,
  onToggleTheme,
  onOpenProviderSettings,
  onOpenExport,
  exportEnabled,
}: GlobalTopbarProps) {
  const isWorkbench = stage === 'intake' || stage === 'workbench';
  const isHistory = stage === 'history';
  const isTemplates = stage === 'templates';
  const isSettings = stage === 'settings';

  return (
    <header className="mv-top">
      <div className="mv-brand">
        <span className="mv-pulse" />
        <span className="mv-brand-name">MetaView</span>
        <span className="mv-brand-meta">/ Concept Studio · v0.3</span>
      </div>

      <nav className="mv-nav">
        <button
          className={`mv-nav-item${isWorkbench ? ' is-active' : ''}`}
          onClick={() => onNavigate('intake')}
        >
          工作台
        </button>
        <button
          className={`mv-nav-item${isHistory ? ' is-active' : ''}`}
          onClick={() => onNavigate('history')}
        >
          任务历史
        </button>
        <button
          className={`mv-nav-item${isTemplates ? ' is-active' : ''}`}
          onClick={() => onNavigate('templates')}
        >
          模板
        </button>
        <button
          className={`mv-nav-item${isSettings ? ' is-active' : ''}`}
          onClick={() => onNavigate('settings')}
        >
          设置
        </button>
      </nav>

      <div className="mv-top-right">
        {onOpenExport && (
          <button
            className="mv-icon-btn"
            onClick={onOpenExport}
            disabled={!exportEnabled}
            title={exportEnabled ? "导出 MP4" : "等待生成完成后可导出"}
            aria-label="导出 MP4"
            style={{ opacity: exportEnabled ? 1 : 0.5 }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M8 2v8" />
              <path d="M4.5 6.5 8 10l3.5-3.5" />
              <path d="M2.5 11v1.5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V11" />
            </svg>
          </button>
        )}
        {onOpenProviderSettings && (
          <button
            className="mv-icon-btn"
            onClick={onOpenProviderSettings}
            title="Provider 设置"
          >
            ⚙
          </button>
        )}
        <div className="mv-status">
          {isProviderConfigured ? (
            <>
              <span className="mv-pulse" />
              <span>CORE NODES ONLINE</span>
            </>
          ) : (
            <>
              <span className="mv-pulse-offline" />
              <span>NO PROVIDER SET</span>
            </>
          )}
        </div>
        <button className="mv-icon-btn" title="切换主题" onClick={onToggleTheme}>
          {isDark ? '☀' : '☾'}
        </button>
        <div className="mv-avatar">MV</div>
      </div>
    </header>
  );
}
