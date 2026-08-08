import { describe, expect, it } from "vitest";
import {
  PALETTE_TO_CSS_VAR,
  THEME_PALETTE,
  THEME_TYPE,
  type ThemeName,
  type ThemePalette,
} from "../../../shared/config/themePalette";
import { themeVars, themeMode, TWEAK_DEFAULTS } from "./useTweaks";

const THEME_NAMES = Object.keys(THEME_PALETTE) as ThemeName[];

describe("THEME_PALETTE (issue #56)", () => {
  it("every theme exposes the same field set", () => {
    const reference = Object.keys(THEME_PALETTE.dark).sort();
    for (const name of THEME_NAMES) {
      expect(Object.keys(THEME_PALETTE[name]).sort()).toEqual(reference);
    }
  });

  it.each(THEME_NAMES)(
    "every PALETTE_TO_CSS_VAR entry matches themeVars(%s)",
    (theme) => {
      const vars = themeVars({
        ...TWEAK_DEFAULTS,
        theme,
        accent: THEME_PALETTE[theme].accent,
      });
      const palette = THEME_PALETTE[theme];
      for (const [key, cssName] of Object.entries(PALETTE_TO_CSS_VAR)) {
        if (key === "canvasPrimary") {
          expect(vars[cssName]).toBe(THEME_PALETTE[theme].accent);
          continue;
        }
        expect(vars[cssName], `themeVars(${theme})[${cssName}]`).toBe(
          palette[key as keyof ThemePalette],
        );
      }
    },
  );

  it("uses an explicit hex+alpha format for accent-soft so SSR matches the browser", () => {
    for (const name of THEME_NAMES) {
      expect(THEME_PALETTE[name].accentSoft, `${name}.accentSoft`).toMatch(
        /^#[0-9a-f]{8}$/i,
      );
    }
  });

  it("publishes explicit canvas roles for every theme", () => {
    for (const name of THEME_NAMES) {
      const palette = THEME_PALETTE[name];
      expect(palette.canvasGrid).toBeTruthy();
      expect(palette.canvasAxis).toBeTruthy();
      expect(palette.canvasPrimary).toBeTruthy();
      expect(palette.canvasSecondary).toBeTruthy();
      expect(palette.canvasFocus).toBeTruthy();
    }
  });
});

describe("Named themes (issue #12)", () => {
  it("ships at least the four required themes", () => {
    for (const name of ["dark", "light", "monokai", "nord"] as const) {
      expect(THEME_PALETTE[name], `theme ${name} should exist`).toBeDefined();
    }
  });

  it("each theme declares a usable type", () => {
    for (const name of THEME_NAMES) {
      const mode = themeMode({ ...TWEAK_DEFAULTS, theme: name });
      expect(mode === "dark" || mode === "light").toBe(true);
      expect(mode).toBe(THEME_TYPE[name]);
    }
  });

  it("monokai's signature pink is preserved", () => {
    expect(THEME_PALETTE.monokai.accent.toLowerCase()).toBe("#f92672");
  });

  it("nord's primary blue is preserved", () => {
    expect(THEME_PALETTE.nord.accent.toLowerCase()).toBe("#88c0d0");
  });
});
