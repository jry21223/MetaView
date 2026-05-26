import { clamp01, ease } from "./easing";
import type {
  CameraState,
  CameraTrack,
  MotionTrack,
  ResolvedMotionObjectState,
} from "./types";

const DEFAULT_OBJECT_STATE: ResolvedMotionObjectState = {
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
  rotate: 0,
  drawProgress: 1,
  highlight: 0,
};

interface NumericKeyframe {
  t: number;
  value: number;
}

function sortedKeyframes<T extends { t: number }>(keyframes: T[]): T[] {
  return [...keyframes].sort((a, b) => a.t - b.t);
}

function evaluateNumberKeyframes(
  keyframes: NumericKeyframe[],
  progress: number,
  easing: MotionTrack["easing"],
): number {
  const frames = sortedKeyframes(keyframes);
  if (frames.length === 0) return 0;

  const p = clamp01(progress);
  if (p <= frames[0].t) return frames[0].value;
  if (p >= frames[frames.length - 1].t) return frames[frames.length - 1].value;

  for (let i = 0; i < frames.length - 1; i += 1) {
    const a = frames[i];
    const b = frames[i + 1];
    if (p >= a.t && p <= b.t) {
      const local = (p - a.t) / Math.max(0.0001, b.t - a.t);
      const eased = ease(local, easing ?? "easeInOut");
      return a.value + (b.value - a.value) * eased;
    }
  }

  return frames[frames.length - 1].value;
}

export function evaluateTrack(track: MotionTrack, progress: number): number {
  return evaluateNumberKeyframes(track.keyframes, progress, track.easing);
}

export function resolveObjectState(
  objectId: string,
  tracks: MotionTrack[],
  progress: number,
): ResolvedMotionObjectState {
  const state: ResolvedMotionObjectState = { ...DEFAULT_OBJECT_STATE };

  for (const track of tracks) {
    if (track.target !== objectId) continue;
    state[track.property] = evaluateTrack(track, progress);
  }

  return state;
}

export function evaluateCamera(
  camera: CameraTrack | undefined,
  progress: number,
  fallback: CameraState,
): CameraState {
  if (!camera || camera.keyframes.length === 0) return fallback;

  const frames = sortedKeyframes(camera.keyframes);
  const p = clamp01(progress);

  if (p <= frames[0].t) {
    return { x: frames[0].x, y: frames[0].y, zoom: frames[0].zoom };
  }

  const last = frames[frames.length - 1];
  if (p >= last.t) return { x: last.x, y: last.y, zoom: last.zoom };

  for (let i = 0; i < frames.length - 1; i += 1) {
    const a = frames[i];
    const b = frames[i + 1];
    if (p >= a.t && p <= b.t) {
      const local = (p - a.t) / Math.max(0.0001, b.t - a.t);
      const eased = ease(local, camera.easing ?? "easeInOut");
      return {
        x: a.x + (b.x - a.x) * eased,
        y: a.y + (b.y - a.y) * eased,
        zoom: a.zoom + (b.zoom - a.zoom) * eased,
      };
    }
  }

  return { x: last.x, y: last.y, zoom: last.zoom };
}
