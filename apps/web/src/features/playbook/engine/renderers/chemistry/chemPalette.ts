import { THEME_PALETTE } from "../../../../../shared/config/themePalette";
import type { ChemTint, ChemTone } from "../../kits/chemistry/sceneTypes";
import { elementColor, mixHex } from "../../kits/chemistry/elements";

/**
 * Chemistry renderer palette.
 *
 * Structure and emphasis come from the shared semantic tokens (DESIGN.md
 * §5.4) as `var(--token, fallback)`, so named workspace themes recolour the
 * scene and the Remotion export — where no CSS variables exist — falls back
 * to the same `THEME_PALETTE` values. Element and solution colours carry
 * chemical meaning and are named constants here and in `elements.ts`.
 */

export interface ChemPalette {
  theme: "light" | "dark";
  /** Plain hex of the stage surface, for mixing depth fog into atom colours. */
  surfaceHex: string;
  surface: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  line2: string;
  primary: string;
  secondary: string;
  focus: string;
  grid: string;
  axis: string;
  glass: string;
  glassFill: string;
  plate: string;
}

export function chemPalette(theme: "light" | "dark"): ChemPalette {
  const p = THEME_PALETTE[theme];
  return {
    theme,
    surfaceHex: p.surface2,
    surface: `var(--surface-2, ${p.surface2})`,
    ink: `var(--ink, ${p.ink})`,
    ink2: `var(--ink-2, ${p.ink2})`,
    ink3: `var(--ink-3, ${p.ink3})`,
    line: `var(--line, ${p.line})`,
    line2: `var(--line-2, ${p.line2})`,
    primary: `var(--canvas-primary, ${p.canvasPrimary})`,
    secondary: `var(--canvas-secondary, ${p.canvasSecondary})`,
    focus: `var(--canvas-focus, ${p.canvasFocus})`,
    grid: `var(--canvas-grid, ${p.canvasGrid})`,
    axis: `var(--canvas-axis, ${p.canvasAxis})`,
    glass: `var(--ink-3, ${p.ink3})`,
    glassFill: theme === "dark" ? "rgba(232,239,233,0.035)" : "rgba(22,26,24,0.025)",
    plate: `var(--surface-2, ${p.surface2})`,
  };
}

export function toneColor(palette: ChemPalette, tone: ChemTone | null | undefined): string {
  switch (tone) {
    case "primary":
      return palette.primary;
    case "secondary":
      return palette.secondary;
    case "focus":
      return palette.focus;
    case "muted":
      return palette.ink2;
    default:
      return palette.ink;
  }
}

/** Solution and indicator hues (chemical meaning, not branding). */
const TINT_HEX: Record<Exclude<ChemTint["hue"], "none">, { light: string; dark: string }> = {
  blue: { light: "#3f86c9", dark: "#5c9ede" },
  green: { light: "#7fae6a", dark: "#95c47f" },
  pink: { light: "#e0619d", dark: "#ee7fb2" },
  red: { light: "#d2463d", dark: "#e5675c" },
  orange: { light: "#e38b33", dark: "#efa352" },
  yellow: { light: "#e2bd3a", dark: "#ecca55" },
};

/** A colourless solution (water, NaOH titrant): a faint cool grey so the liquid still reads as liquid. */
const CLEAR_SOLUTION_HEX = { light: "#9fb8c4", dark: "#9fb0a8" };

export function clearSolutionColor(palette: ChemPalette): string {
  return CLEAR_SOLUTION_HEX[palette.theme];
}

/** Fill for a liquid: the tint hue at a strength-dependent opacity. */
export function tintFill(palette: ChemPalette, tint: ChemTint): { color: string; opacity: number } {
  if (tint.hue === "none" || tint.strength <= 0) {
    return { color: clearSolutionColor(palette), opacity: 0.12 };
  }
  const hex = TINT_HEX[tint.hue][palette.theme];
  return { color: hex, opacity: 0.14 + 0.5 * Math.max(0, Math.min(1, tint.strength)) };
}

export interface SphereColors {
  base: string;
  highlight: string;
  shade: string;
  rim: string;
}

/**
 * Sphere shading for an element, fogged toward the stage surface by depth
 * (0 = farthest, 1 = nearest) so the back of a molecule recedes.
 */
export function sphereColors(palette: ChemPalette, element: string, depth = 1): SphereColors {
  const fog = (1 - Math.max(0, Math.min(1, depth))) * 0.32;
  const base = mixHex(elementColor(element, palette.theme), palette.surfaceHex, fog);
  return {
    base,
    highlight: mixHex(base, "#ffffff", palette.theme === "dark" ? 0.42 : 0.62),
    shade: mixHex(base, "#000000", palette.theme === "dark" ? 0.38 : 0.3),
    rim: mixHex(base, "#000000", palette.theme === "dark" ? 0.5 : 0.42),
  };
}
