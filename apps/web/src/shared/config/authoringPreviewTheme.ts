import { PALETTE_TO_CSS_VAR, THEME_PALETTE, type ThemePalette } from "./themePalette";

/** Local preview host defaults. Roles follow DESIGN.md; renderer colors share the main palette. */
export const AUTHORING_PREVIEW_VARS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(PALETTE_TO_CSS_VAR).map(([key, variable]) => [variable, THEME_PALETTE.light[key as keyof ThemePalette]])),
  "--bg": "#f4f1ea",
  "--surface": "#ffffff",
  "--accent-contrast": THEME_PALETTE.light.ink,
  "--radius": "12px",
  "--radius-sm": "8px",
  "--shell-time": "180ms",
  "--exploration-time": "780ms",
  "--selection-cycle": "3600ms",
};
