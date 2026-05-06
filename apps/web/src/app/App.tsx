import React, { useState, useMemo } from 'react';
import { useTweaks, themeVars, TWEAK_DEFAULTS } from '../features/studio-editor/hooks/useTweaks';
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
      className={`mv-root mv-${t.theme} mv-density-${t.density} mv-layout-${t.layout}`}
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
          onToggleTheme={() => setTweak('theme', t.theme === 'dark' ? 'light' : 'dark')}
        />
      )}

      {stage === 'workbench' && (
        <StudioPage
          runId={runId}
          t={t}
          setTweak={setTweak}
          onNavigate={setStage}
          isProviderConfigured={isConfigured}
          onOpenProviderSettings={openProviderSettings}
        />
      )}

      {stage === 'history' && (
        <HistoryPage
          t={t}
          setTweak={setTweak}
          onNavigate={setStage}
          isProviderConfigured={isConfigured}
          onOpenProviderSettings={openProviderSettings}
        />
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
