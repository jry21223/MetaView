import { renderHook, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { THEME_PALETTE } from "../../../shared/config/themePalette";
import { TWEAK_DEFAULTS, themeVars, useTweaks } from "./useTweaks";

describe("useTweaks", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("sanitizes corrupted persisted tweaks before applying CSS variables", () => {
    localStorage.setItem(
      "mv_tweaks",
      JSON.stringify({
        theme: "light",
        accent: "#fff; --ink: #fff",
        layout: "sideways",
        leftRatio: 999,
        paramsHeight: -5,
        chatHeight: "huge",
        density: "massive",
        showHistoryDock: "yes",
        swapFrames: 999,
      }),
    );

    const { result } = renderHook(() => useTweaks(TWEAK_DEFAULTS));
    const tweaks = result.current[0];

    expect(tweaks).toMatchObject({
      theme: "light",
      accent: THEME_PALETTE.light.accent,
      layout: TWEAK_DEFAULTS.layout,
      leftRatio: TWEAK_DEFAULTS.leftRatio,
      paramsHeight: TWEAK_DEFAULTS.paramsHeight,
      chatHeight: TWEAK_DEFAULTS.chatHeight,
      density: TWEAK_DEFAULTS.density,
      showHistoryDock: TWEAK_DEFAULTS.showHistoryDock,
      swapFrames: TWEAK_DEFAULTS.swapFrames,
    });
    expect(themeVars(tweaks)["--accent"]).toBe(THEME_PALETTE.light.accent);
    expect(themeVars(tweaks)["--accent-contrast"]).toBe("#0b0f0d");
    expect(
      themeVars({ ...tweaks, accent: "#111111" })["--accent-contrast"],
    ).toBe("#ffffff");
  });
});
