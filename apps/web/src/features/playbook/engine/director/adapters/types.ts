import type { MetaStep } from "../../types";
import type { MathSceneDirectorPlan } from "../framePlan";
import type { DirectorBeat } from "../types";

export interface DirectorAdapterContext {
  beat: DirectorBeat | null;
  localProgress: number;
  step: MetaStep;
  prevStep: MetaStep | null;
  stepProgress: number;
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
