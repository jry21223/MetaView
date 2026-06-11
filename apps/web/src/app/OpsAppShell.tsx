import React, { useEffect, useMemo, useState } from "react";
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
import { TweaksPanel } from "../features/studio-editor/ui/TweaksPanel";
import { StudioPage } from "../pages/Studio/StudioPage";
import { HistoryPage } from "../pages/History/HistoryPage";
import { TemplatesPage } from "../pages/Templates/TemplatesPage";
import { SettingsPage } from "../pages/Settings/SettingsPage";
import { usePipelineSubmit } from "../features/pipeline/hooks/usePipelineSubmit";
import type { Stage } from "../shared/ui/GlobalTopbar";

export function OpsAppShell() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [stage, setStage] = useState<Stage>("intake");
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
  const toggleTheme = () =>
    setTweak("theme", mode === "dark" ? "light" : "dark");

  const openAccountPanel = () => setAccountModalOpen(true);

  const submitWithPlatformProvider = async (
    prompt: string,
    sourceCode?: string,
    language?: string,
  ) => {
    await submit(prompt, sourceCode, language);
  };

  const handleSubmit = async (ctx: IntakeContext) => {
    setOpenedRunId(null);
    await submitWithPlatformProvider(
      ctx.raw || ctx.title,
      ctx.sourceCode,
      ctx.language,
    );
    setStage("workbench");
  };

  const handleUseTemplate = async (prompt: string) => {
    setOpenedRunId(null);
    await submitWithPlatformProvider(prompt);
    setStage("workbench");
  };

  const handleOpenHistoryRun = (historyRunId: string) => {
    setOpenedRunId(historyRunId);
    setStage("workbench");
  };

  const isLoggedIn = accountStatus === "authenticated" && account?.login_provider === "wechat";

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
      {stage === "intake" && (
        <IntakeScreen
          appEdition="ops"
          onSubmit={handleSubmit}
          t={t}
          isSubmitting={isSubmitting}
          submitError={submitError}
          isProviderConfigured
          accountBalanceYuan={account?.balance_yuan ?? null}
          accountName={account?.display_name ?? null}
          accountAvatarUrl={accountAvatarUrl}
          onOpenProviderSettings={openAccountPanel}
          onNavigate={setStage}
          onToggleTheme={toggleTheme}
        />
      )}

      {stage === "workbench" && (
        <ErrorBoundary theme={mode}>
          <StudioPage
            appEdition="ops"
            runId={openedRunId ?? runId}
            t={t}
            setTweak={setTweak}
            onNavigate={setStage}
            isProviderConfigured
            accountBalanceYuan={account?.balance_yuan ?? null}
            accountName={account?.display_name ?? null}
            accountAvatarUrl={accountAvatarUrl}
            onOpenProviderSettings={openAccountPanel}
          />
        </ErrorBoundary>
      )}

      {stage === "history" && (
        <ErrorBoundary theme={mode}>
          <HistoryPage
            appEdition="ops"
            t={t}
            setTweak={setTweak}
            onNavigate={setStage}
            isProviderConfigured
            accountBalanceYuan={account?.balance_yuan ?? null}
            accountName={account?.display_name ?? null}
            accountAvatarUrl={accountAvatarUrl}
            onOpenProviderSettings={openAccountPanel}
            onOpenInWorkbench={handleOpenHistoryRun}
          />
        </ErrorBoundary>
      )}

      {stage === "templates" && (
        <ErrorBoundary theme={mode}>
          <TemplatesPage
            appEdition="ops"
            isDark={mode === "dark"}
            isProviderConfigured
            accountBalanceYuan={account?.balance_yuan ?? null}
            accountName={account?.display_name ?? null}
            accountAvatarUrl={accountAvatarUrl}
            onNavigate={setStage}
            onToggleTheme={toggleTheme}
            onOpenProviderSettings={openAccountPanel}
            onUseTemplate={handleUseTemplate}
          />
        </ErrorBoundary>
      )}

      {stage === "settings" && (
        <ErrorBoundary theme={mode}>
          <SettingsPage
            appEdition="ops"
            isDark={mode === "dark"}
            isProviderConfigured
            accountBalanceYuan={account?.balance_yuan ?? null}
            accountName={account?.display_name ?? null}
            accountAvatarUrl={accountAvatarUrl}
            onNavigate={setStage}
            onToggleTheme={toggleTheme}
            onOpenProviderSettings={openAccountPanel}
            tweaks={t}
            setTweak={setTweak}
          />
        </ErrorBoundary>
      )}

      <TweaksPanel t={t} setTweak={setTweak} />

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
