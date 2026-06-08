import { cleanup, fireEvent, render, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TWEAK_DEFAULTS } from "../../features/studio-editor/hooks/useTweaks";
import { THEME_PALETTE } from "../../shared/config/themePalette";
import { SettingsPage } from "./SettingsPage";

function renderSettingsPage(overrides: Partial<React.ComponentProps<typeof SettingsPage>> = {}) {
  const props: React.ComponentProps<typeof SettingsPage> = {
    appEdition: "ops",
    isDark: true,
    isProviderConfigured: true,
    onNavigate: vi.fn(),
    onToggleTheme: vi.fn(),
    onOpenProviderSettings: vi.fn(),
    tweaks: TWEAK_DEFAULTS,
    setTweak: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<SettingsPage {...props} />),
    props,
  };
}

describe("SettingsPage appearance controls", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders all named themes as a two-column preview grid", () => {
    const { getByRole } = renderSettingsPage();

    const group = getByRole("group", { name: "主题" });
    expect(group.className).toContain("mv-settings-theme-grid");
    expect(group.querySelectorAll(".mv-settings-theme-card")).toHaveLength(Object.keys(THEME_PALETTE).length);
    expect(
      Array.from(group.querySelectorAll(".mv-settings-theme-name")).map((el) => el.textContent),
    ).toEqual(Object.values(THEME_PALETTE).map((theme) => theme.label));
  });

  it("updates the selected theme from a preview card", () => {
    const setTweak = vi.fn();
    const { getByRole } = renderSettingsPage({ setTweak });

    fireEvent.click(within(getByRole("group", { name: "主题" })).getByRole("button", { name: /Nord/ }));

    expect(setTweak).toHaveBeenCalledWith("theme", "nord");
  });

  it("keeps the accent color in settings", () => {
    const setTweak = vi.fn();
    const { getByLabelText } = renderSettingsPage({ setTweak });

    fireEvent.change(getByLabelText("强调色"), { target: { value: "#ff0055" } });

    expect(setTweak).toHaveBeenCalledWith("accent", "#ff0055");
  });
});
