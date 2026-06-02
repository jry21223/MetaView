import { describe, expect, it } from "vitest";
import type { MathSceneSnapshot } from "../types";
import {
  annotationKey,
  collectIdentitySets,
  collectObjectKeySet,
  collectObjectRefs,
  curveKey,
  pointKey,
  regionKey,
  segmentKey,
  vectorFieldKey,
} from "./identity";
import { vectorFieldScene } from "./fixtures";

function withId<T>(object: T, id: string): T & { id: string } {
  return { ...object, id };
}

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

  it("keeps content identity stable when style-only fields change", () => {
    expect(
      segmentKey({
        x0: 0,
        y0: 0,
        x1: 1,
        y1: 0,
        label: "s",
        emphasis: "primary",
      }),
    ).toBe(
      segmentKey({
        x0: 0,
        y0: 0,
        x1: 1,
        y1: 0,
        label: "s",
        emphasis: "accent",
      }),
    );
    expect(
      curveKey({ expression_y: "x^2", label: "f", emphasis: "primary" }),
    ).toBe(
      curveKey({ expression_y: "x^2", label: "f", emphasis: "accent" }),
    );
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
      vector_field: {
        expression_px: "-y",
        expression_py: "x",
        step: 0.5,
        label: "F",
      },
    };

    const refs = collectObjectRefs(snapshot);
    expect(refs).toEqual([
      { kind: "point", key: pointKey(snapshot.points[0]) },
      { kind: "segment", key: segmentKey(snapshot.segments[0]) },
      { kind: "region", key: regionKey(snapshot.regions[0]) },
      { kind: "curve", key: curveKey(snapshot.curves[0]) },
      { kind: "annotation", key: annotationKey(snapshot.annotations[0]) },
      { kind: "vector_field", key: vectorFieldKey(snapshot.vector_field) },
    ]);
    expect(collectObjectKeySet(snapshot)).toEqual(new Set(refs.map((ref) => ref.key)));
  });

  it("collects identity sets grouped by object kind", () => {
    const snapshot: MathSceneSnapshot = {
      ...vectorFieldScene,
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
    };

    const sets = collectIdentitySets(snapshot);

    expect(sets.point).toEqual(new Set([pointKey(snapshot.points[0])]));
    expect(sets.segment).toEqual(new Set([segmentKey(snapshot.segments[0])]));
    expect(sets.region).toEqual(new Set([regionKey(snapshot.regions[0])]));
    expect(sets.curve).toEqual(new Set([curveKey(snapshot.curves[0])]));
    expect(sets.annotation).toEqual(
      new Set([annotationKey(snapshot.annotations?.[0] ?? { x: 0, y: 0, text: "" })]),
    );
    expect(sets.vector_field).toEqual(
      new Set([vectorFieldKey(snapshot.vector_field!)]),
    );
  });

  it("creates vector field keys from field expressions and sampling", () => {
    const a = vectorFieldKey({
      expression_px: "-y",
      expression_py: "x",
      step: 0.5,
      label: "F",
    });
    const b = vectorFieldKey({
      expression_px: "-y",
      expression_py: "x",
      step: 1,
      label: "F",
    });

    expect(a).not.toBe(b);
  });

  it("prefers explicit object ids over content identity for every object type", () => {
    expect(pointKey(withId({ x: 1, y: 2, label: "A" }, "p-1"))).toBe(
      "point:id:p-1",
    );
    expect(
      pointKey(withId({ x: 4, y: 5, label: "different" }, "p-1")),
    ).toBe("point:id:p-1");
    expect(
      segmentKey(
        withId({ x0: 0, y0: 0, x1: 1, y1: 0, label: "s" }, "s-1"),
      ),
    ).toBe("segment:id:s-1");
    expect(
      regionKey(
        withId(
          {
            label: "R",
            vertices: [
              [0, 0],
              [1, 0],
              [0, 1],
            ],
          },
          "r-1",
        ),
      ),
    ).toBe("region:id:r-1");
    expect(curveKey(withId({ expression_y: "x^2", label: "f" }, "c-1"))).toBe(
      "curve:id:c-1",
    );
    expect(
      annotationKey(withId({ x: 1, y: 1, text: "$f$", align: "ne" }, "a-1")),
    ).toBe("annotation:id:a-1");
    expect(
      vectorFieldKey(
        withId(
          { expression_px: "-y", expression_py: "x", step: 0.5, label: "F" },
          "vf-1",
        ),
      ),
    ).toBe("vector_field:id:vf-1");
  });

  it("keeps content identity as the fallback when explicit ids are absent", () => {
    expect(pointKey({ x: 1, y: 2, label: "A" })).toBe(
      "point:A:1.000:2.000",
    );
    expect(segmentKey({ x0: 0, y0: 0, x1: 1, y1: 0 })).toBe(
      "segment::0.000:0.000:1.000:0.000:line",
    );
  });
});
