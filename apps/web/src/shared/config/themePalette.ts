/**
 * Single source of truth for the studio's CSS variable palette.
 *
 * Both ``themeVars`` in ``useTweaks.ts`` and the per-renderer ``FALLBACKS``
 * read from this object so the markup that ships to the browser (CSS-var
 * resolution) and the SSR / Remotion render path (fallback resolution) agree
 * on every color. Issue #56.
 *
 * To keep the palette importable from any feature without breaking FSD, this
 * lives under ``shared/config`` rather than ``features/studio-editor``.
 */
export interface ThemePalette {
  /** Background of the studio surface. Bound to ``--surface-2``. */
  surface2: string;
  /** Primary ink — high-contrast labels. Bound to ``--ink``. */
  ink: string;
  /** Secondary ink — sub-labels and axis ticks. Bound to ``--ink-2``. */
  ink2: string;
  /** Tertiary ink — captions and narration. Bound to ``--ink-3``. */
  ink3: string;
  /** Border / floor color. Bound to ``--line``. */
  line: string;
  /** Strong border — used as bar-base. Bound to ``--line-2``. */
  line2: string;
  /** Default accent (overridable per-user). Bound to ``--accent``. */
  accent: string;
  /** Accent-tinted soft halo. Bound to ``--accent-soft``. */
  accentSoft: string;
  /** Caution color. Bound to ``--warn``. */
  warn: string;
  /** Low-contrast learning-canvas grid. Bound to ``--canvas-grid``. */
  canvasGrid: string;
  /** Coordinate axes and structural connectors. Bound to ``--canvas-axis``. */
  canvasAxis: string;
  /** Primary knowledge curve / active path. Bound to ``--canvas-primary``. */
  canvasPrimary: string;
  /** Secondary comparison curve / visited state. Bound to ``--canvas-secondary``. */
  canvasSecondary: string;
  /** Current point, tangent, or selected object. Bound to ``--canvas-focus``. */
  canvasFocus: string;
}

const LIGHT_ACCENT = "#82976f";
const DARK_ACCENT = "#9fb48d";

/**
 * Identifier for every theme MetaView knows about. The pair "dark" / "light"
 * remains the default neutral set; the named themes (Monokai, Nord, Solarized)
 * are added in issue #12 to give users a richer choice without forcing every
 * renderer to learn a full palette object.
 */
export type ThemeName =
  | "dark"
  | "light"
  | "monokai"
  | "nord"
  | "solarized-dark"
  | "solarized-light";

/**
 * Whether a theme uses a dark or light background, used by every renderer
 * that gates colors on ``"dark" | "light"`` (Bar / Algorithm / Math). Keeps
 * the named-theme expansion non-breaking — renderers still see a binary.
 */
export const THEME_TYPE: Record<ThemeName, "dark" | "light"> = {
  dark: "dark",
  light: "light",
  monokai: "dark",
  nord: "dark",
  "solarized-dark": "dark",
  "solarized-light": "light",
};

export interface ThemeDescriptor extends ThemePalette {
  /** Human-readable display name. */
  label: string;
  /** Underlying ``"dark" | "light"`` mode for renderer color decisions. */
  type: "dark" | "light";
}

