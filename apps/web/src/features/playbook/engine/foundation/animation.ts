/**
 * Pure animation utilities shared by every Layer / Renderer.
 *
 * The foundation layer holds only side-effect-free helpers — no React hooks,
 * no DOM access — so it can be reused in Remotion render passes, in vitest
 * unit tests, and in static SSR.
 */

/** Clamp a number into the unit interval [0, 1]. */
export function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Clamp into an arbitrary [lo, hi] window. */
export function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/** Smooth ease-in-out (cubic). */
export function easeInOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Cubic ease-out for "release on contact" animations. */
export function easeOut(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

/**
 * Linear opacity ramp: 0 before `start`, ramps to 1 over `duration` frames.
 * Replaces the ubiquitous `clamp01((elapsed - start) / duration)` idiom.
 */
export function fadeRamp(elapsed: number, start: number, duration: number): number {
  if (duration <= 0) return elapsed >= start ? 1 : 0;
  return clamp01((elapsed - start) / duration);
}

/**
 * Lightweight spring approximation that does not depend on Remotion's runtime
 * (so it works inside non-Remotion vitest tests and in pure-function reuse).
 * Output is in the [0, 1] range and saturates after ~`fps`*`config.damping/40`
 * frames. For exact Remotion parity callers should still use `spring()` from
 * `remotion` — this is the easy default for ad-hoc fades.
 */
export function springProgress(
  frame: number,
  fps: number,
  config: { stiffness?: number; damping?: number; mass?: number } = {},
): number {
  const stiffness = config.stiffness ?? 80;
  const damping = config.damping ?? 20;
  const mass = config.mass ?? 1;
  const omega = Math.sqrt(stiffness / mass) / fps;
  const decay = Math.exp((-damping / (2 * mass)) * (frame / fps));
  const t = clamp01(1 - decay * Math.cos(omega * frame));
  return easeOut(t);
}

/**
 * Returns the number of points along an ordered polyline that should be
 * "revealed" given a 0..1 progress value — useful for stroke-draw animation.
 */
export function clipReveal(totalPoints: number, progress: number): number {
  if (totalPoints <= 0) return 0;
  return Math.max(1, Math.round(totalPoints * clamp01(progress)));
}

/**
 * Linear interpolation. Mirrors Remotion's `interpolate(t, [0,1], [a,b])`
 * shape for the common 2-point case; cheaper for the unit interval.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}
