import { autoYBounds, niceTicks, padRange } from "../../../../shared/lib/plotMath";

/**
 * Pure helpers that take coordinate ranges + a tick-target and emit the
 * cooked information every plot/scene renderer needs: padded bounds, nice
 * tick positions, and a scale function from data → pixel space.
 *
 * Today's renderers each call these in slightly different orders; this hook
 * unifies them so Phase 3 SceneCompositor / future layer renderers reuse one
 * code path.
 */
export interface ViewportFrame {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xTicks: number[];
  yTicks: number[];
  /** Convert data x → SVG x in the given pixel width. */
  toPixelX: (x: number, pixelWidth: number, originX?: number) => number;
  /** Convert data y → SVG y in the given pixel height (inverted Y axis). */
  toPixelY: (y: number, pixelHeight: number, originY?: number) => number;
}

export interface ViewportOptions {
  xMin: number;
  xMax: number;
  /** Provide either explicit yMin/yMax, or ySamples to auto-bound. */
  yMin?: number;
  yMax?: number;
  ySamples?: readonly number[];
  /** Symmetric padding fraction applied to the y range when auto-bounding. */
  yPadFraction?: number;
  /** Target tick count for each axis; renderer can override. */
  xTickTarget?: number;
  yTickTarget?: number;
}

/**
 * Pure function (despite the use* prefix) — safe to call inside a render
 * map without violating Rules of Hooks.
 */
export function useViewport(opts: ViewportOptions): ViewportFrame {
  const xMin = Number.isFinite(opts.xMin) ? opts.xMin : -5;
  const xMax = Number.isFinite(opts.xMax) && opts.xMax > xMin ? opts.xMax : xMin + 10;

  let yMin = opts.yMin ?? -5;
  let yMax = opts.yMax ?? 5;
  if (opts.ySamples && opts.ySamples.length > 0 && (opts.yMin == null || opts.yMax == null)) {
    const [lo, hi] = padRange(...autoYBounds(opts.ySamples), opts.yPadFraction ?? 0.1);
    yMin = opts.yMin ?? lo;
    yMax = opts.yMax ?? hi;
  }
  if (!(yMax > yMin)) yMax = yMin + 1;

  const xTicks = niceTicks(xMin, xMax, opts.xTickTarget ?? 8);
  const yTicks = niceTicks(yMin, yMax, opts.yTickTarget ?? 7);

  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;

  return {
    xMin,
    xMax,
    yMin,
    yMax,
    xTicks,
    yTicks,
    toPixelX: (x, pixelWidth, originX = 0) => originX + ((x - xMin) / xSpan) * pixelWidth,
    toPixelY: (y, pixelHeight, originY = 0) => originY + pixelHeight - ((y - yMin) / ySpan) * pixelHeight,
  };
}
