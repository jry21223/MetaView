import { describe, expect, it } from "vitest";
import { useViewport } from "./useViewport";

describe("useViewport", () => {
  it("uses explicit bounds when provided", () => {
    const v = useViewport({ xMin: -2, xMax: 2, yMin: 0, yMax: 4 });
    expect(v.xMin).toBe(-2);
    expect(v.xMax).toBe(2);
    expect(v.yMin).toBe(0);
    expect(v.yMax).toBe(4);
  });

  it("auto-bounds y from samples when yMin/yMax omitted", () => {
    const v = useViewport({ xMin: 0, xMax: 10, ySamples: [1, 5, 7, 3] });
    expect(v.yMin).toBeLessThanOrEqual(1);
    expect(v.yMax).toBeGreaterThanOrEqual(7);
  });

  it("falls back to safe defaults on degenerate input", () => {
    const v = useViewport({ xMin: 5, xMax: 5 });
    expect(v.xMax).toBeGreaterThan(v.xMin);
    expect(v.yMax).toBeGreaterThan(v.yMin);
  });

  it("toPixelX maps domain endpoints to width endpoints", () => {
    const v = useViewport({ xMin: 0, xMax: 10, yMin: 0, yMax: 1 });
    expect(v.toPixelX(0, 100)).toBe(0);
    expect(v.toPixelX(10, 100)).toBe(100);
    expect(v.toPixelX(5, 100)).toBe(50);
  });

  it("toPixelY inverts y axis", () => {
    const v = useViewport({ xMin: 0, xMax: 1, yMin: 0, yMax: 10 });
    // y=0 (bottom of data) should map to the bottom (pixelHeight)
    expect(v.toPixelY(0, 100)).toBe(100);
    expect(v.toPixelY(10, 100)).toBe(0);
  });

  it("produces tick arrays for both axes", () => {
    const v = useViewport({ xMin: 0, xMax: 10, yMin: -5, yMax: 5 });
    expect(v.xTicks.length).toBeGreaterThan(2);
    expect(v.yTicks.length).toBeGreaterThan(2);
  });
});
