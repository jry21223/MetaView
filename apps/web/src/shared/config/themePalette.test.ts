import { describe, expect, it } from "vitest";
import { PALETTE_TO_CSS_VAR, THEME_PALETTE, type ThemePalette } from "./themePalette";
import { themeVars, TWEAK_DEFAULTS } from "../../features/studio-editor/hooks/useTweaks";

describe("THEME_PALETTE (issue #56)", () => {
  it("provides matching keys for dark and light themes", () => {
    expect(Object.keys(THEME_PALETTE.dark).sort()).toEqual(
      Object.keys(THEME_PALETTE.light).sort(),
    );
  });

  it.each(["dark", "light"] as const)(
    "every PALETTE_TO_CSS_VAR entry matches themeVars(%s)",
    (theme) => {
      const vars = themeVars({ ...TWEAK_DEFAULTS, theme });
      const palette = THEME_PALETTE[theme];
      for (const [key, cssName] of Object.entries(PALETTE_TO_CSS_VAR)) {
        expect(vars[cssName], `themeVars(${theme})[${cssName}]`).toBe(
          palette[key as keyof ThemePalette],
        );
      }
    },
  );

  it("uses an explicit hex+alpha format for accent-soft so SSR matches the browser", () => {
    // Catches the previous drift: BarBlockRenderer used rgba(...,0.30) while
    // themeVars set accent + '26' (~0.15 alpha). Both paths must now agree.
    expect(THEME_PALETTE.dark.accentSoft).toMatch(/^#[0-9a-f]{8}$/i);
    expect(THEME_PALETTE.light.accentSoft).toMatch(/^#[0-9a-f]{8}$/i);
  });
});
