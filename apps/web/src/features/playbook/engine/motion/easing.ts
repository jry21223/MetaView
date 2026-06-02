import type { MotionEasing } from "./types";

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function ease(t: number, type: MotionEasing = "easeInOut"): number {
  const x = clamp01(t);
  switch (type) {
    case "linear":
      return x;
    case "easeOut":
      return 1 - (1 - x) ** 3;
    case "easeInOut":
      return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
    case "spring":
      return 1 - Math.cos(x * Math.PI * 2.5) * Math.exp(-5 * x);
  }
}
