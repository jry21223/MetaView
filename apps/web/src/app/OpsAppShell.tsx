import React, { useMemo, useState } from 'react';
import { ErrorBoundary } from '../shared/ui/ErrorBoundary';
import { useAccount } from '../features/account';
import { RechargeModal } from '../features/account/ui/RechargeModal';
import { useTweaks, themeVars, themeMode, TWEAK_DEFAULTS } from '../features/studio-editor/hooks/useTweaks';
import { IntakeScreen, IntakeContext } from '../features/studio-editor/ui/IntakeScreen';
import { TweaksPanel } from '../features/studio-editor/ui/TweaksPanel';
import { StudioPage } from '../pages/Studio/StudioPage';
import { HistoryPage } from '../pages/History/HistoryPage';
import { TemplatesPage } from '../pages/Templates/TemplatesPage';
import { SettingsPage } from '../pages/Settings/SettingsPage';
import { usePipelineSubmit } from '../features/pipeline/hooks/usePipelineSubmit';
import type { Stage } from '../shared/ui/GlobalTopbar';

export function OpsAppShell() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [stage, setStage] = useState<Stage>('intake');
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [openedRunId, setOpenedRunId] = useState<string | null>(null);
  const { submit, runId, isSubmitting, error: submitError } = usePipelineSubmit();
  const { account, refresh: refreshAccount } = useAccount();
  const accountAvatarUrl = account?.avatar_url ?? null;

  const css = useMemo(() => themeVars(t), [t]);
  const mode = themeMode(t);
  const toggleTheme = () => setTweak('theme', mode === 'dark' ? 'light' : 'dark');
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
    await submitWithPlatformProvider(ctx.raw || ctx.title, ctx.sourceCode, ctx.language);
    setStage('workbench');
  };

  const handleUseTemplate = async (prompt: string) => {
    setOpenedRunId(null);
    await submitWithPlatformProvider(prompt);
    setStage('workbench');
  };

  const handleOpenHistoryRun = (historyRunId: string) => {
    setOpenedRunId(historyRunId);
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

      {stage === 'workbench' && (
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

      {stage === 'history' && (
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

      {stage === 'templates' && (
        <ErrorBoundary theme={mode}>
          <TemplatesPage
            appEdition="ops"
            isDark={mode === 'dark'}
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

      {stage === 'settings' && (
        <ErrorBoundary theme={mode}>
          <SettingsPage
            appEdition="ops"
            isDark={mode === 'dark'}
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
