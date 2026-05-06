import React from 'react';

export type Stage = 'intake' | 'workbench' | 'history';

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
        <button className="mv-nav-item" disabled>模板</button>
        <button className="mv-nav-item" disabled>设置</button>
      </nav>

      <div className="mv-top-right">
        {onOpenExport && (
          <button
            className="mv-icon-btn"
            onClick={onOpenExport}
            disabled={!exportEnabled}
            title={exportEnabled ? "导出 MP4" : "等待生成完成后可导出"}
            style={{ opacity: exportEnabled ? 1 : 0.5 }}
          >
            导出 MP4
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
