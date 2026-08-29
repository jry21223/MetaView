import type { MathSceneObjectDiff } from "./diff";
import { isAdded, isPersisted } from "./diff";

/**
 * Frames a newly added object takes to finish its draw-in (2.2s at 30fps).
 * Entrances run on this fixed clock, not the narration's: a 30-second
 * voiceover must not stretch an axis or a rectangle across 30 seconds.
 */
export const MATH_SCENE_ENTRANCE_FRAMES = 66;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function objectProgress(
  key: string,
  diff: MathSceneObjectDiff,
  stepProgress: number,
): number {
  if (isPersisted(key, diff)) return 1;
  if (isAdded(key, diff)) return clamp01(stepProgress);
  return 0;
}

export function shouldRenderObject(
  key: string,
  diff: MathSceneObjectDiff,
): boolean {
  return isPersisted(key, diff) || isAdded(key, diff);
}
