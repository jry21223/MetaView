import { useEffect, useMemo, useRef, useState } from "react";
import {
  matchPath,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { ErrorBoundary } from "../shared/ui/ErrorBoundary";
import { useAccount } from "../features/account";
import { RechargeModal } from "../features/account/ui/RechargeModal";
import { WeChatLoginDialog } from "../features/account/ui/WeChatLoginDialog";
import {
  useTweaks,
  themeVars,
  themeMode,
  TWEAK_DEFAULTS,
} from "../features/studio-editor/hooks/useTweaks";
import {
  IntakeScreen,
  type IntakeContext,
} from "../features/studio-editor/ui/IntakeScreen";
import { StudioPage } from "../pages/Studio/StudioPage";
import { HistoryPage } from "../pages/History/HistoryPage";
import { SettingsPage } from "../pages/Settings/SettingsPage";
import { TemplatesPage } from "../pages/Templates/TemplatesPage";
import { TemplatePreviewPage } from "../pages/Templates/TemplatePreviewPage";
import { OPEN_ACCOUNT_PANEL_FLAG } from "../pages/PaymentResultPage";
import { usePipelineSubmit } from "../features/pipeline/hooks/usePipelineSubmit";
import { useProviderSettings } from "../features/providers/hooks/useProviderSettings";
import {
  GlobalTopbar,
  GlobalTopbarShell,
  type Stage,
} from "../shared/ui/GlobalTopbar";
import { useVisualViewportHeight } from "../shared/hooks/useVisualViewportHeight";
import { pathToStage, stageToPath } from "./routes";
import { clearPendingOpsSubmission, readPendingOpsSubmission, savePendingOpsSubmission, savePostLoginPath } from "./opsGuestAccess";
import { shouldCollapseWorkbenchTopbarByDefault } from "./workbenchChrome";

function initialTopbarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  const isTemplatePlayer = Boolean(matchPath("/templates/:templateId", window.location.pathname));
  return (
    (pathToStage(window.location.pathname) === "workbench" || isTemplatePlayer) &&
    shouldCollapseWorkbenchTopbarByDefault()
  );
}

function promptFromLocationState(state: unknown): string {
  if (!state || typeof state !== "object") return "";
  const prompt = (state as { prompt?: unknown }).prompt;
  return typeof prompt === "string" ? prompt : "";
}

