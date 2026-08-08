import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import {
  TWEAK_DEFAULTS,
  type TweakValues,
} from "../features/studio-editor/hooks/useTweaks";
import { THEME_PALETTE } from "../shared/config/themePalette";
import { LandingRoute } from "./LandingRoute";

describe("LandingRoute", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.style.removeProperty("--mv-vvh");
  });

  it("keeps the persisted workbench theme when toggling the landing theme", () => {
    const persistedTweaks: TweakValues = {
      ...TWEAK_DEFAULTS,
      theme: "monokai",
      accent: THEME_PALETTE.monokai.accent,
    };
    localStorage.setItem("mv_tweaks", JSON.stringify(persistedTweaks));

    const { container, getByRole } = render(
      <MemoryRouter>
        <LandingRoute appEdition="self" />
      </MemoryRouter>,
    );

    expect(container.querySelector(".mv-root")?.getAttribute("data-theme")).toBe(
      "dark",
    );
    const root = container.querySelector<HTMLElement>(".mv-root");
    expect(root?.style.getPropertyValue("--landing-director-bg")).toBe(
      THEME_PALETTE.light.surface2,
    );
    expect(root?.style.getPropertyValue("--landing-director-ink")).toBe(
      THEME_PALETTE.light.ink,
    );
    expect(root?.style.getPropertyValue("--landing-director-line")).toBe(
      THEME_PALETTE.light.line2,
    );
    expect(root?.style.getPropertyValue("--landing-director-accent")).toBe(
      THEME_PALETTE.light.accent,
    );

    fireEvent.click(getByRole("button", { name: "切换主题" }));

    expect(container.querySelector(".mv-root")?.getAttribute("data-theme")).toBe(
      "light",
    );
    expect(root?.style.getPropertyValue("--landing-director-bg")).toBe(
      THEME_PALETTE.dark.surface2,
    );
    expect(root?.style.getPropertyValue("--landing-director-ink")).toBe(
      THEME_PALETTE.dark.ink,
    );
    expect(root?.style.getPropertyValue("--landing-director-line")).toBe(
      THEME_PALETTE.dark.line2,
    );
    expect(root?.style.getPropertyValue("--landing-director-accent")).toBe(
      THEME_PALETTE.dark.accent,
    );
    expect(JSON.parse(localStorage.getItem("mv_tweaks") ?? "{}").theme).toBe(
      "monokai",
    );
  });

  it("makes inactive story panels inert while keeping the active panel interactive", async () => {
    const { container, getByRole } = render(
      <MemoryRouter>
        <LandingRoute appEdition="self" />
      </MemoryRouter>,
    );

    const storyPanels = Array.from(
      container.querySelectorAll<HTMLElement>(
        ".mv-landing-story__track article[data-demo-domain]",
      ),
    );

    await waitFor(() => {
      expect(storyPanels).toHaveLength(3);
      expect(storyPanels.every((panel) => panel.hasAttribute("inert"))).toBe(
        true,
      );
    });

    fireEvent.click(getByRole("tab", { name: /数学/ }));

    await waitFor(() => {
      const mathPanel = container.querySelector<HTMLElement>(
        '.mv-landing-story__track article[data-demo-domain="math"]',
      );
      const hiddenPanels = storyPanels.filter(
        (panel) => panel.dataset.demoDomain !== "math",
      );

      expect(mathPanel?.getAttribute("aria-hidden")).toBe("false");
      expect(mathPanel?.hasAttribute("inert")).toBe(false);
      expect(hiddenPanels.every((panel) => panel.hasAttribute("inert"))).toBe(
        true,
      );
    });
  });
});
