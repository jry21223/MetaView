import { describe, expect, it } from "vitest";
import { triangleScene, vectorFieldScene } from "./fixtures";
import { pointKey, segmentKey } from "./identity";
import { diagnoseMathScenePlan } from "./diagnostics";

function withId<T>(object: T, id: string): T & { id: string } {
  return { ...object, id };
}

describe("math-scene-plan diagnostics", () => {
  it("returns no warnings for a scene with unique identity keys", () => {
    expect(diagnoseMathScenePlan(vectorFieldScene).warnings).toEqual([]);
  });

  it("returns duplicate identity warnings without throwing", () => {
    const duplicatePoint = triangleScene.points[0];
    const duplicateSegment = triangleScene.segments[0];
    const snapshot = {
      ...triangleScene,
      points: [...(triangleScene.points ?? []), { ...duplicatePoint }],
      segments: [...(triangleScene.segments ?? []), { ...duplicateSegment }],
    };

    expect(() => diagnoseMathScenePlan(snapshot)).not.toThrow();

    const diagnostics = diagnoseMathScenePlan(snapshot);

    expect(diagnostics.warnings).toEqual([
      {
        code: "duplicate_identity_key",
        kind: "point",
        key: pointKey(duplicatePoint),
        count: 2,
        message: `Duplicate point identity key "${pointKey(duplicatePoint)}" appears 2 times.`,
      },
      {
        code: "duplicate_identity_key",
        kind: "segment",
        key: segmentKey(duplicateSegment),
        count: 2,
        message: `Duplicate segment identity key "${segmentKey(duplicateSegment)}" appears 2 times.`,
      },
    ]);
  });

  it("counts more than two copies of the same key in one warning", () => {
    const duplicatePoint = triangleScene.points[0];
    const snapshot = {
      ...triangleScene,
      points: [
        ...(triangleScene.points ?? []),
        { ...duplicatePoint },
        { ...duplicatePoint },
      ],
    };

    expect(diagnoseMathScenePlan(snapshot).warnings).toMatchObject([
      {
        code: "duplicate_identity_key",
        kind: "point",
        key: pointKey(duplicatePoint),
        count: 3,
      },
    ]);
  });

  it("detects duplicate explicit ids using id-based identity keys", () => {
    const snapshot = {
      ...triangleScene,
      points: [
        withId(triangleScene.points[0], "shared-point"),
        withId({ x: 9, y: 9, label: "different content" }, "shared-point"),
      ],
    };

    expect(diagnoseMathScenePlan(snapshot).warnings).toMatchObject([
      {
        code: "duplicate_identity_key",
        kind: "point",
        key: "point:id:shared-point",
        count: 2,
      },
    ]);
  });
});