export function OpsAppShell() {
  useVisualViewportHeight();

  const location = useLocation();
  const routerNavigate = useNavigate();
  const stage = pathToStage(location.pathname);
  const activeRunId =
    matchPath("/run/:runId", location.pathname)?.params.runId ?? null;
  const isTemplatePlayer = Boolean(matchPath("/templates/:templateId", location.pathname));
  const intakePrompt = stage === "intake" ? promptFromLocationState(location.state) : "";

  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [topbarCollapsed, setTopbarCollapsed] = useState(initialTopbarCollapsed);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingDraft] = useState(() => readPendingOpsSubmission());
  const autoSubmitRef = useRef(false);
  const {
    submit,
    isSubmitting,
    error: submitError,
  } = usePipelineSubmit();
  const {
    account,
    refresh: refreshAccount,
    status: accountStatus,
  } = useAccount();
  const accountAvatarUrl = account?.avatar_url ?? null;
  const {
    settings: providerSettings,
    update: updateProvider,
    isConfigured,
  } = useProviderSettings();

  const css = useMemo(() => themeVars(t), [t]);
  const mode = themeMode(t);
  const effectiveTopbarCollapsed = (stage === "workbench" || isTemplatePlayer) && topbarCollapsed;
  const toggleTheme = () =>
    setTweak("theme", mode === "dark" ? "light" : "dark");
  const openAccountPanel = () => setAccountModalOpen(true);

  const navigate = (nextStage: Stage) => {
    if (nextStage !== "workbench") {
      setTopbarCollapsed(false);
    }
    routerNavigate(stageToPath(nextStage, activeRunId));
  };

  const enterRun = (nextRunId: string) => {
    setTopbarCollapsed(shouldCollapseWorkbenchTopbarByDefault());
    routerNavigate(stageToPath("workbench", nextRunId));
  };

  useEffect(() => {
    if (stage === "intake" && intakePrompt) {
      routerNavigate("/create", { replace: true, state: null });
    }
  }, [stage, intakePrompt, routerNavigate]);

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

  const submitWithProvider = async (
    prompt: string,
    sourceCode?: string | null,
    language?: string | null,
    sourceFilename?: string | null,
    sourceSizeBytes?: number | null,
  ): Promise<string> =>
    submit({
      prompt,
      sourceCode,
      language,
      sourceFilename,
      sourceSizeBytes,
      provider: isConfigured ? providerSettings : undefined,
    });

  const handleSubmit = async (ctx: IntakeContext) => {
    if (!isLoggedIn) {
      savePendingOpsSubmission(ctx);
      setLoginOpen(true);
      return;
    }
    const nextRunId = await submitWithProvider(
      ctx.prompt,
      ctx.sourceCode,
      ctx.language,
      ctx.sourceFilename,
      ctx.sourceSizeBytes,
    );
    enterRun(nextRunId);
  };

  const handleResubmitPrompt = async (prompt: string) => {
    const nextRunId = await submitWithProvider(prompt);
    enterRun(nextRunId);
  };

  const handleEditPrompt = (prompt: string) => {
    setTopbarCollapsed(false);
    routerNavigate("/create", { state: { prompt } });
  };

  const handleOpenHistoryRun = (historyRunId: string) => {
    enterRun(historyRunId);
  };

  const isLoggedIn = accountStatus === "authenticated" && account?.login_provider === "wechat";
  const requireLogin = () => {
    savePostLoginPath(location.pathname);
    setLoginOpen(true);
  };

  useEffect(() => {
    if (!isLoggedIn || typeof window === "undefined") return;
    if (window.sessionStorage.getItem(OPEN_ACCOUNT_PANEL_FLAG) !== "1") return;
    window.sessionStorage.removeItem(OPEN_ACCOUNT_PANEL_FLAG);
    window.queueMicrotask(() => setAccountModalOpen(true));
  }, [isLoggedIn]);
  useEffect(() => {
    const saved = readPendingOpsSubmission();
    if (!isLoggedIn || !saved || autoSubmitRef.current) return;
    autoSubmitRef.current = true;
    void submitWithProvider(
      saved.prompt,
      saved.sourceCode,
      saved.language,
      saved.sourceFilename,
      saved.sourceSizeBytes,
    )
      .then((runId) => {
        clearPendingOpsSubmission();
        enterRun(runId);
      })
      .catch(() => {
        autoSubmitRef.current = false;
      });
  // This effect resumes exactly one confirmed guest submission after OAuth.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

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
          isProviderConfigured={isConfigured}
          accountBalanceYuan={account?.balance_yuan ?? null}
          accountName={account?.display_name ?? null}
          accountAvatarUrl={accountAvatarUrl}
          accountState={isLoggedIn ? "authenticated" : "guest"}
          onNavigate={navigate}
          isDark={mode === "dark"}
          onToggleTheme={toggleTheme}
          onOpenProviderSettings={() => navigate("settings")}
          onOpenAccountPanel={isLoggedIn ? openAccountPanel : requireLogin}
        />
      </GlobalTopbarShell>

      <Routes>
        <Route
          path="/create"
          element={
            <IntakeScreen
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              submitError={submitError}
              initialPrompt={intakePrompt}
              initialDraft={pendingDraft}
            />
          }
        />
        <Route
          path="/run/:runId"
          element={<ErrorBoundary theme={mode}>{isLoggedIn ? (
            <StudioPage appEdition="ops" runId={activeRunId} t={t} onNavigate={navigate}
              isProviderConfigured={isConfigured} providerSettings={providerSettings}
              onOpenProviderSettings={() => navigate("settings")}
              onResubmitPrompt={(prompt) => void handleResubmitPrompt(prompt)} onEditPrompt={handleEditPrompt}
              topbarCollapsed={effectiveTopbarCollapsed} onToggleTopbar={() => setTopbarCollapsed((value) => !value)} />
          ) : <ProtectedOpsPage onLogin={requireLogin} />}</ErrorBoundary>}
        />
        <Route path="/run" element={<Navigate to="/create" replace />} />
        <Route
          path="/templates"
          element={<TemplatesPage onOpenTemplate={(templateId) => {
            setTopbarCollapsed(shouldCollapseWorkbenchTopbarByDefault());
            routerNavigate(`/templates/${templateId}`);
          }} />}
        />
        <Route
          path="/templates/:templateId"
          element={(
            <TemplatePreviewPage
              theme={mode}
              topbarCollapsed={effectiveTopbarCollapsed}
              onToggleTopbar={() => setTopbarCollapsed((value) => !value)}
            />
          )}
        />
        <Route
          path="/history"
          element={<ErrorBoundary theme={mode}>{isLoggedIn ? (
            <HistoryPage t={t} onOpenInWorkbench={handleOpenHistoryRun} />
          ) : <ProtectedOpsPage onLogin={requireLogin} />}</ErrorBoundary>}
        />
        <Route
          path="/settings"
          element={
            <ErrorBoundary theme={mode}>
              <SettingsPage
                appEdition="ops"
                providerSettings={providerSettings}
                onUpdateProvider={updateProvider}
                tweaks={t}
                setTweak={setTweak}
                isAuthenticated={isLoggedIn}
                onRequireLogin={requireLogin}
              />
            </ErrorBoundary>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {loginOpen && <WeChatLoginDialog onClose={() => setLoginOpen(false)} />}

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

function ProtectedOpsPage({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="mv-intake-body mv-login-gate">
      <section className="mv-intake-hero">
        <div className="mv-eyebrow-mini">{"\u8d26\u6237\u5185\u5bb9"}</div>
        <h1 className="mv-intake-title">{"\u767b\u5f55\u540e\u7ee7\u7eed\u4f7f\u7528"}</h1>
        <p className="mv-intake-sub">{"\u4efb\u52a1\u5386\u53f2\u548c\u5df2\u6709\u8bb2\u89e3\u4ec5\u5bf9\u767b\u5f55\u8d26\u6237\u5f00\u653e\u3002"}</p>
        <button type="button" className="mv-send mv-intake-send" onClick={onLogin}>{"\u5fae\u4fe1\u767b\u5f55"}</button>
      </section>
    </main>
  );
}
