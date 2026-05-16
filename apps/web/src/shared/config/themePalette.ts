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
}

const DEFAULT_ACCENT = "#10b981";

export const THEME_PALETTE: Record<"dark" | "light", ThemePalette> = {
  dark: {
    surface2: "#0e1412",
    ink: "#e8efe9",
    ink2: "#9ba8a0",
    ink3: "#5b6862",
    line: "#1d2a23",
    line2: "#27332c",
    accent: DEFAULT_ACCENT,
    accentSoft: `${DEFAULT_ACCENT}26`, // 15% alpha to match themeVars exactly
    warn: "#e9a23b",
  },
  light: {
    surface2: "#faf8f3",
    ink: "#161a18",
    ink2: "#5d655f",
    ink3: "#9aa39d",
    line: "#e6e2d5",
    line2: "#d6d1c2",
    accent: DEFAULT_ACCENT,
    accentSoft: `${DEFAULT_ACCENT}26`,
    warn: "#e9a23b",
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
};
