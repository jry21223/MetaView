import { describe, expect, it } from "vitest";
import { diffMathSceneObjects, type MathSceneObjectDiff } from "./diff";
import { trianglePlusSquareScene, triangleScene } from "./fixtures";
import { pointKey, segmentKey } from "./identity";
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

  it("applies progress semantics to a real math scene diff", () => {
    const forward = diffMathSceneObjects(triangleScene, trianglePlusSquareScene);
    const backward = diffMathSceneObjects(trianglePlusSquareScene, triangleScene);
    const persistedPointKey = pointKey(triangleScene.points[0]);
    const addedSegmentKey = segmentKey(trianglePlusSquareScene.segments[3]);

    expect(objectProgress(persistedPointKey, forward, 0.25)).toBe(1);
    expect(objectProgress(addedSegmentKey, forward, 0.25)).toBe(0.25);
    expect(shouldRenderObject(addedSegmentKey, forward)).toBe(true);

    expect(objectProgress(addedSegmentKey, backward, 0.25)).toBe(0);
    expect(shouldRenderObject(addedSegmentKey, backward)).toBe(false);
  });
});
