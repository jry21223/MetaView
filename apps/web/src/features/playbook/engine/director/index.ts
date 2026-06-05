import type { MetaStep } from "../types";
import { directorBeatLocalProgress, findDirectorBeatForStep } from "./resolveDirectorFrame";
import { stageTransformForBeat } from "./stageTransform";
import type { DirectorBeat, DirectorScript } from "./types";
import { resolveEffectiveVoiceover } from "./voiceover";

export type {
  DirectorBeat,
  DirectorCameraMotion,
  DirectorIntent,
  DirectorPacing,
  DirectorScript,
  DirectorShotType,
  DirectorSource,
} from "./types";
export {
  directorBeatLocalProgress,
  findActiveDirectorBeat,
  findDirectorBeatForStep,
} from "./resolveDirectorFrame";
export { stageTransformForBeat } from "./stageTransform";
export {
  directorVoiceoverOverrideAllowed,
  resolveEffectiveVoiceover,
} from "./voiceover";
export type {
  DirectorFrameContext,
  DirectorFramePlan,
  MathSceneDirectorPlan,
  StageDirectorPlan,
} from "./framePlan";
export { buildDirectorFramePlan } from "./framePlan";

export function resolveDirectorVoiceover(
  director: DirectorScript | null | undefined,
  step: MetaStep,
  fallback = step.voiceover_text,
): string {
  return resolveEffectiveVoiceover({
    director,
    beat: findDirectorBeatForStep(director, step),
    fallback,
  });
}

export function cameraTransformForBeat(
  beat: DirectorBeat | null | undefined,
  frame: number,
): string | undefined {
  return stageTransformForBeat(beat ?? null, directorBeatLocalProgress(beat ?? null, frame));
}
