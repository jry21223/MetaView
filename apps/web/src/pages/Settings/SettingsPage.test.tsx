import { cleanup, fireEvent, render, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TWEAK_DEFAULTS } from "../../features/studio-editor/hooks/useTweaks";
import { THEME_PALETTE } from "../../shared/config/themePalette";
import { SettingsPage } from "./SettingsPage";

function renderSettingsPage(overrides: Partial<React.ComponentProps<typeof SettingsPage>> = {}) {
  const props: React.ComponentProps<typeof SettingsPage> = {
    appEdition: "ops",
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

  it("shows local TTS provider settings in self edition", () => {
    const { getByText, getByLabelText } = renderSettingsPage({
      appEdition: "self",
      providerSettings: {
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        routerMode: "hybrid",
        routerModel: "",
        routerMinConfidence: 0.72,
        routerTimeoutS: 12,
      },
      onUpdateProvider: vi.fn(),
    });

    expect(getByText("本地 TTS 配置")).toBeTruthy();
    expect(getByLabelText("TTS API 密钥")).toBeTruthy();
    expect(getByLabelText("TTS 接口地址")).toBeTruthy();
    expect(getByLabelText("TTS 模型")).toBeTruthy();
  });

  it("shows platform-managed TTS in ops edition without local key fields", () => {
    const { getByText, queryByLabelText } = renderSettingsPage({
      appEdition: "ops",
    });

    expect(getByText("平台托管 TTS")).toBeTruthy();
    expect(queryByLabelText("TTS API 密钥")).toBeNull();
    expect(queryByLabelText("TTS 接口地址")).toBeNull();
    expect(queryByLabelText("TTS 模型")).toBeNull();
  });
});
