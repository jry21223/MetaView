import { describe, expect, it } from "vitest";
import type { MathSceneSnapshot, MetaStep } from "../types";
import {
  mathScenePointKey,
  mathSceneSegmentKey,
  previousMathSceneIdentitySets,
  progressForIdentity,
} from "./mathSceneIdentity";

describe("mathSceneIdentity", () => {
  it("creates stable point keys for equal points", () => {
    expect(
      mathScenePointKey({ x: 1, y: 2, label: "A", emphasis: "primary" }),
    ).toBe(
      mathScenePointKey({ x: 1, y: 2, label: "A", emphasis: "accent" }),
    );
  });

  it("creates different segment keys when geometry changes", () => {
    const a = mathSceneSegmentKey({
      x0: 0,
      y0: 0,
      x1: 1,
      y1: 1,
      arrow: false,
      label: "s",
    });
    const b = mathSceneSegmentKey({
      x0: 0,
      y0: 0,
      x1: 2,
      y1: 1,
      arrow: false,
      label: "s",
    });
    expect(a).not.toBe(b);
  });

  it("collects previous math_scene identities", () => {
    const snapshot: MathSceneSnapshot = {
      kind: "math_scene",
      x_min: -1,
      x_max: 1,
      y_min: -1,
      y_max: 1,
      x_label: "x",
      y_label: "y",
      points: [{ x: 0, y: 0, label: "O" }],
      segments: [{ x0: 0, y0: 0, x1: 1, y1: 0, label: "a" }],
      regions: [],
      curves: [],
      annotations: [],
    };
    const step = {
      step_id: "step_01",
      end_frame: 30,
      title: "test",
      voiceover_text: "",
      snapshot,
      tokens: [],
    } satisfies MetaStep;
    const sets = previousMathSceneIdentitySets(step);
    expect(sets.points.size).toBe(1);
    expect(sets.segments.size).toBe(1);
  });

  it("returns full progress for previous objects", () => {
    const previous = new Set(["object:a"]);
    expect(progressForIdentity("object:a", previous, 0.2)).toBe(1);
    expect(progressForIdentity("object:b", previous, 0.2)).toBe(0.2);
  });
});
