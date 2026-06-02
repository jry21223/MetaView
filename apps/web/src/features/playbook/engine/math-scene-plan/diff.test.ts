import { describe, expect, it } from "vitest";
import {
  trianglePlusSquarePlusAnnotationScene,
  trianglePlusSquareScene,
  triangleScene,
  vectorFieldScene,
} from "./fixtures";
import {
  annotationKey,
  collectObjectKeySet,
  segmentKey,
  vectorFieldKey,
} from "./identity";
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

function setDifference(a: Set<string>, b: Set<string>): Set<string> {
  return new Set([...a].filter((key) => !b.has(key)));
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
    const previousKeys = collectObjectKeySet(triangleScene);
    const currentKeys = collectObjectKeySet(trianglePlusSquareScene);
    const triangleSegmentKey = segmentKey(triangleScene.segments[0]);
    const squareSegmentKey = segmentKey(trianglePlusSquareScene.segments[3]);

    expect(diff.persisted).toEqual(previousKeys);
    expect(diff.added).toEqual(setDifference(currentKeys, previousKeys));
    expect(isPersisted(triangleSegmentKey, diff)).toBe(true);
    expect(isAdded(squareSegmentKey, diff)).toBe(true);
    expect(diff.removed.size).toBe(0);
    expectDisjoint(diff);
  });

  it("marks previous-only objects as removed", () => {
    const diff = diffMathSceneObjects(trianglePlusSquareScene, triangleScene);
    const previousKeys = collectObjectKeySet(trianglePlusSquareScene);
    const currentKeys = collectObjectKeySet(triangleScene);
    const squareSegmentKey = segmentKey(trianglePlusSquareScene.segments[3]);

    expect(diff.persisted).toEqual(currentKeys);
    expect(diff.removed).toEqual(setDifference(previousKeys, currentKeys));
    expect(isRemoved(squareSegmentKey, diff)).toBe(true);
    expect(isAdded(squareSegmentKey, diff)).toBe(false);
    expect(isPersisted(squareSegmentKey, diff)).toBe(false);
    expectDisjoint(diff);
  });

  it("diffs annotations without treating formula metadata as an object", () => {
    const diff = diffMathSceneObjects(
      trianglePlusSquareScene,
      trianglePlusSquarePlusAnnotationScene,
    );
    const annotation = trianglePlusSquarePlusAnnotationScene.annotations[0];

    expect(diff.persisted).toEqual(collectObjectKeySet(trianglePlusSquareScene));
    expect(diff.added).toEqual(new Set([annotationKey(annotation)]));
    expect(diff.removed.size).toBe(0);
    expectDisjoint(diff);
  });

  it("diffs vector fields as single optional objects", () => {
    const previous = vectorFieldScene;
    const current = {
      ...vectorFieldScene,
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
