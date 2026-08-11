import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePipelineSubmit } from "../../features/pipeline/hooks/usePipelineSubmit";
import { useProviderSettings } from "../../features/providers/hooks/useProviderSettings";
import {
  themeMode,
  themeVars,
  TWEAK_DEFAULTS,
  useTweaks,
} from "../../features/studio-editor/hooks/useTweaks";
import { useVisualViewportHeight } from "../../shared/hooks/useVisualViewportHeight";
import { TeachingDeckPage } from "./TeachingDeckPage";

export function TeachingDeckRoute() {
  useVisualViewportHeight();
  const navigate = useNavigate();
  const [t] = useTweaks(TWEAK_DEFAULTS);
  const css = useMemo(() => themeVars(t), [t]);
  const mode = themeMode(t);
  const { submit } = usePipelineSubmit();
  const {
    settings: providerSettings,
    isConfigured,
  } = useProviderSettings();

  const generateDynamicSlide = (prompt: string) =>
    submit({
      prompt,
      provider: isConfigured ? providerSettings : undefined,
    });

  return (
    <div
      className={`mv-root mv-${mode} mv-theme-${t.theme} mv-density-${t.density}`}
      data-theme={t.theme}
      style={css}
    >
      <TeachingDeckPage
        onGenerateDynamicSlide={generateDynamicSlide}
        onOpenRun={(runId) => navigate(`/run/${encodeURIComponent(runId)}`)}
      />
    </div>
  );
}
