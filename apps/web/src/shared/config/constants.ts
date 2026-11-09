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

export const RECHARGE_USAGE_ESTIMATE = {
  RUNS_PER_YUAN: 10,
  UNIT_LABEL: "基础生成",
} as const;

const SUBTITLE_MAX_LINES = 3;
const SUBTITLE_FONT_SIZE = 14;
const SUBTITLE_LINE_HEIGHT = 1.5;
const SUBTITLE_PADDING_Y = 8;
const SUBTITLE_BORDER_TOP = 1;

export const PLAYBOOK_LAYOUT = {
  /** Fraction of width allocated to the viz panel when code track is present (0–1) */
  VIZ_SPLIT_RATIO: 0.5,
  /** Height in px of the lesson progress strip that sits on top of the subtitle row. */
  PROGRESS_STRIP_HEIGHT: 3,
  /** Maximum number of subtitle lines before truncating with ellipsis. */
  SUBTITLE_MAX_LINES,
  /** Subtitle text size in px; with LINE_HEIGHT it fixes one line box (21px). */
  SUBTITLE_FONT_SIZE,
  SUBTITLE_LINE_HEIGHT,
  /** Vertical padding of the subtitle row in px. */
  SUBTITLE_PADDING_Y,
  SUBTITLE_BORDER_TOP,
  /** Fixed border-box height of the subtitle row in px: always MAX_LINES
   *  tall, whatever the narration length. A row that grew with the text
   *  shrank the flex:1 visual track, so centred renderers jumped between
   *  steps. Export and the in-browser player share this composition. */
  SUBTITLE_HEIGHT:
    SUBTITLE_MAX_LINES * SUBTITLE_FONT_SIZE * SUBTITLE_LINE_HEIGHT +
    2 * SUBTITLE_PADDING_Y +
    SUBTITLE_BORDER_TOP,
  /** Frames for subtitle fade-in at the start of each step */
  SUBTITLE_FADE_FRAMES: 12,
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
