export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export type AppEdition = "self" | "ops";

export const APP_EDITION: AppEdition =
  import.meta.env.VITE_APP_EDITION === "ops" ? "ops" : "self";

export const PLAYBOOK_DEFAULTS = {
  FPS: 30,
  STEP_FRAMES: 60,
  COMPOSITION_WIDTH: 960,
  COMPOSITION_HEIGHT: 540,
  INITIAL_PREVIEW_FRAME: 18,
} as const;

export const PLAYBOOK_LAYOUT = {
  /** Fraction of width allocated to the viz panel when code track is present (0–1) */
  VIZ_SPLIT_RATIO: 0.5,
  /** Minimum height of the subtitle bar in px (within the composition canvas).
   *  The actual row grows up to MAX_LINES * line-height when narration wraps. */
  SUBTITLE_HEIGHT: 52,
  /** Maximum number of subtitle lines before truncating with ellipsis. */
  SUBTITLE_MAX_LINES: 3,
  /** Frames for subtitle fade-in at the start of each step */
  SUBTITLE_FADE_FRAMES: 6,
} as const;

/**
 * Math-plot rendering knobs. Pulled out of MathPlotRenderer (issue #63)
 * so they're configurable from one place — bumping CURVE_SAMPLES sharpens
 * curves at the cost of polyline size; the export pipeline can override
 * these per-render in the future.
 */
export const MATH_PLOT = {
  /** Points sampled along each curve across [x_min, x_max]. */
  CURVE_SAMPLES: 360,
} as const;
