import { describe, expect, it } from "vitest";
import type { MathSceneSnapshot } from "../types";
import { triangleScene } from "./fixtures";
import {
  boundsOfAnnotation,
  boundsOfPoint,
  boundsOfRegion,
  boundsOfScene,
  boundsOfSegment,
  emptyBounds,
  mergeBounds,
  padBounds,
} from "./bounds";

describe("math-scene-plan bounds", () => {
  it("returns null for empty bounds", () => {
    expect(emptyBounds()).toBeNull();
  });

  it("calculates point bounds", () => {
    expect(boundsOfPoint({ x: 1, y: 2, label: "P" })).toEqual({
      xMin: 1,
      xMax: 1,
      yMin: 2,
      yMax: 2,
    });
  });

  it("calculates segment bounds across x and y directions", () => {
    expect(boundsOfSegment({ x0: 3, y0: -1, x1: -2, y1: 5 })).toEqual({
      xMin: -2,
      xMax: 3,
      yMin: -1,
      yMax: 5,
    });
  });

  it("calculates region bounds from vertices", () => {
    expect(
      boundsOfRegion({
        vertices: [
          [2, 4],
          [-1, 3],
          [5, -2],
        ],
      }),
    ).toEqual({
      xMin: -1,
      xMax: 5,
      yMin: -2,
      yMax: 4,
    });
    expect(boundsOfRegion({ vertices: [] })).toBeNull();
  });

  it("calculates annotation bounds", () => {
    expect(boundsOfAnnotation({ x: 3, y: 4, text: "$x$" })).toEqual({
      xMin: 3,
      xMax: 3,
      yMin: 4,
      yMax: 4,
    });
  });

  it("merges bounds and ignores null inputs", () => {
    const a = { xMin: 0, xMax: 2, yMin: 0, yMax: 2 };
    const b = { xMin: -1, xMax: 1, yMin: 3, yMax: 4 };

    expect(mergeBounds(null, a)).toEqual(a);
    expect(mergeBounds(a, null)).toEqual(a);
    expect(mergeBounds(a, b)).toEqual({
      xMin: -1,
      xMax: 2,
      yMin: 0,
      yMax: 4,
    });
  });

  it("pads bounds and expands zero-size ranges", () => {
    expect(padBounds({ xMin: 0, xMax: 2, yMin: 0, yMax: 4 }, 0.25)).toEqual({
      xMin: -0.5,
      xMax: 2.5,
      yMin: -1,
      yMax: 5,
    });
    expect(padBounds({ xMin: 1, xMax: 1, yMin: 2, yMax: 2 }, 0.1)).toEqual({
      xMin: 0.9,
      xMax: 1.1,
      yMin: 1.9,
      yMax: 2.1,
    });
  });

  it("uses geometric bounds when scene objects are finite", () => {
    expect(boundsOfScene(triangleScene)).toEqual({
      xMin: 0,
      xMax: 4,
      yMin: 0,
      yMax: 3,
    });
  });

  it("uses snapshot viewport as fallback when curves exist or no objects exist", () => {
    const emptyScene: MathSceneSnapshot = {
      ...triangleScene,
      points: [],
      segments: [],
      regions: [],
      annotations: [],
    };
    const curveScene: MathSceneSnapshot = {
      ...emptyScene,
      curves: [{ expression_y: "x^2", label: "f" }],
    };

    expect(boundsOfScene(emptyScene)).toEqual({
      xMin: -1,
      xMax: 7,
      yMin: -1,
      yMax: 4,
    });
    expect(boundsOfScene(curveScene)).toEqual({
      xMin: -1,
      xMax: 7,
      yMin: -1,
      yMax: 4,
    });
  });
});
