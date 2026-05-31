import { describe, expect, it } from "vitest";
import type { MathSceneObjectDiff } from "./diff";
import { objectProgress, shouldRenderObject } from "./progress";

const diff: MathSceneObjectDiff = {
  persisted: new Set(["persisted"]),
  added: new Set(["added"]),
  removed: new Set(["removed"]),
};

describe("math-scene-plan progress", () => {
  it("returns full progress for persisted objects", () => {
    expect(objectProgress("persisted", diff, 0.2)).toBe(1);
  });

  it("returns current step progress for added objects", () => {
    expect(objectProgress("added", diff, 0.2)).toBe(0.2);
  });

  it("clamps added object progress to 0..1", () => {
    expect(objectProgress("added", diff, -0.5)).toBe(0);
    expect(objectProgress("added", diff, 1.5)).toBe(1);
    expect(objectProgress("added", diff, Number.NaN)).toBe(0);
  });

  it("does not render removed or unknown objects", () => {
    expect(shouldRenderObject("persisted", diff)).toBe(true);
    expect(shouldRenderObject("added", diff)).toBe(true);
    expect(shouldRenderObject("removed", diff)).toBe(false);
    expect(shouldRenderObject("unknown", diff)).toBe(false);
    expect(objectProgress("removed", diff, 0.5)).toBe(0);
    expect(objectProgress("unknown", diff, 0.5)).toBe(0);
  });
});
