import { clamp01 } from "./animation";

/**
 * Description of when a Layer is visible inside a step's progress window.
 *
 * `enter_at` and `exit_at` are normalised to [0, 1] of the surrounding step,
 * letting LLM output stay resolution-independent (it picks no frame counts).
 * `appear_anim` is a hint for the renderer; it does not alter visibility.
 */
export interface LayerTiming {
  enter_at: number;
  exit_at: number;
  appear_anim?: "fade" | "draw" | "slide" | "scale" | "none";
}

export interface TimelineSlice {
  /** Whether the layer should be mounted at all. */
  visible: boolean;
  /** 0..1 progress *inside* the layer's [enter_at, exit_at] window. */
  progress: number;
  /** True while the layer is in the first 20% of its window. */
  entering: boolean;
  /** True while the layer is in the last 20% of its window. */
  exiting: boolean;
  /** Echoed for renderer use. */
  anim: NonNullable<LayerTiming["appear_anim"]>;
}

const DEFAULT_TIMING: LayerTiming = { enter_at: 0, exit_at: 1, appear_anim: "fade" };

/**
 * Compute a TimelineSlice for a layer given the step's overall progress.
 *
 * This is a pure function (not a React hook despite the `use*` naming) so the
 * caller can invoke it inside a list without violating Rules of Hooks. The
 * `use*` prefix is kept for grep-friendliness alongside the other foundation
 * helpers — see useTheme / useViewport.
 */
export function useTimeline(
  timing: LayerTiming | undefined,
  stepProgress: number,
): TimelineSlice {
  const t = normaliseTiming(timing);
  const span = Math.max(0.0001, t.exit_at - t.enter_at);
  const rawProgress = (clamp01(stepProgress) - t.enter_at) / span;
  const visible = stepProgress >= t.enter_at && stepProgress <= t.exit_at;
  const progress = clamp01(rawProgress);
  return {
    visible,
    progress,
    entering: visible && progress < 0.2,
    exiting: visible && progress > 0.8,
    anim: t.appear_anim ?? "fade",
  };
}

/**
 * Ensure timing is well-formed: swap out-of-order bounds, clamp into [0, 1],
 * fill missing animation hint.
 */
export function normaliseTiming(timing: LayerTiming | undefined): LayerTiming {
  if (!timing) return DEFAULT_TIMING;
  const lo = clamp01(Math.min(timing.enter_at, timing.exit_at));
  const hi = clamp01(Math.max(timing.enter_at, timing.exit_at));
  return {
    enter_at: lo,
    exit_at: hi === lo ? Math.min(1, lo + 0.0001) : hi,
    appear_anim: timing.appear_anim ?? "fade",
  };
}
