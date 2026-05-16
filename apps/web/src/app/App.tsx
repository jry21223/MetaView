import React, { useState, useMemo } from 'react';
import { ErrorBoundary } from '../shared/ui/ErrorBoundary';
import { useTweaks, themeVars, themeMode, TWEAK_DEFAULTS } from '../features/studio-editor/hooks/useTweaks';
import { IntakeScreen, IntakeContext } from '../features/studio-editor/ui/IntakeScreen';
import { TweaksPanel } from '../features/studio-editor/ui/TweaksPanel';
import { StudioPage } from '../pages/Studio/StudioPage';
import { HistoryPage } from '../pages/History/HistoryPage';
import { usePipelineSubmit } from '../features/pipeline/hooks/usePipelineSubmit';
import { useProviderSettings } from '../features/providers/hooks/useProviderSettings';
import { ProviderSettingsModal } from '../features/providers/ui/ProviderSettingsModal';
import type { Stage } from '../shared/ui/GlobalTopbar';

export function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [stage, setStage] = useState<Stage>('intake');
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const { submit, runId, isSubmitting, error: submitError } = usePipelineSubmit();
  const { settings: providerSettings, update: updateProvider, isConfigured } = useProviderSettings();

  const css = useMemo(() => themeVars(t), [t]);
  const mode = themeMode(t);
  const openProviderSettings = () => setProviderModalOpen(true);

  const handleSubmit = async (ctx: IntakeContext) => {
    await submit(
      ctx.raw || ctx.title,
      ctx.sourceCode,
      ctx.language,
      isConfigured ? providerSettings : undefined,
    );
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
          onSubmit={handleSubmit}
          t={t}
          isSubmitting={isSubmitting}
          submitError={submitError}
          isProviderConfigured={isConfigured}
          onOpenProviderSettings={openProviderSettings}
          onNavigate={setStage}
          onToggleTheme={() => setTweak('theme', mode === 'dark' ? 'light' : 'dark')}
        />
      )}

      {stage === 'workbench' && (
        <ErrorBoundary theme={mode}>
          <StudioPage
            runId={runId}
            t={t}
            setTweak={setTweak}
            onNavigate={setStage}
            isProviderConfigured={isConfigured}
            onOpenProviderSettings={openProviderSettings}
          />
        </ErrorBoundary>
      )}

      {stage === 'history' && (
        <ErrorBoundary theme={mode}>
          <HistoryPage
            t={t}
            setTweak={setTweak}
            onNavigate={setStage}
            isProviderConfigured={isConfigured}
            onOpenProviderSettings={openProviderSettings}
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
