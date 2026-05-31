import { describe, expect, it } from "vitest";
import {
  trianglePlusSquareScene,
  triangleScene,
} from "./fixtures";
import { collectObjectKeySet, segmentKey, vectorFieldKey } from "./identity";
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

  it("diffs vector fields as single optional objects", () => {
    const previous = {
      ...triangleScene,
      vector_field: {
        expression_px: "-y",
        expression_py: "x",
        step: 0.5,
        label: "F",
      },
    };
    const current = {
      ...triangleScene,
      vector_field: {
        expression_px: "-y",
        expression_py: "x",
        step: 1,
        label: "F",
      },
    };
    const diff = diffMathSceneObjects(previous, current);

    expect(isRemoved(vectorFieldKey(previous.vector_field), diff)).toBe(true);
    expect(isAdded(vectorFieldKey(current.vector_field), diff)).toBe(true);
    expectDisjoint(diff);
  });
});
