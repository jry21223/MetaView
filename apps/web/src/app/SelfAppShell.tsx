import { useEffect, useMemo, useState } from "react";
import {
  matchPath,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { ErrorBoundary } from "../shared/ui/ErrorBoundary";
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
import { usePipelineSubmit } from "../features/pipeline/hooks/usePipelineSubmit";
import { useProviderSettings } from "../features/providers/hooks/useProviderSettings";
import { ProviderSettingsModal } from "../features/providers/ui/ProviderSettingsModal";
import {
  GlobalTopbar,
  GlobalTopbarShell,
  type Stage,
} from "../shared/ui/GlobalTopbar";
import { useVisualViewportHeight } from "../shared/hooks/useVisualViewportHeight";
import { pathToStage, stageToPath } from "./routes";
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

export function SelfAppShell() {
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
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const {
    submit,
    isSubmitting,
    error: submitError,
  } = usePipelineSubmit();
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

  return (
    <div
      className={`mv-root mv-${mode} mv-theme-${t.theme} mv-density-${t.density} mv-layout-${t.layout}${stage === "workbench" || isTemplatePlayer ? " mv-root--player" : ""}`}
      data-theme={t.theme}
      style={css}
    >
      <GlobalTopbarShell collapsed={effectiveTopbarCollapsed}>
        <GlobalTopbar
          stage={stage}
          appEdition="self"
          isProviderConfigured={isConfigured}
          onNavigate={navigate}
          isDark={mode === "dark"}
          onToggleTheme={toggleTheme}
          onOpenProviderSettings={() => setProviderModalOpen(true)}
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
            />
          }
        />
        <Route
          path="/run/:runId"
          element={
            <ErrorBoundary theme={mode}>
              <StudioPage
                appEdition="self"
                runId={activeRunId}
                t={t}
                onNavigate={navigate}
                isProviderConfigured={isConfigured}
                providerSettings={providerSettings}
                onOpenProviderSettings={() => setProviderModalOpen(true)}
                onResubmitPrompt={(prompt) => void handleResubmitPrompt(prompt)}
                onEditPrompt={handleEditPrompt}
                topbarCollapsed={effectiveTopbarCollapsed}
                onToggleTopbar={() => setTopbarCollapsed((value) => !value)}
              />
            </ErrorBoundary>
          }
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
          element={
            <ErrorBoundary theme={mode}>
              <HistoryPage
                t={t}
                onOpenInWorkbench={handleOpenHistoryRun}
              />
            </ErrorBoundary>
          }
        />
        <Route
          path="/settings"
          element={
            <ErrorBoundary theme={mode}>
              <SettingsPage
                appEdition="self"
                providerSettings={providerSettings}
                onUpdateProvider={updateProvider}
                tweaks={t}
                setTweak={setTweak}
              />
            </ErrorBoundary>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {providerModalOpen && (
        <ProviderSettingsModal
          initial={providerSettings}
          onSave={updateProvider}
          onClose={() => setProviderModalOpen(false)}
        />
      )}
    </div>
  );
}
