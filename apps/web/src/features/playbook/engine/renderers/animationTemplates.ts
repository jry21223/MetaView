import { Easing } from "remotion";
import {
  getPhaseState,
  interpolatePhases,
  type AnimPhase,
} from "../composition/useMultiPhaseAnimation";

const ENTER_BEZIER = Easing.bezier(0.16, 1, 0.3, 1);
const SETTLE_BEZIER = Easing.bezier(0.45, 0, 0.55, 1);
const POP_BEZIER = Easing.bezier(0.34, 1.56, 0.64, 1);

// ─────────────────────────────────────────────────────────────────
// SWAP: horizontal slide with cross-fade (no vertical lift)
//
// Bars stay glued to the baseline since their height already encodes
// the value; lifting them off would read as "the value changed".
// Cross-fade (opacity → 0.7 mid-flight) keeps the shorter bar visible
// while a taller bar slides over it.
// ─────────────────────────────────────────────────────────────────

export const SWAP_PHASES: readonly AnimPhase[] = [
  { name: "blendIn", frames: 4, easing: ENTER_BEZIER },
  { name: "translate", frames: 16, easing: SETTLE_BEZIER },
  { name: "blendOut", frames: 4, easing: ENTER_BEZIER },
] as const;

// Total frames of the default SWAP_PHASES.
// Mirrored by `TWEAK_DEFAULTS.swapFrames` in `useTweaks.ts` — keep in sync.
export const DEFAULT_SWAP_FRAMES = 24;

export interface SwapMotion {
  translateX: number;
  scale: number;
  opacity: number;
  shadowOpacity: number;
  zIndex: number;
}

/**
 * Scale SWAP_PHASES proportionally to a target total-frame count.
 * Lets the player feed a runtime-tweakable duration without changing the
 * relative weight of blendIn / translate / blendOut.
 */
export function scaleSwapPhases(
  totalFrames: number,
  base: readonly AnimPhase[] = SWAP_PHASES,
): readonly AnimPhase[] {
  const baseSum = base.reduce((s, p) => s + p.frames, 0);
  const ratio = totalFrames / baseSum;
  return base.map((p) => ({
    ...p,
    frames: Math.max(1, Math.round(p.frames * ratio)),
  }));
}

export function swapMotion(
  elapsed: number,
  dx: number,
  phases: readonly AnimPhase[] = SWAP_PHASES,
): SwapMotion {
  // translateX: dx → dx (blendIn) → 0 (translate) → 0 (blendOut)
  const translateX = interpolatePhases(elapsed, phases, [dx, dx, 0, 0]);
  // scale: 1 → 1.06 (blendIn) → 1.06 (translate) → 1 (blendOut)
  const scale = interpolatePhases(elapsed, phases, [1, 1.06, 1.06, 1]);
  // opacity: 1 → 0.7 (blendIn) → 0.7 (translate) → 1 (blendOut)
  const opacity = interpolatePhases(elapsed, phases, [1, 0.7, 0.7, 1]);
  // shadow: 0 → 0.35 → 0.35 → 0
  const shadowOpacity = interpolatePhases(elapsed, phases, [0, 0.35, 0.35, 0]);
  // zIndex bumped while sliding so swap pair sits above sorted / idle bars
  const total = phases.reduce((s, p) => s + p.frames, 0);
  const inFlight = elapsed > phases[0].frames && elapsed < total - phases[2].frames;
  return { translateX, scale, opacity, shadowOpacity, zIndex: inFlight ? 5 : 0 };
}

// ─────────────────────────────────────────────────────────────────
// SELECT (active): settle → breathe (loop)
// ─────────────────────────────────────────────────────────────────

const SELECT_SETTLE_FRAMES = 12;
const BREATH_PERIOD_FRAMES = 60;

export interface SelectMotion {
  translateY: number;
  scale: number;
  borderOpacity: number;
  shadowOpacity: number;
}

export function selectMotion(elapsed: number): SelectMotion {
  const settlePhase: AnimPhase = {
    name: "settle",
    frames: SELECT_SETTLE_FRAMES,
    easing: ENTER_BEZIER,
  };
  const settleState = getPhaseState([settlePhase], elapsed);
  const settleProgress = settleState.isComplete ? 1 : settleState.localProgress;
  const translateY = -4 * settleProgress;
  const scale = 1 + 0.02 * settleProgress;
  const borderOpacity = settleProgress;
  // Breathing: starts during settle ramp, dominates after
  const phaseRad = (elapsed * Math.PI * 2) / BREATH_PERIOD_FRAMES;
  const breathing = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(phaseRad));
  const shadowOpacity = breathing * settleProgress;
  return { translateY, scale, borderOpacity, shadowOpacity };
}

// ─────────────────────────────────────────────────────────────────
// WRITE (newly written value): drop-in overshoot → settle
// ─────────────────────────────────────────────────────────────────

export const WRITE_PHASES: readonly AnimPhase[] = [
  { name: "dropIn", frames: 12, easing: POP_BEZIER },
  { name: "settle", frames: 6, easing: SETTLE_BEZIER },
] as const;

export interface WriteMotion {
  scale: number;
  opacity: number;
}

export function writeMotion(elapsed: number): WriteMotion {
  const scale = interpolatePhases(elapsed, WRITE_PHASES, [0.6, 1.05, 1]);
  const opacity = interpolatePhases(elapsed, WRITE_PHASES, [0, 1, 1]);
  return { scale, opacity };
}
