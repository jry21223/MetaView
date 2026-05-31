import { describe, expect, it } from "vitest";
import { triangleScene } from "./fixtures";
import {
  expandViewBoxToMinSize,
  interpolateViewBox,
  viewBoxFromBounds,
  viewBoxFromSnapshot,
  viewBoxHeight,
  viewBoxWidth,
  type CameraViewBox,
} from "./camera";

describe("math-scene-plan camera", () => {
  it("creates a viewBox from snapshot ranges", () => {
    expect(viewBoxFromSnapshot(triangleScene)).toEqual({
      x: [-1, 7],
      y: [-1, 4],
    });
  });

  it("creates a padded viewBox from bounds that contains the target", () => {
    const viewBox = viewBoxFromBounds(
      { xMin: 0, xMax: 2, yMin: 1, yMax: 3 },
      { x: [-10, 10], y: [-10, 10] },
      0.25,
    );

    expect(viewBox.x[0]).toBeLessThanOrEqual(0);
    expect(viewBox.x[1]).toBeGreaterThanOrEqual(2);
    expect(viewBox.y[0]).toBeLessThanOrEqual(1);
    expect(viewBox.y[1]).toBeGreaterThanOrEqual(3);
  });

  it("interpolates viewBoxes at progress 0, 0.5, and 1", () => {
    const from: CameraViewBox = { x: [0, 10], y: [0, 10] };
    const to: CameraViewBox = { x: [2, 6], y: [-2, 8] };

    expect(interpolateViewBox(from, to, 0)).toEqual(from);
    expect(interpolateViewBox(from, to, 0.5)).toEqual({
      x: [1, 8],
      y: [-1, 9],
    });
    expect(interpolateViewBox(from, to, 1)).toEqual(to);
  });

  it("reports viewBox dimensions", () => {
    const viewBox: CameraViewBox = { x: [-1, 7], y: [-2, 4] };

    expect(viewBoxWidth(viewBox)).toBe(8);
    expect(viewBoxHeight(viewBox)).toBe(6);
  });

  it("expands a viewBox to a minimum size around its center", () => {
    expect(expandViewBoxToMinSize({ x: [2, 4], y: [3, 4] }, 6, 5)).toEqual({
      x: [0, 6],
      y: [1, 6],
    });
  });
});
