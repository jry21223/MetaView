import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "../../features/account";
import { WeChatLoginDialog } from "../../features/account/ui/WeChatLoginDialog";
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
  return import.meta.env.VITE_APP_EDITION === "ops"
    ? <OpsTeachingDeckRoute />
    : <TeachingDeckRouteBody canGenerateDynamic />;
}

function OpsTeachingDeckRoute() {
  const { account, status } = useAccount();
  const [loginOpen, setLoginOpen] = useState(false);
  const isLoggedIn = status === "authenticated" && account?.login_provider === "wechat";

  return (
    <>
      <TeachingDeckRouteBody
        canGenerateDynamic={isLoggedIn}
        onRequireLogin={() => setLoginOpen(true)}
      />
      {loginOpen && <WeChatLoginDialog onClose={() => setLoginOpen(false)} />}
    </>
  );
}

function TeachingDeckRouteBody({
  canGenerateDynamic,
  onRequireLogin,
}: {
  canGenerateDynamic: boolean;
  onRequireLogin?: () => void;
}) {
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
        canGenerateDynamic={canGenerateDynamic}
        onRequireLogin={onRequireLogin}
      />
    </div>
  );
}
