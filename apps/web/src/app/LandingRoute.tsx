import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import {
  TWEAK_DEFAULTS,
  themeMode,
  themeVars,
  useTweaks,
} from "../features/studio-editor/hooks/useTweaks";
import { LandingPage } from "../pages/Landing/LandingPage";
import type { AppEdition } from "../shared/config/constants";
import { THEME_PALETTE } from "../shared/config/themePalette";
import { useVisualViewportHeight } from "../shared/hooks/useVisualViewportHeight";

export function LandingRoute({ appEdition }: { appEdition: AppEdition }) {
  useVisualViewportHeight();

  const navigate = useNavigate();
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const mode = themeMode(t);
  const landingTheme = mode;
  const css = useMemo(
    () =>
      themeVars({
        ...t,
        theme: landingTheme,
        accent: THEME_PALETTE[landingTheme].accent,
      }),
    [landingTheme, t],
  );

  const toggleTheme = () =>
    setTweak("theme", mode === "dark" ? "light" : "dark");

  return (
    <div
      className={`mv-root mv-${mode} mv-theme-${landingTheme} mv-density-${t.density}`}
      data-theme={landingTheme}
      style={css}
    >
      <LandingPage
        appEdition={appEdition}
        isDark={mode === "dark"}
        onToggleTheme={toggleTheme}
        onStart={() => navigate("/create")}
        onOpenTemplates={() => navigate("/templates")}
      />
    </div>
  );
}
