import { describe, expect, it } from "vitest";
import type { MathSceneSnapshot } from "../types";
import {
  annotationKey,
  collectObjectKeySet,
  collectObjectRefs,
  curveKey,
  pointKey,
  regionKey,
  segmentKey,
} from "./identity";

describe("math-scene-plan identity", () => {
  it("creates stable point keys for equal points", () => {
    expect(pointKey({ x: 1, y: 2, label: "A" })).toBe(
      pointKey({ x: 1, y: 2, label: "A" }),
    );
  });

  it("keeps point identity stable when emphasis changes", () => {
    const a = pointKey({ x: 1, y: 2, label: "A", emphasis: "primary" });
    const b = pointKey({ x: 1, y: 2, label: "A", emphasis: "accent" });

    expect(a).toBe(b);
  });

  it("changes segment identity when geometry changes", () => {
    const a = segmentKey({ x0: 0, y0: 0, x1: 1, y1: 0, label: "a" });
    const b = segmentKey({ x0: 0, y0: 0, x1: 2, y1: 0, label: "a" });

    expect(a).not.toBe(b);
  });

  it("keeps region identity stable when vertex order is the same", () => {
    const a = regionKey({
      label: "R",
      vertices: [
        [0, 0],
        [2, 0],
        [1, 1],
      ],
      emphasis: "primary",
    });
    const b = regionKey({
      label: "R",
      vertices: [
        [0, 0],
        [2, 0],
        [1, 1],
      ],
      emphasis: "accent",
    });

    expect(a).toBe(b);
  });

  it("collects refs and keys for every math scene object type", () => {
    const snapshot: MathSceneSnapshot = {
      kind: "math_scene",
      x_min: -1,
      x_max: 3,
      y_min: -1,
      y_max: 3,
      x_label: "x",
      y_label: "y",
      points: [{ x: 0, y: 0, label: "O" }],
      segments: [{ x0: 0, y0: 0, x1: 1, y1: 0, label: "s" }],
      regions: [
        {
          label: "R",
          vertices: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
        },
      ],
      curves: [{ expression_y: "x^2", label: "f" }],
      annotations: [{ x: 1, y: 1, text: "$f$", align: "ne" }],
    };

    const refs = collectObjectRefs(snapshot);
    expect(refs).toEqual([
      { kind: "point", key: pointKey(snapshot.points[0]) },
      { kind: "segment", key: segmentKey(snapshot.segments[0]) },
      { kind: "region", key: regionKey(snapshot.regions[0]) },
      { kind: "curve", key: curveKey(snapshot.curves[0]) },
      { kind: "annotation", key: annotationKey(snapshot.annotations[0]) },
    ]);
    expect(collectObjectKeySet(snapshot)).toEqual(new Set(refs.map((ref) => ref.key)));
  });
});
