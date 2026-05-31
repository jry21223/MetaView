import { describe, expect, it } from "vitest";
import {
  trianglePlusSquareScene,
  triangleScene,
} from "./fixtures";
import {
  planCameraViewBox,
  DEFAULT_CAMERA_PLANNER_OPTIONS,
} from "./cameraPlanner";
import { viewBoxHeight, viewBoxWidth, type CameraViewBox } from "./camera";
import { buildMathSceneRenderPlan } from "./plan";
import type { MathSceneSnapshot, MetaStep } from "../types";

function sceneStep(snapshot: MathSceneSnapshot): MetaStep {
  return {
    step_id: "scene",
    end_frame: 30,
    title: "scene",
    voiceover_text: "",
    snapshot,
    tokens: [],
  };
}

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
      previousStep: sceneStep(triangleScene),
      currentSnapshot: triangleScene,
      stepProgress: 1,
    });

    expect(planCameraViewBox({ plan, fallback, progress: 1 })).toEqual(fallback);
  });

  it("focuses added objects with a viewBox different from fallback", () => {
    const plan = buildMathSceneRenderPlan({
      previousStep: sceneStep(triangleScene),
      currentSnapshot: trianglePlusSquareScene,
      stepProgress: 1,
    });

    expect(planCameraViewBox({ plan, fallback, progress: 1 })).not.toEqual(fallback);
  });

  it("interpolates from fallback to focus using progress", () => {
    const plan = buildMathSceneRenderPlan({
      previousStep: sceneStep(triangleScene),
      currentSnapshot: trianglePlusSquareScene,
      stepProgress: 1,
    });
    const focused = planCameraViewBox({ plan, fallback, progress: 1 });

    expect(planCameraViewBox({ plan, fallback, progress: 0 })).toEqual(fallback);
    expect(focused).not.toEqual(fallback);
  });

  it("does not zoom tighter than the configured minimum ratio", () => {
    const plan = buildMathSceneRenderPlan({
      previousStep: sceneStep(triangleScene),
      currentSnapshot: trianglePlusSquareScene,
      stepProgress: 1,
    });
    const result = planCameraViewBox({ plan, fallback, progress: 1 });
    const minWidth = viewBoxWidth(fallback) * DEFAULT_CAMERA_PLANNER_OPTIONS.minZoomRatio;
    const minHeight = viewBoxHeight(fallback) * DEFAULT_CAMERA_PLANNER_OPTIONS.minZoomRatio;

    expect(viewBoxWidth(result)).toBeGreaterThanOrEqual(minWidth - 1e-9);
    expect(viewBoxHeight(result)).toBeGreaterThanOrEqual(minHeight - 1e-9);
  });
});
