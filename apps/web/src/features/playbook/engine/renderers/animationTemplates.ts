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
// SWAP: lift → translate → drop
// ─────────────────────────────────────────────────────────────────

export const SWAP_PHASES: readonly AnimPhase[] = [
  { name: "lift", frames: 14, easing: ENTER_BEZIER },
  { name: "translate", frames: 18, easing: SETTLE_BEZIER },
  { name: "drop", frames: 14, easing: ENTER_BEZIER },
] as const;

export interface SwapMotion {
  translateX: number;
  translateY: number;
  scale: number;
  shadowOpacity: number;
  zIndex: number;
}

export function swapMotion(
  elapsed: number,
  dx: number,
  cellHeight: number,
  arcDirection: 1 | -1 = 1,
): SwapMotion {
  // arcDirection = 1 → arcs upward (over); -1 → arcs downward (under)
  const liftHeight = cellHeight * 0.55 * arcDirection;
  // translateY: 0 → -liftHeight (lift) → -liftHeight (translate) → 0 (drop)
  const translateY = interpolatePhases(elapsed, SWAP_PHASES, [
    0,
    -liftHeight,
    -liftHeight,
    0,
  ]);
  // translateX: dx → dx (lift) → 0 (translate) → 0 (drop)
  const translateX = interpolatePhases(elapsed, SWAP_PHASES, [dx, dx, 0, 0]);
  // scale: 1 → 1.08 (lift) → 1.08 (translate) → 1 (drop)
  const scale = interpolatePhases(elapsed, SWAP_PHASES, [1, 1.08, 1.08, 1]);
  // shadow: 0 → 0.45 → 0.45 → 0
  const shadowOpacity = interpolatePhases(elapsed, SWAP_PHASES, [
    0, 0.45, 0.45, 0,
  ]);
  // zIndex high while lifted; collapse back at end
  const absLift = Math.abs(liftHeight);
  const liftRatio = absLift > 0 ? -translateY / absLift : 0;
  const zIndex = Math.round(Math.abs(liftRatio) * 10) * arcDirection;
  return { translateX, translateY, scale, shadowOpacity, zIndex };
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
