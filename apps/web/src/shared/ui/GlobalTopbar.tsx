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
  accountState?: "loading" | "guest" | "authenticated";
  onNavigate: (stage: Stage) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenProviderSettings?: () => void;
  onOpenAccountPanel?: () => void;
  hidePrimaryNav?: boolean;
}

function ProviderSettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.1 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.4-2.4 1a7.6 7.6 0 0 0-2.6-1.5L13.8 2h-3.6l-.4 3.1a7.6 7.6 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.5A8.2 8.2 0 0 0 4.7 12c0 .5 0 1 .1 1.5l-2 1.5 2 3.4 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 3.1h3.6l.4-3.1a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.4-2.1-1.5Z" />
    </svg>
  );
}

function NavSettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M4 7h8" />
      <path d="M16 7h4" />
      <circle cx="14" cy="7" r="2" />
      <path d="M4 12h3" />
      <path d="M11 12h9" />
      <circle cx="9" cy="12" r="2" />
      <path d="M4 17h11" />
      <path d="M19 17h1" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  );
}

export function GlobalTopbar({
  stage,
  appEdition = "self",
  isProviderConfigured,
  accountBalanceYuan,
  accountName,
  accountAvatarUrl,
  accountState = "authenticated",
  onNavigate,
  isDark,
  onToggleTheme,
  onOpenProviderSettings,
  onOpenAccountPanel,
  hidePrimaryNav = false,
}: GlobalTopbarProps) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const isWorkbench = stage === "workbench" || stage === "intake";
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
    appEdition === "ops" ? (accountState === "guest" ? "微信登录" : "账户与充值") : "模型服务商设置";

  return (
    <header className="mv-top">
      <div className="mv-brand">
        <img className="mv-brand-strip" src="/brand/metaview-mark.svg" alt="" />
        <span className="mv-brand-copy">
          <span className="mv-brand-name">MetaView</span>
          <span className="mv-brand-meta">THEORETICAL CANVAS</span>
        </span>
      </div>

      {!hidePrimaryNav && (
        <nav className="mv-nav">
          <button
            className={`mv-nav-item ${isWorkbench ? "is-active" : ""}`}
            aria-current={isWorkbench ? "page" : undefined}
            onClick={() => onNavigate("intake")}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M5 5h14v14H5z" />
              <path d="M9 5v14" />
              <path d="M9 10h10" />
            </svg>
            工作台
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
            <NavSettingsIcon />
            设置
          </button>
        </nav>
      )}

      <div className="mv-top-right">
        {appEdition === "self" && accountOrProviderHandler && (
          <button
            className="mv-icon-btn"
            onClick={accountOrProviderHandler}
            title={accountOrProviderLabel}
            aria-label={accountOrProviderLabel}
          >
            <ProviderSettingsIcon />
          </button>
        )}
        {(appEdition === "ops" ||
          accountBalanceYuan != null ||
          isProviderConfigured) && (
          <div className="mv-status">
            {appEdition === "ops" ? (
              accountState === "guest" ? (
                <span>登录后可查看账户与任务</span>
              ) : accountBalanceYuan != null ? (
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
            ) : (
              <span
                className="mv-pulse"
                role="img"
                title="模型已配置"
                aria-label="模型已配置"
              />
            )}
          </div>
        )}
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
        {appEdition === "ops" && (
          <button
            type="button"
            className="mv-avatar"
            onClick={accountOrProviderHandler}
            title={accountOrProviderLabel}
            aria-label={accountOrProviderLabel}
          >
            {avatarUrl ? (
              <img
                className="mv-avatar-img"
                src={avatarUrl}
                alt={`${accountName ?? "微信用户"}头像`}
                referrerPolicy="no-referrer"
                onError={() => setFailedAvatarUrl(avatarUrl)}
              />
            ) : (
              "MV"
            )}
          </button>
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
