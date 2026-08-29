import type { MathSceneRenderPlan } from "../math-scene-plan/plan";
import { MATH_SCENE_ENTRANCE_FRAMES } from "../math-scene-plan/progress";
import type { MetaStep, PlaybookScript } from "../types";
import { selectDirectorAdapter } from "./adapters/registry";
import { directorBeatLocalProgress, findActiveDirectorBeat } from "./resolveDirectorFrame";
import type { DirectorBeat, DirectorScript } from "./types";
import { resolveEffectiveVoiceover } from "./voiceover";

export interface StageDirectorPlan {
  transform?: string;
  pacing?: DirectorBeat["pacing"];
  reason: string;
}

export interface MathSceneDirectorPlan {
  renderPlan: MathSceneRenderPlan;
  reason: string;
}

export interface DirectorFramePlan {
  activeBeat: DirectorBeat | null;
  localProgress: number;
  stage: StageDirectorPlan;
  mathScene: MathSceneDirectorPlan | null;
  voiceoverText?: string | null;
  debug: {
    beatId?: string;
    intent?: string;
    shotType?: string;
    cameraMotion?: string;
    adapter: "stage" | "math_scene" | "none";
    reason: string;
  };
}

export interface DirectorFrameContext {
  director: DirectorScript | null;
  script: PlaybookScript;
  frame: number;
  step: MetaStep;
  prevStep: MetaStep | null;
  stepProgress: number;
}

export function buildDirectorFramePlan(context: DirectorFrameContext): DirectorFramePlan {
  const beat = findActiveDirectorBeat(context.director, context.frame);
  const localProgress = directorBeatLocalProgress(beat, context.frame);
  const adapter = selectDirectorAdapter(context.step);
  // Draw-ins finish on a short fixed clock however long the narration runs;
  // the step starts where the previous step ended.
  const stepStartFrame = context.prevStep?.end_frame ?? 0;
  const entranceProgress = Math.min(
    1,
    Math.max(0, context.frame - stepStartFrame) / MATH_SCENE_ENTRANCE_FRAMES,
  );
  const result = adapter.build({
    beat,
    localProgress,
    step: context.step,
    prevStep: context.prevStep,
    stepProgress: context.stepProgress,
    entranceProgress,
  });

  return {
    activeBeat: beat,
    localProgress,
    stage: {
      transform: result.stageTransform,
      pacing: beat?.pacing,
      reason: result.reason,
    },
    mathScene: result.mathScene ?? null,
    voiceoverText: resolveEffectiveVoiceover({
      director: context.director,
      beat,
      fallback: context.step.voiceover_text,
    }),
    debug: {
      beatId: beat?.beat_id,
      intent: beat?.intent,
      shotType: beat?.shot_type,
      cameraMotion: beat?.camera_motion,
      adapter: result.adapter,
      reason: result.reason,
    },
  };
}
