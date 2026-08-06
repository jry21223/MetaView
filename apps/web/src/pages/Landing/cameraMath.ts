import type { FollowupCameraShot } from "./followupTimeline";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface FollowupDesiredCenter {
  x: number;
  y: number;
}

/** Desired camera center (CSS px) for a close-up shot on prompt or response. */
export function followupDesiredCenter(
  viewportWidth: number,
  viewportHeight: number,
  shot: Exclude<FollowupCameraShot, "wide">,
): FollowupDesiredCenter {
  return {
    x: viewportWidth * (shot === "prompt" ? 0.6 : 0.5),
    y: viewportHeight * 0.52,
  };
}

/** Clamp a pan offset so the camera never travels further than maxPan. */
export function clampPanOffset(
  desired: number,
  targetCenter: number,
  maxPan: number,
): number {
  return clamp(desired - targetCenter, -maxPan, maxPan);
}
