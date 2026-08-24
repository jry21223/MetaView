import type { MetaStep, PlaybookScript } from "../../features/playbook/engine/types";

/**
 * Reading-speed pacing for static template narration (#267).
 *
 * Every static case used to hard-code 90 frames (3s) per step, which is far
 * shorter than its narration takes to read aloud, so autoplay and video
 * export rushed every step. Step length is now derived from the visible
 * narration length at a comfortable Mandarin reading speed, with a lead-in
 * and a floor so short captions stay watchable.
 */
export const NARRATION_CHARS_PER_SECOND = 4.5;
export const NARRATION_LEAD_SECONDS = 0.8;
export const MIN_STEP_SECONDS = 4;

export function narrationStepFrames(narration: string, fps: number): number {
  const visibleChars = narration.replace(/\s/g, "").length;
  const seconds = Math.max(
    MIN_STEP_SECONDS,
    visibleChars / NARRATION_CHARS_PER_SECOND + NARRATION_LEAD_SECONDS,
  );
  return Math.ceil(seconds * fps);
}

/** Reassign cumulative end frames so each step lasts as long as its narration. */
export function applyNarrationTimeline<T extends MetaStep>(steps: T[], fps: number): T[] {
  let end = 0;
  return steps.map((step) => {
    end += narrationStepFrames(step.voiceover_text, fps);
    return { ...step, end_frame: end };
  });
}

/**
 * Representative poster frame near the end of a chosen step, clamped inside
 * that step so boundary frames never bleed into the neighbouring step.
 */
export function posterFrameForStep(
  script: PlaybookScript,
  stepIndex: number,
  tailOffset = 40,
): number {
  const index = Math.max(0, Math.min(stepIndex, script.steps.length - 1));
  const end = script.steps[index].end_frame;
  const start = index > 0 ? script.steps[index - 1].end_frame : 0;
  return Math.max(start, end - tailOffset);
}
