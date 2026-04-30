import React, { useState, useMemo } from 'react';
import { useTweaks, themeVars, TWEAK_DEFAULTS } from '../features/studio-editor/hooks/useTweaks';
import { IntakeScreen, IntakeContext } from '../features/studio-editor/ui/IntakeScreen';
import { TweaksPanel } from '../features/studio-editor/ui/TweaksPanel';
import { StudioPage } from '../pages/Studio/StudioPage';
import { HistoryPage } from '../pages/History/HistoryPage';
import { usePipelineSubmit } from '../features/pipeline/hooks/usePipelineSubmit';
import { useProviderSettings } from '../features/providers/hooks/useProviderSettings';
import { ProviderSettingsModal } from '../features/providers/ui/ProviderSettingsModal';

type Stage = 'intake' | 'workbench' | 'history';

export function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [stage, setStage] = useState<Stage>('intake');
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const { submit, runId, isSubmitting, error: submitError } = usePipelineSubmit();
  const { settings: providerSettings, update: updateProvider, isConfigured } = useProviderSettings();

  const css = useMemo(() => themeVars(t), [t]);

  const handleSubmit = async (ctx: IntakeContext) => {
    await submit(
      ctx.raw || ctx.title,
      ctx.sourceCode,
      undefined,
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
          onOpenProviderSettings={() => setProviderModalOpen(true)}
          onHistory={() => setStage('history')}
        />
      )}

      {stage === 'workbench' && (
        <StudioPage
          runId={runId}
          t={t}
          setTweak={setTweak}
          onHome={() => setStage('intake')}
          onHistory={() => setStage('history')}
        />
      )}

      {stage === 'history' && (
        <HistoryPage
          t={t}
          setTweak={setTweak}
          onHome={() => setStage('intake')}
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
