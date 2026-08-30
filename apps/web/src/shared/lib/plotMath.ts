/**
 * plotMath — small pure helpers shared by the Remotion `MathPlotRenderer` and
 * the interactive Math Widget for laying out a Cartesian plot.
 */

/** Format a tick / coordinate value compactly (≤ 3 decimals, exp for extremes). */
export function fmtNum(v: number, scale?: number): string {
  if (!Number.isFinite(v)) return "";
  if (v === 0) return "0";
  const a = Math.abs(v);
  // Evaluating a curve at its own zero leaves float residue — vᵧ(t)=v₀sinθ−gt
  // at the apex came out as -3.09e-11 and the marker label proudly showed
  // "-3.1e-11" in a lesson video. Against the axis it is drawn on, anything
  // that many orders of magnitude below the span is zero, not a small number.
  if (scale != null && Number.isFinite(scale) && a < Math.abs(scale) * 1e-9) return "0";
  if (a >= 1e4 || a < 1e-3) return v.toExponential(1);
  return String(Math.round(v * 1000) / 1000);
}

/**
 * "Nice" round tick values across `[lo, hi]` — roughly `target` of them,
 * snapped to multiples of 1/2/5 × 10ⁿ. Returns `[]` for a degenerate range.
 */
export function niceTicks(lo: number, hi: number, target = 8): number[] {
  const span = hi - lo;
  if (!(span > 0) || !Number.isFinite(span)) return [];
  const rawStep = span / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const fuzz = step * 1e-6;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + fuzz; v += step) {
    out.push(Math.abs(v) < fuzz ? 0 : v);
  }
  return out;
}

/**
 * Robust auto y-bounds for a set of y-samples: trims outliers (asymptotes) by
 * taking the 2nd/98th percentiles. Returns `[-10, 10]` when there is no data.
 */
export function autoYBounds(ys: readonly number[]): [number, number] {
  const finite = ys.filter((y) => Number.isFinite(y));
  if (!finite.length) return [-10, 10];
  const sorted = [...finite].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
  let lo = at(0.02);
  let hi = at(0.98);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  return [lo, hi];
}

/**
 * Pad a `[lo, hi]` range by `frac` on each side and pull the zero line into
 * frame when the range sits entirely above or below it.
 */
export function padRange(lo: number, hi: number, frac = 0.1): [number, number] {
  let a = lo;
  let b = hi;
  if (a > 0) a = 0;
  if (b < 0) b = 0;
  const pad = (b - a || 1) * frac;
  return [a - pad, b + pad];
}
