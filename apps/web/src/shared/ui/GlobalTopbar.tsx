import React, { useState } from 'react';

export type Stage = 'dashboard' | 'intake' | 'workbench' | 'history' | 'templates' | 'settings';

interface GlobalTopbarProps {
  stage: Stage;
  appEdition?: 'self' | 'ops';
  isProviderConfigured: boolean;
  accountBalanceYuan?: string | null;
  accountName?: string | null;
  accountAvatarUrl?: string | null;
  onNavigate: (stage: Stage) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenProviderSettings?: () => void;
  onOpenExport?: () => void;
  exportEnabled?: boolean;
}

export function GlobalTopbar({
  stage,
  appEdition = 'self',
  isProviderConfigured,
  accountBalanceYuan,
  accountName,
  accountAvatarUrl,
  onNavigate,
  isDark,
  onToggleTheme,
  onOpenProviderSettings,
  onOpenExport,
  exportEnabled,
}: GlobalTopbarProps) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const avatarUrl =
    appEdition === 'ops' && accountAvatarUrl && failedAvatarUrl !== accountAvatarUrl
      ? accountAvatarUrl
      : null;

  return (
    <header className="mv-top">
      <div className="mv-brand">
        <span className="mv-pulse" />
        <span className="mv-brand-name">MetaView</span>
        <span className="mv-brand-meta">/ Concept Studio · v0.3</span>
      </div>

      <nav className="mv-nav" />

      <div className="mv-top-right">
        {onOpenExport && (
          <button
            className="mv-icon-btn"
            onClick={onOpenExport}
            disabled={!exportEnabled}
            title={exportEnabled ? '导出 MP4' : '等待生成完成后可导出'}
            aria-label="导出 MP4"
            style={{ opacity: exportEnabled ? 1 : 0.5 }}
          >
            ⤓
          </button>
        )}
        {onOpenProviderSettings && (
          <button
            className="mv-icon-btn"
            onClick={onOpenProviderSettings}
            title={appEdition === 'ops' ? '账户与充值' : '模型服务商设置'}
          >
            {appEdition === 'ops' ? '¥' : '⚙'}
          </button>
        )}
        <div className="mv-status">
          {appEdition === 'ops' ? (
            accountBalanceYuan != null ? (
              <>
                <span className="mv-pulse" />
                <span>{accountName ?? 'ACCOUNT'} · ¥ {accountBalanceYuan}</span>
              </>
            ) : (
              <>
                <span className="mv-pulse" />
                <span>账户同步中</span>
              </>
            )
          ) : accountBalanceYuan != null ? (
            <>
              <span className="mv-pulse" />
              <span>{accountName ?? 'ACCOUNT'} · ¥ {accountBalanceYuan}</span>
            </>
          ) : isProviderConfigured ? (
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
        {avatarUrl ? (
          <img
            className="mv-avatar mv-avatar-img"
            src={avatarUrl}
            alt={`${accountName ?? '微信用户'}头像`}
            referrerPolicy="no-referrer"
            onError={() => setFailedAvatarUrl(avatarUrl)}
          />
        ) : (
          <div className="mv-avatar">MV</div>
        )}
      </div>
    </header>
  );
}
