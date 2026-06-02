import { describe, expect, it } from "vitest";
import type { MathFormulaSnapshot, MathSceneSnapshot, MetaStep } from "../types";
import {
  makeMathSceneStep,
  trianglePlusSquarePlusAnnotationScene,
  trianglePlusSquareScene,
  triangleScene,
  vectorFieldScene,
} from "./fixtures";
import { collectObjectKeySet, segmentKey } from "./identity";
import { buildMathSceneRenderPlan, type PlannedObject } from "./plan";

function formulaStep(snapshot: MathFormulaSnapshot): MetaStep {
  return {
    step_id: "formula",
    end_frame: 30,
    title: "formula",
    voiceover_text: "",
    snapshot,
    tokens: [],
  };
}

function allPlannedObjects(
  plan: ReturnType<typeof buildMathSceneRenderPlan>,
): Array<PlannedObject<unknown>> {
  return [
    ...plan.points,
    ...plan.segments,
    ...plan.regions,
    ...plan.curves,
    ...plan.annotations,
    ...(plan.vectorField ? [plan.vectorField] : []),
  ];
}

function allPlannedKeys(
  plan: ReturnType<typeof buildMathSceneRenderPlan>,
): Set<string> {
  return new Set(allPlannedObjects(plan).map((object) => object.key));
}

function required<T>(value: T | undefined): T {
  if (!value) throw new Error("Expected fixture value to exist");
  return value;
}

describe("math-scene-plan plan", () => {
  it("marks every object as added when there is no previous step", () => {
    const plan = buildMathSceneRenderPlan({
      currentSnapshot: triangleScene,
      stepProgress: 0.35,
    });

    expect(allPlannedObjects(plan).every((object) => object.added)).toBe(true);
    expect(allPlannedObjects(plan).every((object) => !object.persisted)).toBe(true);
    expect(allPlannedObjects(plan).every((object) => object.progress === 0.35)).toBe(true);
  });

  it("treats a non-math_scene previous step as no previous scene", () => {
    const plan = buildMathSceneRenderPlan({
      previousStep: formulaStep({ kind: "math_formula", formula_latex: "x=1" }),
      currentSnapshot: triangleScene,
      stepProgress: 0.4,
    });

    expect(allPlannedObjects(plan).every((object) => object.added)).toBe(true);
    expect(allPlannedObjects(plan).every((object) => object.progress === 0.4)).toBe(true);
  });

  it("sets persisted object progress to 1 and added object progress to step progress", () => {
    const plan = buildMathSceneRenderPlan({
      previousStep: makeMathSceneStep(triangleScene, { step_id: "triangle" }),
      currentSnapshot: trianglePlusSquareScene,
      stepProgress: 0.2,
    });
    const triangleSegmentKey = segmentKey(required(triangleScene.segments?.[0]));
    const squareSegmentKey = segmentKey(required(trianglePlusSquareScene.segments?.[3]));
    const triangleSegment = required(
      plan.segments.find((object) => object.key === triangleSegmentKey),
    );
    const squareSegment = required(
      plan.segments.find((object) => object.key === squareSegmentKey),
    );

    expect(triangleSegment.persisted).toBe(true);
    expect(triangleSegment.added).toBe(false);
    expect(triangleSegment.progress).toBe(1);
    expect(squareSegment.persisted).toBe(false);
    expect(squareSegment.added).toBe(true);
    expect(squareSegment.progress).toBe(0.2);
  });

  it("returns current snapshot object counts", () => {
    const plan = buildMathSceneRenderPlan({
      previousStep: makeMathSceneStep(triangleScene, { step_id: "triangle" }),
      currentSnapshot: trianglePlusSquareScene,
      stepProgress: 0.2,
    });

    expect(plan.points).toHaveLength(trianglePlusSquareScene.points?.length ?? 0);
    expect(plan.segments).toHaveLength(trianglePlusSquareScene.segments?.length ?? 0);
    expect(plan.regions).toHaveLength(trianglePlusSquareScene.regions?.length ?? 0);
    expect(plan.curves).toHaveLength(trianglePlusSquareScene.curves?.length ?? 0);
    expect(plan.annotations).toHaveLength(trianglePlusSquareScene.annotations?.length ?? 0);
    expect(plan.vectorField).toBeNull();
  });

  it("returns the current snapshot viewBox as camera v1", () => {
    const plan = buildMathSceneRenderPlan({
      previousStep: makeMathSceneStep(triangleScene, { step_id: "triangle" }),
      currentSnapshot: trianglePlusSquareScene,
      stepProgress: 0.2,
    });

    expect(plan.camera).toEqual({
      x: [trianglePlusSquareScene.x_min, trianglePlusSquareScene.x_max],
      y: [trianglePlusSquareScene.y_min, trianglePlusSquareScene.y_max],
    });
  });

  it("includes non-throwing diagnostics for duplicate identity keys", () => {
    const duplicatePoint = triangleScene.points?.[0];
    if (!duplicatePoint) throw new Error("Expected fixture point");
    const currentSnapshot: MathSceneSnapshot = {
      ...triangleScene,
      points: [...(triangleScene.points ?? []), { ...duplicatePoint }],
    };
    const plan = buildMathSceneRenderPlan({
      currentSnapshot,
      stepProgress: 1,
    });

    expect(plan.diagnostics.warnings).toMatchObject([
      {
        code: "duplicate_identity_key",
        kind: "point",
        count: 2,
      },
    ]);
  });

  it("returns planned objects for every math scene collection", () => {
    const current: MathSceneSnapshot = {
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
      annotations: [{ x: 1, y: 1, text: "$f$", align: "ne" }],
    };
    const plan = buildMathSceneRenderPlan({
      currentSnapshot: current,
      stepProgress: 0.6,
    });

    expect(plan.points).toHaveLength(1);
    expect(plan.segments).toHaveLength(1);
    expect(plan.regions).toHaveLength(1);
    expect(plan.curves).toHaveLength(1);
    expect(plan.annotations).toHaveLength(1);
    expect(plan.vectorField?.object).toBe(current.vector_field);
    expect(allPlannedKeys(plan)).toEqual(collectObjectKeySet(current));
    expect(allPlannedObjects(plan).every((object) => object.progress === 0.6)).toBe(
      true,
    );
  });

  it("plans annotations and vector fields with object-level progress", () => {
    const previous = {
      ...trianglePlusSquarePlusAnnotationScene,
      vector_field: {
        expression_px: "-y",
        expression_py: "x",
        step: 0.5,
        label: "F",
      },
    };
    const current = {
      ...previous,
      annotations: [
        ...(previous.annotations ?? []),
        { x: 6, y: 3, text: "$new$", align: "nw" as const },
      ],
    };
    const plan = buildMathSceneRenderPlan({
      previousStep: makeMathSceneStep(previous, { step_id: "previous" }),
      currentSnapshot: current,
      stepProgress: 0.25,
    });

    expect(plan.annotations).toHaveLength(current.annotations?.length ?? 0);
    expect(plan.annotations[0]?.persisted).toBe(true);
    expect(plan.annotations[0]?.progress).toBe(1);
    expect(plan.annotations[1]?.added).toBe(true);
    expect(plan.annotations[1]?.progress).toBe(0.25);
    expect(plan.vectorField?.persisted).toBe(true);
    expect(plan.vectorField?.progress).toBe(1);
  });
});
