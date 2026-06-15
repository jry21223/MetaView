import { useState, type ReactNode } from "react";

export type Stage =
  | "intake"
  | "workbench"
  | "history"
  | "templates"
  | "settings";

interface GlobalTopbarProps {
  stage: Stage;
  appEdition?: "self" | "ops";
  isProviderConfigured: boolean;
  accountBalanceYuan?: string | null;
  accountName?: string | null;
  accountAvatarUrl?: string | null;
  onNavigate: (stage: Stage) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenProviderSettings?: () => void;
  onOpenAccountPanel?: () => void;
  hidePrimaryNav?: boolean;
}

export function GlobalTopbar({
  stage,
  appEdition = "self",
  isProviderConfigured,
  accountBalanceYuan,
  accountName,
  accountAvatarUrl,
  onNavigate,
  isDark,
  onToggleTheme,
  onOpenProviderSettings,
  onOpenAccountPanel,
  hidePrimaryNav = false,
}: GlobalTopbarProps) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const isHome = stage === "workbench" || stage === "intake";
  const isHistory = stage === "history";
  const isTemplates = stage === "templates";
  const isSettings = stage === "settings";
  const avatarUrl =
    appEdition === "ops" &&
    accountAvatarUrl &&
    failedAvatarUrl !== accountAvatarUrl
      ? accountAvatarUrl
      : null;
  const accountOrProviderHandler =
    appEdition === "ops" ? onOpenAccountPanel : onOpenProviderSettings;
  const accountOrProviderLabel =
    appEdition === "ops" ? "账户与充值" : "模型服务商设置";

  return (
    <header className="mv-top">
      <div className="mv-brand">
        <span className="mv-brand-strip" />
        <span className="mv-brand-copy">
          <span className="mv-brand-name">MetaView</span>
          <span className="mv-brand-meta">THEORETICAL CANVAS</span>
        </span>
      </div>

      {!hidePrimaryNav && (
        <nav className="mv-nav">
          <button
            className={`mv-nav-item ${isHome ? "is-active" : ""}`}
            aria-current={isHome ? "page" : undefined}
            onClick={() => onNavigate("intake")}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M4 10.5 12 4l8 6.5V20H5v-7" />
            </svg>
            首页
          </button>
          <button
            className={`mv-nav-item ${isHistory ? "is-active" : ""}`}
            aria-current={isHistory ? "page" : undefined}
            onClick={() => onNavigate("history")}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M12 8v5l3 2" />
              <path d="M4 12a8 8 0 1 0 2.4-5.7" />
              <path d="M4 4v5h5" />
            </svg>
            任务历史
          </button>
          <button
            className={`mv-nav-item ${isTemplates ? "is-active" : ""}`}
            aria-current={isTemplates ? "page" : undefined}
            onClick={() => onNavigate("templates")}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M5 4h6v6H5z" />
              <path d="M13 4h6v6h-6z" />
              <path d="M5 14h6v6H5z" />
              <path d="M13 14h6v6h-6z" />
            </svg>
            模板
          </button>
          <button
            className={`mv-nav-item ${isSettings ? "is-active" : ""}`}
            aria-current={isSettings ? "page" : undefined}
            onClick={() => onNavigate("settings")}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-2 .1 1.7 1.7 0 0 0-.9 1.7v.2H10v-.2a1.7 1.7 0 0 0-.9-1.7 1.7 1.7 0 0 0-2-.1l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 5.3 15a1.7 1.7 0 0 0-1.4-1.1h-.2v-3.8h.2A1.7 1.7 0 0 0 5.3 9a1.7 1.7 0 0 0-.3-1.9L4.9 7l2-3.4.2.1a1.7 1.7 0 0 0 2-.1A1.7 1.7 0 0 0 10 1.9v-.2h4.7v.2a1.7 1.7 0 0 0 .9 1.7 1.7 1.7 0 0 0 2 .1l.2-.1 2 3.4-.1.1A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.4 1.1h.2v3.8h-.2A1.7 1.7 0 0 0 19.4 15Z" />
            </svg>
            设置
          </button>
        </nav>
      )}

      <div className="mv-top-right">
        {accountOrProviderHandler && (
          <button
            className="mv-icon-btn"
            onClick={accountOrProviderHandler}
            title={accountOrProviderLabel}
            aria-label={accountOrProviderLabel}
          >
            {appEdition === "ops" ? "¥" : "⚙"}
          </button>
        )}
        <div className="mv-status">
          {appEdition === "ops" ? (
            accountBalanceYuan != null ? (
              <>
                <span className="mv-pulse" />
                <span>
                  {accountName ?? "ACCOUNT"} · ¥ {accountBalanceYuan}
                </span>
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
              <span>
                {accountName ?? "ACCOUNT"} · ¥ {accountBalanceYuan}
              </span>
            </>
          ) : isProviderConfigured ? (
            <>
              <span className="mv-pulse" />
              <span>模型已配置</span>
            </>
          ) : (
            <>
              <span className="mv-pulse-offline" />
              <span>未配置模型</span>
            </>
          )}
        </div>
        <button
          className="mv-icon-btn"
          title="切换主题"
          aria-label="切换主题"
          onClick={onToggleTheme}
        >
          {isDark ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.9 4.9 1.4 1.4" />
              <path d="m17.7 17.7 1.4 1.4" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m4.9 19.1 1.4-1.4" />
              <path d="m17.7 6.3 1.4-1.4" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M20.5 14.5A7.5 7.5 0 0 1 9.5 3.5 8 8 0 1 0 20.5 14.5Z" />
            </svg>
          )}
        </button>
        {avatarUrl ? (
          <img
            className="mv-avatar mv-avatar-img"
            src={avatarUrl}
            alt={`${accountName ?? "微信用户"}头像`}
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

export function GlobalTopbarShell({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`mv-top-shell${collapsed ? " is-collapsed" : ""}`}
      aria-hidden={collapsed || undefined}
      inert={collapsed || undefined}
    >
      {children}
    </div>
  );
}
