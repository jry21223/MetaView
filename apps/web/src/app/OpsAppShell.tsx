import { useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "../shared/ui/ErrorBoundary";
import { useAccount } from "../features/account";
import { fetchWeChatLoginUrl } from "../features/account/api/accountApi";
import { RechargeModal } from "../features/account/ui/RechargeModal";
import {
  useTweaks,
  themeVars,
  themeMode,
  TWEAK_DEFAULTS,
} from "../features/studio-editor/hooks/useTweaks";
import {
  IntakeScreen,
  IntakeContext,
} from "../features/studio-editor/ui/IntakeScreen";
import { StudioPage } from "../pages/Studio/StudioPage";
import { HistoryPage } from "../pages/History/HistoryPage";
import { TemplatesPage } from "../pages/Templates/TemplatesPage";
import { SettingsPage } from "../pages/Settings/SettingsPage";
import { OPEN_ACCOUNT_PANEL_FLAG } from "../pages/PaymentResultPage";
import { usePipelineSubmit } from "../features/pipeline/hooks/usePipelineSubmit";
import {
  GlobalTopbar,
  GlobalTopbarShell,
  type Stage,
} from "../shared/ui/GlobalTopbar";
import { useVisualViewportHeight } from "../shared/hooks/useVisualViewportHeight";
import { shouldCollapseWorkbenchTopbarByDefault } from "./workbenchChrome";

export function OpsAppShell() {
  useVisualViewportHeight();

  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [stage, setStage] = useState<Stage>("intake");
  const [topbarCollapsed, setTopbarCollapsed] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [openedRunId, setOpenedRunId] = useState<string | null>(null);
  const {
    submit,
    runId,
    isSubmitting,
    error: submitError,
  } = usePipelineSubmit();
  const {
    account,
    refresh: refreshAccount,
    status: accountStatus,
    error: accountError,
  } = useAccount();
  const accountAvatarUrl = account?.avatar_url ?? null;

  const css = useMemo(() => themeVars(t), [t]);
  const mode = themeMode(t);
  const effectiveTopbarCollapsed = stage === "workbench" && topbarCollapsed;
  const toggleTheme = () =>
    setTweak("theme", mode === "dark" ? "light" : "dark");
  const navigate = (nextStage: Stage) => {
    if (nextStage !== "workbench") setTopbarCollapsed(false);
    setStage(nextStage);
  };
  const enterWorkbench = () => {
    setTopbarCollapsed(shouldCollapseWorkbenchTopbarByDefault());
    setStage("workbench");
  };

  const openAccountPanel = () => setAccountModalOpen(true);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mobileQuery = window.matchMedia("(max-width: 680px)");
    const revealTopbarOnMobile = () => {
      if (mobileQuery.matches) {
        setTopbarCollapsed(false);
      }
    };

    revealTopbarOnMobile();
    if (mobileQuery.addEventListener) {
      mobileQuery.addEventListener("change", revealTopbarOnMobile);
      return () => mobileQuery.removeEventListener("change", revealTopbarOnMobile);
    }
    mobileQuery.addListener(revealTopbarOnMobile);
    return () => mobileQuery.removeListener(revealTopbarOnMobile);
  }, []);

  const submitWithPlatformProvider = async (
    prompt: string,
    domain?: string | null,
    sourceCode?: string,
    language?: string,
  ) => {
    await submit({ prompt, domain, sourceCode, language });
  };

  const handleSubmit = async (ctx: IntakeContext) => {
    setOpenedRunId(null);
    await submitWithPlatformProvider(
      ctx.raw || ctx.title,
      ctx.domain,
      ctx.sourceCode,
      ctx.language,
    );
    enterWorkbench();
  };

  const handleUseTemplate = async (prompt: string) => {
    setOpenedRunId(null);
    await submitWithPlatformProvider(prompt, null);
    enterWorkbench();
  };

  const handleOpenHistoryRun = (historyRunId: string) => {
    setOpenedRunId(historyRunId);
    enterWorkbench();
  };

  const isLoggedIn = accountStatus === "authenticated" && account?.login_provider === "wechat";

  useEffect(() => {
    if (!isLoggedIn || typeof window === "undefined") return;
    if (window.sessionStorage.getItem(OPEN_ACCOUNT_PANEL_FLAG) !== "1") return;
    window.sessionStorage.removeItem(OPEN_ACCOUNT_PANEL_FLAG);
    window.queueMicrotask(() => setAccountModalOpen(true));
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return (
      <div
        className={`mv-root mv-${mode} mv-theme-${t.theme} mv-density-${t.density} mv-layout-${t.layout}`}
        data-theme={t.theme}
        style={css}
      >
        <OpsLoginGate
          isLoading={accountStatus === "loading"}
          accountError={accountError}
          onRefreshAccount={refreshAccount}
          onToggleTheme={toggleTheme}
          isDark={mode === "dark"}
        />
      </div>
    );
  }

  return (
    <div
      className={`mv-root mv-${mode} mv-theme-${t.theme} mv-density-${t.density} mv-layout-${t.layout}`}
      data-theme={t.theme}
      style={css}
    >
      <GlobalTopbarShell collapsed={effectiveTopbarCollapsed}>
        <GlobalTopbar
          stage={stage}
          appEdition="ops"
          isProviderConfigured
          accountBalanceYuan={account?.balance_yuan ?? null}
          accountName={account?.display_name ?? null}
          accountAvatarUrl={accountAvatarUrl}
          onNavigate={navigate}
          isDark={mode === "dark"}
          onToggleTheme={toggleTheme}
          onOpenAccountPanel={openAccountPanel}
        />
      </GlobalTopbarShell>

      {stage === "intake" && (
        <IntakeScreen
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      )}

      {stage === "workbench" && (
        <ErrorBoundary theme={mode}>
          <StudioPage
            appEdition="ops"
            runId={openedRunId ?? runId}
            t={t}
            onNavigate={navigate}
            isProviderConfigured
            onOpenProviderSettings={openAccountPanel}
            topbarCollapsed={effectiveTopbarCollapsed}
            onToggleTopbar={() => setTopbarCollapsed((value) => !value)}
          />
        </ErrorBoundary>
      )}

      {stage === "history" && (
        <ErrorBoundary theme={mode}>
          <HistoryPage
            t={t}
            onOpenInWorkbench={handleOpenHistoryRun}
          />
        </ErrorBoundary>
      )}

      {stage === "templates" && (
        <ErrorBoundary theme={mode}>
          <TemplatesPage
            onUseTemplate={handleUseTemplate}
          />
        </ErrorBoundary>
      )}

      {stage === "settings" && (
        <ErrorBoundary theme={mode}>
          <SettingsPage
            appEdition="ops"
            tweaks={t}
            setTweak={setTweak}
          />
        </ErrorBoundary>
      )}

      {accountModalOpen && (
        <RechargeModal
          account={account}
          onRefreshAccount={refreshAccount}
          onClose={() => setAccountModalOpen(false)}
        />
      )}
    </div>
  );
}

