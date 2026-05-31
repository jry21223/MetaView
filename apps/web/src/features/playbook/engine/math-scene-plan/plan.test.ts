import { describe, expect, it } from "vitest";
import type { MathFormulaSnapshot, MathSceneSnapshot, MetaStep } from "../types";
import {
  trianglePlusSquareScene,
  triangleScene,
} from "./fixtures";
import { segmentKey } from "./identity";
import { buildMathSceneRenderPlan, type PlannedObject } from "./plan";

function sceneStep(snapshot: MathSceneSnapshot, id = "scene"): MetaStep {
  return {
    step_id: id,
    end_frame: 30,
    title: id,
    voiceover_text: "",
    snapshot,
    tokens: [],
  };
}

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
  ];
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
      previousStep: sceneStep(triangleScene, "triangle"),
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
      previousStep: sceneStep(triangleScene, "triangle"),
      currentSnapshot: trianglePlusSquareScene,
      stepProgress: 0.2,
    });

    expect(plan.points).toHaveLength(trianglePlusSquareScene.points?.length ?? 0);
    expect(plan.segments).toHaveLength(trianglePlusSquareScene.segments?.length ?? 0);
    expect(plan.regions).toHaveLength(trianglePlusSquareScene.regions?.length ?? 0);
    expect(plan.curves).toHaveLength(trianglePlusSquareScene.curves?.length ?? 0);
  });

  it("returns the current snapshot viewBox as camera v1", () => {
    const plan = buildMathSceneRenderPlan({
      previousStep: sceneStep(triangleScene, "triangle"),
      currentSnapshot: trianglePlusSquareScene,
      stepProgress: 0.2,
    });

    expect(plan.camera).toEqual({
      x: [trianglePlusSquareScene.x_min, trianglePlusSquareScene.x_max],
      y: [trianglePlusSquareScene.y_min, trianglePlusSquareScene.y_max],
    });
  });
});
