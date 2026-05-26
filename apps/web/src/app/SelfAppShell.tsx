import React, { useMemo, useState } from 'react';
import { ErrorBoundary } from '../shared/ui/ErrorBoundary';
import { useTweaks, themeVars, themeMode, TWEAK_DEFAULTS } from '../features/studio-editor/hooks/useTweaks';
import { IntakeScreen, IntakeContext } from '../features/studio-editor/ui/IntakeScreen';
import { TweaksPanel } from '../features/studio-editor/ui/TweaksPanel';
import { StudioPage } from '../pages/Studio/StudioPage';
import { HistoryPage } from '../pages/History/HistoryPage';
import { TemplatesPage } from '../pages/Templates/TemplatesPage';
import { SettingsPage } from '../pages/Settings/SettingsPage';
import { usePipelineSubmit } from '../features/pipeline/hooks/usePipelineSubmit';
import { useProviderSettings } from '../features/providers/hooks/useProviderSettings';
import { ProviderSettingsModal } from '../features/providers/ui/ProviderSettingsModal';
import type { Stage } from '../shared/ui/GlobalTopbar';

function shouldOpenMotionDemo(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).has('motion-demo');
}

export function SelfAppShell() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [stage, setStage] = useState<Stage>(() => (shouldOpenMotionDemo() ? 'workbench' : 'intake'));
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const { submit, runId, isSubmitting, error: submitError } = usePipelineSubmit();
  const { settings: providerSettings, update: updateProvider, isConfigured } = useProviderSettings();

  const css = useMemo(() => themeVars(t), [t]);
  const mode = themeMode(t);
  const toggleTheme = () => setTweak('theme', mode === 'dark' ? 'light' : 'dark');

  const submitWithProvider = async (prompt: string, sourceCode?: string, language?: string) => {
    await submit(prompt, sourceCode, language, isConfigured ? providerSettings : undefined);
  };

  const handleSubmit = async (ctx: IntakeContext) => {
    await submitWithProvider(ctx.raw || ctx.title, ctx.sourceCode, ctx.language);
    setStage('workbench');
  };

  const handleUseTemplate = async (prompt: string) => {
    await submitWithProvider(prompt);
    setStage('workbench');
  };

  return (
    <div
      className={`mv-root mv-${mode} mv-theme-${t.theme} mv-density-${t.density} mv-layout-${t.layout}`}
      data-theme={t.theme}
      style={css}
    >
      {stage === 'intake' && (
        <IntakeScreen
          appEdition="self"
          onSubmit={handleSubmit}
          t={t}
          isSubmitting={isSubmitting}
          submitError={submitError}
          isProviderConfigured={isConfigured}
          onOpenProviderSettings={() => setProviderModalOpen(true)}
          onNavigate={setStage}
          onToggleTheme={toggleTheme}
        />
      )}

      {stage === 'workbench' && (
        <ErrorBoundary theme={mode}>
          <StudioPage
            appEdition="self"
            runId={runId}
            t={t}
            setTweak={setTweak}
            onNavigate={setStage}
            isProviderConfigured={isConfigured}
            onOpenProviderSettings={() => setProviderModalOpen(true)}
          />
        </ErrorBoundary>
      )}

      {stage === 'history' && (
        <ErrorBoundary theme={mode}>
          <HistoryPage
            appEdition="self"
            t={t}
            setTweak={setTweak}
            onNavigate={setStage}
            isProviderConfigured={isConfigured}
            onOpenProviderSettings={() => setProviderModalOpen(true)}
            onRerun={async (prompt) => {
              await submitWithProvider(prompt);
              setStage('workbench');
            }}
          />
        </ErrorBoundary>
      )}

      {stage === 'templates' && (
        <ErrorBoundary theme={mode}>
          <TemplatesPage
            appEdition="self"
            isDark={mode === 'dark'}
            isProviderConfigured={isConfigured}
            onNavigate={setStage}
            onToggleTheme={toggleTheme}
            onOpenProviderSettings={() => setProviderModalOpen(true)}
            onUseTemplate={handleUseTemplate}
          />
        </ErrorBoundary>
      )}

      {stage === 'settings' && (
        <ErrorBoundary theme={mode}>
          <SettingsPage
            appEdition="self"
            isDark={mode === 'dark'}
            isProviderConfigured={isConfigured}
            onNavigate={setStage}
            onToggleTheme={toggleTheme}
            onOpenProviderSettings={() => setProviderModalOpen(true)}
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
