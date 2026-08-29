import type { MetaStep } from "../../types";
import type { MathSceneDirectorPlan } from "../framePlan";
import type { DirectorBeat } from "../types";

export interface DirectorAdapterContext {
  beat: DirectorBeat | null;
  localProgress: number;
  step: MetaStep;
  prevStep: MetaStep | null;
  stepProgress: number;
  /**
   * Fixed-clock draw-in progress for newly added objects (complete ~2.2s into
   * the step), independent of narration length. Falls back to stepProgress
   * where a caller cannot supply it.
   */
  entranceProgress?: number;
}

export interface DirectorAdapterResult {
  adapter: "stage" | "math_scene" | "none";
  reason: string;
  stageTransform?: string;
  mathScene?: MathSceneDirectorPlan | null;
}

export interface DirectorAdapter {
  supports(step: MetaStep): boolean;
  build(context: DirectorAdapterContext): DirectorAdapterResult;
}
