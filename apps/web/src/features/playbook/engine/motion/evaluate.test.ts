import { describe, expect, it } from "vitest";
import { evaluateCamera, evaluateTrack, resolveObjectState } from "./evaluate";
import type { MotionTrack } from "./types";

describe("motion evaluator", () => {
  it("returns 0 for an empty track", () => {
    const track: MotionTrack = {
      target: "triangle",
      property: "opacity",
      keyframes: [],
    };

    expect(evaluateTrack(track, 0.5)).toBe(0);
  });

  it("holds boundary values outside the keyframe range", () => {
    const track: MotionTrack = {
      target: "formula",
      property: "opacity",
      keyframes: [
        { t: 0.25, value: 0 },
        { t: 0.75, value: 1 },
      ],
      easing: "linear",
    };

    expect(evaluateTrack(track, 0)).toBe(0);
    expect(evaluateTrack(track, 1)).toBe(1);
  });

  it("interpolates linearly between surrounding keyframes", () => {
    const track: MotionTrack = {
      target: "square",
      property: "scale",
      keyframes: [
        { t: 0, value: 1 },
        { t: 1, value: 3 },
      ],
      easing: "linear",
    };

    expect(evaluateTrack(track, 0.5)).toBeCloseTo(2);
  });

  it("sorts keyframes without requiring callers to pre-sort them", () => {
    const track: MotionTrack = {
      target: "square",
      property: "x",
      keyframes: [
        { t: 1, value: 100 },
        { t: 0, value: 0 },
      ],
      easing: "linear",
    };

    expect(evaluateTrack(track, 0.25)).toBeCloseTo(25);
  });

  it("keeps an object stable when it has no matching tracks", () => {
    const state = resolveObjectState("triangle", [
      {
        target: "formula",
        property: "opacity",
        keyframes: [{ t: 1, value: 0 }],
      },
    ], 0.5);

    expect(state).toEqual({
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      rotate: 0,
      drawProgress: 1,
      highlight: 0,
    });
  });

  it("resolves multiple tracks on one object independently", () => {
    const tracks: MotionTrack[] = [
      {
        target: "formula",
        property: "opacity",
        keyframes: [
          { t: 0, value: 0 },
          { t: 1, value: 1 },
        ],
        easing: "linear",
      },
      {
        target: "formula",
        property: "scale",
        keyframes: [
          { t: 0, value: 0.8 },
          { t: 1, value: 1.2 },
        ],
        easing: "linear",
      },
    ];

    const state = resolveObjectState("formula", tracks, 0.5);

    expect(state.opacity).toBeCloseTo(0.5);
    expect(state.scale).toBeCloseTo(1);
  });

  it("uses the camera fallback when no camera track is provided", () => {
    expect(evaluateCamera(undefined, 0.5, { x: 480, y: 270, zoom: 1 })).toEqual({
      x: 480,
      y: 270,
      zoom: 1,
    });
  });

  it("interpolates camera keyframes", () => {
    const camera = evaluateCamera({
      keyframes: [
        { t: 0, x: 0, y: 0, zoom: 1 },
        { t: 1, x: 100, y: 50, zoom: 2 },
      ],
      easing: "linear",
    }, 0.5, { x: 480, y: 270, zoom: 1 });

    expect(camera).toEqual({ x: 50, y: 25, zoom: 1.5 });
  });
});
