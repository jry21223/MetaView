/**
 * Centralised palette + emphasis helpers shared by every renderer.
 *
 * Each renderer used to ship its own ad-hoc PALETTE table. Consolidating them
 * here gives one source of truth for "primary / secondary / accent" semantic
 * colors across math, algorithm, and tree layers. Renderers still pick which
 * fields they need.
 */

export type ThemeMode = "dark" | "light";
export type EmphasisLevel = "primary" | "secondary" | "accent";

export interface Palette {
  bg: string;
  plotBg: string;
  grid: string;
  axis: string;
  axisLabel: string;
  tick: string;
  text: string;
  narration: string;
  card: string;
  cardBorder: string;
  curvePrimary: readonly string[];
  curveSecondary: string;
  curveAccent: string;
  marker: string;
  markerGlow: string;
  shade: string;
  shadeStroke: string;
}

const DARK: Palette = {
  bg: "#0a0c10",
  plotBg: "rgba(255,255,255,0.02)",
  grid: "rgba(255,255,255,0.07)",
  axis: "rgba(255,255,255,0.32)",
  axisLabel: "rgba(232,236,244,0.7)",
  tick: "rgba(232,236,244,0.45)",
  text: "#e8ecf4",
  narration: "rgba(232,236,244,0.62)",
  card: "rgba(255,255,255,0.06)",
  cardBorder: "rgba(255,255,255,0.10)",
  curvePrimary: ["#4de8b0", "#7db8ff", "#ffd84d"],
  curveSecondary: "rgba(200,168,248,0.9)",
  curveAccent: "#ff9e8a",
  marker: "#ffd84d",
  markerGlow: "rgba(255,216,77,0.55)",
  shade: "rgba(77,232,176,0.20)",
  shadeStroke: "rgba(77,232,176,0.5)",
};

const LIGHT: Palette = {
  bg: "#f5f7fa",
  plotBg: "rgba(0,0,0,0.015)",
  grid: "rgba(0,0,0,0.08)",
  axis: "rgba(0,0,0,0.4)",
  axisLabel: "rgba(20,24,32,0.65)",
  tick: "rgba(20,24,32,0.5)",
  text: "#141820",
  narration: "rgba(20,24,32,0.6)",
  card: "rgba(0,0,0,0.04)",
  cardBorder: "rgba(0,0,0,0.10)",
  curvePrimary: ["#0a8f6e", "#2563c0", "#b07d00"],
  curveSecondary: "rgba(96,48,192,0.85)",
  curveAccent: "#c05030",
  marker: "#b07d00",
  markerGlow: "rgba(176,125,0,0.4)",
  shade: "rgba(10,143,110,0.16)",
  shadeStroke: "rgba(10,143,110,0.45)",
};

export interface ThemeResult {
  palette: Palette;
  isDark: boolean;
  /** Pick a color from the palette by emphasis level. */
  emphasis: (level: EmphasisLevel | string | undefined) => string;
}

/**
 * Returns palette + helpers for the given theme. Pure function (no React
 * state) so it works in SSR, in Remotion renders, and in unit tests.
 */
export function useTheme(mode: ThemeMode): ThemeResult {
  const palette = mode === "dark" ? DARK : LIGHT;
  return {
    palette,
    isDark: mode === "dark",
    emphasis: (level) => emphasisColor(palette, level),
  };
}

function emphasisColor(palette: Palette, level: EmphasisLevel | string | undefined): string {
  switch (level) {
    case "secondary":
      return palette.curveSecondary;
    case "accent":
      return palette.curveAccent;
    case "primary":
    default:
      return palette.curvePrimary[0];
  }
}
