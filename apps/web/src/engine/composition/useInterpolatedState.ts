import { spring, interpolate, useCurrentFrame } from "remotion";
import type { AlgorithmArraySnapshot, AnySnapshot } from "../types";

export function useStepProgress(stepStartFrame: number, stepEndFrame: number): number {
  const frame = useCurrentFrame();
  const duration = Math.max(1, stepEndFrame - stepStartFrame);
  const elapsed = Math.max(0, frame - stepStartFrame);
  return spring({
    frame: elapsed,
    fps: 30,
    config: { stiffness: 100, damping: 20, mass: 1 },
    durationInFrames: duration,
  });
}

export function interpolateNumber(from: number, to: number, progress: number): number {
  return interpolate(progress, [0, 1], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

export function useArrayCellOpacity(frame: number, stepStartFrame: number, cellIndex: number): number {
  return spring({
    frame: Math.max(0, frame - stepStartFrame - cellIndex * 2),
    fps: 30,
    config: { stiffness: 120, damping: 18 },
  });
}

export function interpolateArraySnapshot(
  prev: AlgorithmArraySnapshot | null,
  next: AlgorithmArraySnapshot,
  progress: number
): AlgorithmArraySnapshot {
  if (!prev) return next;
  return {
    ...next,
    // Interpolate pointer positions for smooth arrow movement
    pointers: Object.fromEntries(
      Object.entries(next.pointers).map(([key, val]) => {
        const prevVal = prev.pointers[key] ?? val;
        return [key, Math.round(interpolateNumber(prevVal, val, progress))];
      })
    ),
  };
}

export function interpolateSnapshot(
  prev: AnySnapshot | null,
  next: AnySnapshot,
  progress: number
): AnySnapshot {
  if (!prev || prev.kind !== next.kind) return next;
  if (next.kind === "algorithm_array") {
    return interpolateArraySnapshot(
      prev.kind === "algorithm_array" ? prev : null,
      next,
      progress
    );
  }
  return next;
}