function OpsLoginGate({
  isLoading,
  accountError,
  onRefreshAccount,
  onToggleTheme,
  isDark,
}: {
  isLoading: boolean;
  accountError: string | null;
  onRefreshAccount: () => void;
  onToggleTheme: () => void;
  isDark: boolean;
}) {
  const [loginState, setLoginState] = useState<
    | { kind: "checking" }
    | { kind: "ready"; url: string }
    | { kind: "unavailable"; message: string }
  >({ kind: "checking" });

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;
    fetchWeChatLoginUrl()
      .then((url) => {
        if (!cancelled) setLoginState({ kind: "ready", url });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoginState({
            kind: "unavailable",
            message: err instanceof Error ? err.message : "微信登录暂未开放",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isLoading]);

  const loginUrl = loginState.kind === "ready" ? loginState.url : null;
  const loginError =
    loginState.kind === "unavailable" ? loginState.message : null;
  const isCheckingLogin = isLoading || loginState.kind === "checking";
  const loginUnavailable = loginState.kind === "unavailable";

  return (
    <>
      <header className="mv-top">
        <div className="mv-brand">
          <span className="mv-brand-strip" />
          <span className="mv-brand-name">MetaView</span>
          <span className="mv-brand-meta">OPS</span>
        </div>
        <div className="mv-top-right">
          <button
            className="mv-icon-btn"
            title="切换主题"
            onClick={onToggleTheme}
            type="button"
          >
            {isDark ? "☀" : "☾"}
          </button>
          <div className="mv-avatar">MV</div>
        </div>
      </header>
      <main className="mv-intake-body">
        <section className="mv-intake-hero">
          <div className="mv-eyebrow-mini">运营版</div>
          <h1 className="mv-intake-title">微信登录后继续使用</h1>
          <p className="mv-intake-sub">
            {loginUnavailable
              ? "登录暂未开放，请联系管理员。"
              : "运营版需要微信登录后使用账户、余额、充值和平台托管模型。"}
          </p>
        </section>
        <div className="mv-intake-composer">
          <div className="mv-settings-actions">
            <button
              type="button"
              className="mv-send mv-intake-send"
              disabled={!loginUrl || isCheckingLogin}
              onClick={() => {
                if (loginUrl) window.location.assign(loginUrl);
              }}
            >
              {isCheckingLogin
                ? "检查登录中…"
                : loginUrl
                  ? "微信登录"
                  : "登录暂未开放"}
            </button>
            {loginUnavailable && (
              <button type="button" className="mv-chip" onClick={onRefreshAccount}>
                重新检查
              </button>
            )}
          </div>
          {(accountError || loginError) && (
            <div className="mv-settings-probe-hint">
              {loginError ?? accountError}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