export const THEME_PALETTE: Record<ThemeName, ThemeDescriptor> = {
  dark: {
    label: "Dark",
    type: "dark",
    surface2: "#0e1412",
    ink: "#e8efe9",
    ink2: "#9ba8a0",
    ink3: "#5b6862",
    line: "#1d2a23",
    line2: "#27332c",
    accent: DARK_ACCENT,
    accentSoft: `${DARK_ACCENT}26`,
    warn: "#e9a23b",
    canvasGrid: "rgba(232,239,233,0.07)",
    canvasAxis: "rgba(232,239,233,0.5)",
    canvasPrimary: DARK_ACCENT,
    canvasSecondary: "#c3cdb9",
    canvasFocus: "#e9a23b",
  },
  light: {
    label: "Light",
    type: "light",
    surface2: "#faf8f3",
    ink: "#161a18",
    ink2: "#5d655f",
    ink3: "#9aa39d",
    line: "#e6e2d5",
    line2: "#d6d1c2",
    accent: LIGHT_ACCENT,
    accentSoft: `${LIGHT_ACCENT}26`,
    warn: "#e9a23b",
    canvasGrid: "rgba(22,26,24,0.07)",
    canvasAxis: "rgba(22,26,24,0.55)",
    canvasPrimary: LIGHT_ACCENT,
    canvasSecondary: "#65745a",
    canvasFocus: "#b87824",
  },
  monokai: {
    label: "Monokai",
    type: "dark",
    surface2: "#272822",
    ink: "#f8f8f2",
    ink2: "#cfcfc2",
    ink3: "#75715e",
    line: "#3e3d32",
    line2: "#49483e",
    accent: "#f92672",
    accentSoft: "#f9267226",
    warn: "#fd971f",
    canvasGrid: "rgba(248,248,242,0.08)",
    canvasAxis: "rgba(248,248,242,0.5)",
    canvasPrimary: "#a6e22e",
    canvasSecondary: "#66d9ef",
    canvasFocus: "#fd971f",
  },
  nord: {
    label: "Nord",
    type: "dark",
    surface2: "#2e3440",
    ink: "#eceff4",
    ink2: "#d8dee9",
    ink3: "#81a1c1",
    line: "#3b4252",
    line2: "#434c5e",
    accent: "#88c0d0",
    accentSoft: "#88c0d026",
    warn: "#ebcb8b",
    canvasGrid: "rgba(236,239,244,0.08)",
    canvasAxis: "rgba(236,239,244,0.5)",
    canvasPrimary: "#a3be8c",
    canvasSecondary: "#88c0d0",
    canvasFocus: "#ebcb8b",
  },
  "solarized-dark": {
    label: "Solarized Dark",
    type: "dark",
    surface2: "#002b36",
    ink: "#fdf6e3",
    ink2: "#93a1a1",
    ink3: "#586e75",
    line: "#073642",
    line2: "#0d4956",
    accent: "#268bd2",
    accentSoft: "#268bd226",
    warn: "#b58900",
    canvasGrid: "rgba(238,232,213,0.08)",
    canvasAxis: "rgba(238,232,213,0.5)",
    canvasPrimary: "#859900",
    canvasSecondary: "#2aa198",
    canvasFocus: "#b58900",
  },
  "solarized-light": {
    label: "Solarized Light",
    type: "light",
    surface2: "#fdf6e3",
    ink: "#073642",
    ink2: "#586e75",
    ink3: "#93a1a1",
    line: "#eee8d5",
    line2: "#e1dbbf",
    accent: "#268bd2",
    accentSoft: "#268bd226",
    warn: "#b58900",
    canvasGrid: "rgba(7,54,66,0.08)",
    canvasAxis: "rgba(7,54,66,0.5)",
    canvasPrimary: "#82976f",
    canvasSecondary: "#2aa198",
    canvasFocus: "#b58900",
  },
};

/**
 * Map each ``ThemePalette`` field to the CSS variable name that consumes it.
 * Tests use this to assert ``var(--name, fallback)`` strings reference the
 * matching palette entry.
 */
export const PALETTE_TO_CSS_VAR: Record<keyof ThemePalette, string> = {
  surface2: "--surface-2",
  ink: "--ink",
  ink2: "--ink-2",
  ink3: "--ink-3",
  line: "--line",
  line2: "--line-2",
  accent: "--accent",
  accentSoft: "--accent-soft",
  warn: "--warn",
  canvasGrid: "--canvas-grid",
  canvasAxis: "--canvas-axis",
  canvasPrimary: "--canvas-primary",
  canvasSecondary: "--canvas-secondary",
  canvasFocus: "--canvas-focus",
};
