import { describe, expect, it } from "vitest";
import {
  makeMathSceneStep,
  trianglePlusSquarePlusAnnotationScene,
  trianglePlusSquareScene,
  triangleScene,
  vectorFieldScene,
} from "./fixtures";
import {
  planCameraViewBox,
  DEFAULT_CAMERA_PLANNER_OPTIONS,
} from "./cameraPlanner";
import { viewBoxHeight, viewBoxWidth, type CameraViewBox } from "./camera";
import { buildMathSceneRenderPlan } from "./plan";
import type { MathSceneSnapshot } from "../types";

const fallback: CameraViewBox = { x: [-1, 7], y: [-1, 4] };

describe("math-scene-plan cameraPlanner", () => {
  it("returns fallback when disabled", () => {
    const plan = buildMathSceneRenderPlan({
      currentSnapshot: trianglePlusSquareScene,
      stepProgress: 1,
    });

    expect(
      planCameraViewBox({
        plan,
        fallback,
        progress: 1,
        options: { enabled: false },
      }),
    ).toEqual(fallback);
  });

  it("returns fallback when no focusable objects are added", () => {
    const plan = buildMathSceneRenderPlan({
      previousStep: makeMathSceneStep(triangleScene),
      currentSnapshot: triangleScene,
      stepProgress: 1,
    });

    expect(planCameraViewBox({ plan, fallback, progress: 1 })).toEqual(fallback);
  });

  it("focuses added objects with a viewBox different from fallback", () => {
    const plan = buildMathSceneRenderPlan({
      previousStep: makeMathSceneStep(triangleScene),
      currentSnapshot: trianglePlusSquareScene,
      stepProgress: 1,
    });

    expect(planCameraViewBox({ plan, fallback, progress: 1 })).not.toEqual(fallback);
  });

  it("interpolates from fallback to focus using progress", () => {
    const plan = buildMathSceneRenderPlan({
      previousStep: makeMathSceneStep(triangleScene),
      currentSnapshot: trianglePlusSquareScene,
      stepProgress: 1,
    });
    const focused = planCameraViewBox({ plan, fallback, progress: 1 });

    expect(planCameraViewBox({ plan, fallback, progress: 0 })).toEqual(fallback);
    expect(focused).not.toEqual(fallback);
  });

  it("does not zoom tighter than the configured minimum ratio", () => {
    const plan = buildMathSceneRenderPlan({
      previousStep: makeMathSceneStep(triangleScene),
      currentSnapshot: trianglePlusSquareScene,
      stepProgress: 1,
    });
    const result = planCameraViewBox({ plan, fallback, progress: 1 });
    const minWidth = viewBoxWidth(fallback) * DEFAULT_CAMERA_PLANNER_OPTIONS.minZoomRatio;
    const minHeight = viewBoxHeight(fallback) * DEFAULT_CAMERA_PLANNER_OPTIONS.minZoomRatio;

    expect(viewBoxWidth(result)).toBeGreaterThanOrEqual(minWidth - 1e-9);
    expect(viewBoxHeight(result)).toBeGreaterThanOrEqual(minHeight - 1e-9);
  });

  it("focuses an added annotation deterministically", () => {
    const plan = buildMathSceneRenderPlan({
      previousStep: makeMathSceneStep(trianglePlusSquareScene),
      currentSnapshot: trianglePlusSquarePlusAnnotationScene,
      stepProgress: 1,
    });

    expect(planCameraViewBox({ plan, fallback, progress: 1 })).toEqual({
      x: [3.2, 6.8],
      y: [1.375, 3.625],
    });
  });

  it("focuses an added region deterministically", () => {
    const current: MathSceneSnapshot = {
      ...triangleScene,
      regions: [
        {
          label: "R",
          vertices: [
            [4, 0],
            [6, 0],
            [6, 2],
            [4, 2],
          ],
        },
      ],
    };
    const plan = buildMathSceneRenderPlan({
      previousStep: makeMathSceneStep(triangleScene),
      currentSnapshot: current,
      stepProgress: 1,
    });

    expect(planCameraViewBox({ plan, fallback, progress: 1 })).toEqual({
      x: [3.2, 6.8],
      y: [-0.7000000000000002, 2.7],
    });
  });

  it("does not focus added curves or vector fields by themselves", () => {
    const curveOnly: MathSceneSnapshot = {
      ...triangleScene,
      curves: [{ expression_y: "x^2", label: "f" }],
    };
    const vectorOnly: MathSceneSnapshot = {
      ...triangleScene,
      vector_field: vectorFieldScene.vector_field,
    };
    const curvePlan = buildMathSceneRenderPlan({
      previousStep: makeMathSceneStep(triangleScene),
      currentSnapshot: curveOnly,
      stepProgress: 1,
    });
    const vectorPlan = buildMathSceneRenderPlan({
      previousStep: makeMathSceneStep(triangleScene),
      currentSnapshot: vectorOnly,
      stepProgress: 1,
    });

    expect(planCameraViewBox({ plan: curvePlan, fallback, progress: 1 })).toEqual(
      fallback,
    );
    expect(planCameraViewBox({ plan: vectorPlan, fallback, progress: 1 })).toEqual(
      fallback,
    );
  });
});
