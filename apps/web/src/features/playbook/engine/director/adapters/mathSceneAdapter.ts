import { planCameraViewBox } from "../../math-scene-plan/cameraPlanner";
import { buildMathSceneRenderPlan, type MathSceneRenderPlan } from "../../math-scene-plan/plan";
import type { MathSceneSnapshot, MetaStep } from "../../types";
import type { DirectorAdapter } from "./types";

/**
 * The one way a math-scene render plan is assembled: object draw-ins ride the
 * fixed entrance clock, the auto camera glides on the narration-paced
 * progress. Both the director frame plan and any standalone renderer fallback
 * must go through here so the two paths cannot drift apart again.
 */
export function composeMathScenePlan(args: {
  prevStep: MetaStep | null;
  snapshot: MathSceneSnapshot;
  entranceProgress: number;
  cameraProgress: number;
}): MathSceneRenderPlan {
  const basePlan = buildMathSceneRenderPlan({
    previousStep: args.prevStep,
    currentSnapshot: args.snapshot,
    stepProgress: args.entranceProgress,
  });
  return {
    ...basePlan,
    camera: planCameraViewBox({
      plan: basePlan,
      fallback: basePlan.camera,
      progress: args.cameraProgress,
    }),
  };
}

export const MathSceneDirectorAdapter: DirectorAdapter = {
  supports: (step) => step.snapshot.kind === "math_scene",
  build: ({ beat, step, prevStep, stepProgress, entranceProgress }) => {
    const snap = step.snapshot as MathSceneSnapshot;
    const plan = composeMathScenePlan({
      prevStep,
      snapshot: snap,
      entranceProgress: entranceProgress ?? stepProgress,
      cameraProgress: stepProgress,
    });

    return {
      adapter: "math_scene",
      reason: beat?.focus_target
        ? `math_scene:focus_target:${beat.focus_target}`
        : "math_scene:added_objects",
      stageTransform: undefined,
      mathScene: {
        renderPlan: plan,
        reason: "math_scene viewBox camera",
      },
    };
  },
};
