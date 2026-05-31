import { describe, expect, it } from "vitest";
import {
  trianglePlusSquareScene,
  triangleScene,
} from "./fixtures";
import { collectObjectKeySet, segmentKey } from "./identity";
import {
  diffMathSceneObjects,
  isAdded,
  isPersisted,
  isRemoved,
  type MathSceneObjectDiff,
} from "./diff";

function overlapSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const key of a) {
    if (b.has(key)) count += 1;
  }
  return count;
}

function expectDisjoint(diff: MathSceneObjectDiff): void {
  expect(overlapSize(diff.added, diff.persisted)).toBe(0);
  expect(overlapSize(diff.added, diff.removed)).toBe(0);
  expect(overlapSize(diff.persisted, diff.removed)).toBe(0);
}

describe("math-scene-plan diff", () => {
  it("marks all objects as added when there is no previous scene", () => {
    const diff = diffMathSceneObjects(null, triangleScene);
    const currentKeys = collectObjectKeySet(triangleScene);

    expect(diff.persisted.size).toBe(0);
    expect(diff.removed.size).toBe(0);
    expect(diff.added).toEqual(currentKeys);
    expectDisjoint(diff);
  });

  it("marks old objects as persisted and new objects as added", () => {
    const diff = diffMathSceneObjects(triangleScene, trianglePlusSquareScene);
    const triangleSegmentKey = segmentKey(triangleScene.segments[0]);
    const squareSegmentKey = segmentKey(trianglePlusSquareScene.segments[3]);

    expect(isPersisted(triangleSegmentKey, diff)).toBe(true);
    expect(isAdded(squareSegmentKey, diff)).toBe(true);
    expect(diff.removed.size).toBe(0);
    expectDisjoint(diff);
  });

  it("marks previous-only objects as removed", () => {
    const diff = diffMathSceneObjects(trianglePlusSquareScene, triangleScene);
    const squareSegmentKey = segmentKey(trianglePlusSquareScene.segments[3]);

    expect(isRemoved(squareSegmentKey, diff)).toBe(true);
    expect(isAdded(squareSegmentKey, diff)).toBe(false);
    expect(isPersisted(squareSegmentKey, diff)).toBe(false);
    expectDisjoint(diff);
  });
});
