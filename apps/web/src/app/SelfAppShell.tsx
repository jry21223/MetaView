import { useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "../shared/ui/ErrorBoundary";
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
import { useProviderSettings } from "../features/providers/hooks/useProviderSettings";
import { ProviderSettingsModal } from "../features/providers/ui/ProviderSettingsModal";
import {
  GlobalTopbar,
  GlobalTopbarShell,
  type Stage,
} from "../shared/ui/GlobalTopbar";

export function SelfAppShell() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [stage, setStage] = useState<Stage>("intake");
  const [topbarCollapsed, setTopbarCollapsed] = useState(false);
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [openedRunId, setOpenedRunId] = useState<string | null>(null);
  const {
    submit,
    runId,
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
  const effectiveTopbarCollapsed = stage === "workbench" && topbarCollapsed;
  const toggleTheme = () =>
    setTweak("theme", mode === "dark" ? "light" : "dark");
  const navigate = (nextStage: Stage) => {
    if (nextStage !== "workbench") setTopbarCollapsed(false);
    setStage(nextStage);
  };

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
    domain?: string | null,
    sourceCode?: string,
    language?: string,
  ) => {
    await submit({
      prompt,
      domain,
      sourceCode,
      language,
      provider: isConfigured ? providerSettings : undefined,
    });
  };

  const handleSubmit = async (ctx: IntakeContext) => {
    setOpenedRunId(null);
    await submitWithProvider(
      ctx.raw || ctx.title,
      ctx.domain,
      ctx.sourceCode,
      ctx.language,
    );
    setStage("workbench");
  };

  const handleUseTemplate = async (prompt: string) => {
    setOpenedRunId(null);
    await submitWithProvider(prompt, null);
    setStage("workbench");
  };

  const handleOpenHistoryRun = (historyRunId: string) => {
    setOpenedRunId(historyRunId);
    setStage("workbench");
  };

  return (
    <div
      className={`mv-root mv-${mode} mv-theme-${t.theme} mv-density-${t.density} mv-layout-${t.layout}`}
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
            appEdition="self"
            runId={openedRunId ?? runId}
            t={t}
            onNavigate={navigate}
            isProviderConfigured={isConfigured}
            providerSettings={providerSettings}
            onOpenProviderSettings={() => setProviderModalOpen(true)}
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
            appEdition="self"
            providerSettings={providerSettings}
            onUpdateProvider={updateProvider}
            tweaks={t}
            setTweak={setTweak}
          />
        </ErrorBoundary>
      )}

      <TweaksPanel t={t} setTweak={setTweak} />

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
