import { useEffect, useMemo, useState } from "react";
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
import { consumePostLoginPath } from "./opsGuestAccess";

export function LandingRoute({ appEdition }: { appEdition: AppEdition }) {
  useVisualViewportHeight();

  const navigate = useNavigate();
  const [t] = useTweaks(TWEAK_DEFAULTS);
  const [landingTheme, setLandingTheme] = useState<"dark" | "light">(() =>
    themeMode(t),
  );
  const mode = landingTheme;

  useEffect(() => {
    if (appEdition !== "ops") return;
    const path = consumePostLoginPath();
    if (path) navigate(path, { replace: true });
  }, [appEdition, navigate]);
  const css = useMemo(
    () =>
      themeVars({
        ...t,
        theme: landingTheme,
        accent: THEME_PALETTE[landingTheme].accent,
      }),
    [landingTheme, t],
  );

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".mv-landing");
    if (!root) return;

    const syncHiddenStoryPanels = () => {
      root
        .querySelectorAll<HTMLElement>(
          ".mv-landing-story__track article[aria-hidden]",
        )
        .forEach((panel) => {
          panel.toggleAttribute(
            "inert",
            panel.getAttribute("aria-hidden") === "true",
          );
        });
    };

    syncHiddenStoryPanels();

    if (typeof MutationObserver === "undefined") {
      return () => {
        root
          .querySelectorAll<HTMLElement>(
            ".mv-landing-story__track article[inert]",
          )
          .forEach((panel) => panel.removeAttribute("inert"));
      };
    }

    const observer = new MutationObserver(syncHiddenStoryPanels);
    observer.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-hidden"],
    });

    return () => {
      observer.disconnect();
      root
        .querySelectorAll<HTMLElement>(
          ".mv-landing-story__track article[inert]",
        )
        .forEach((panel) => panel.removeAttribute("inert"));
    };
  }, []);

  const toggleTheme = () =>
    setLandingTheme((current) => (current === "dark" ? "light" : "dark"));

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
