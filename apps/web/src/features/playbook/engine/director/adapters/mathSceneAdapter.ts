import { planCameraViewBox } from "../../math-scene-plan/cameraPlanner";
import { buildMathSceneRenderPlan } from "../../math-scene-plan/plan";
import type { MathSceneSnapshot } from "../../types";
import type { DirectorAdapter } from "./types";

export const MathSceneDirectorAdapter: DirectorAdapter = {
  supports: (step) => step.snapshot.kind === "math_scene",
  build: ({ beat, step, prevStep, stepProgress }) => {
    const snap = step.snapshot as MathSceneSnapshot;
    const basePlan = buildMathSceneRenderPlan({
      previousStep: prevStep,
      currentSnapshot: snap,
      stepProgress,
    });
    const camera = planCameraViewBox({
      plan: basePlan,
      fallback: basePlan.camera,
      progress: stepProgress,
    });

    return {
      adapter: "math_scene",
      reason: beat?.focus_target
        ? `math_scene:focus_target:${beat.focus_target}`
        : "math_scene:added_objects",
      stageTransform: undefined,
      mathScene: {
        renderPlan: {
          ...basePlan,
          camera,
        },
        reason: "math_scene viewBox camera",
      },
    };
  },
};
