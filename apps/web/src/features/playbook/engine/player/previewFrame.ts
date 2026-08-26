import { PLAYBOOK_DEFAULTS } from "../../../../shared/config/constants";
import type { PlaybookScript } from "../types";

export function resolveInitialPreviewFrame(
  script: PlaybookScript,
  requestedFrame?: number,
): number {
  const lastFrame = Math.max(0, script.total_frames - 1);
  const firstStepLastFrame = Math.max(0, (script.steps[0]?.end_frame ?? script.total_frames) - 1);
  const preferred = requestedFrame == null
    ? PLAYBOOK_DEFAULTS.INITIAL_PREVIEW_FRAME
    : Math.max(0, Math.floor(requestedFrame));
  return Math.min(preferred, firstStepLastFrame, lastFrame);
}

/**
 * Map a frame from one timeline onto a reshaped one (parameter edits change
 * narration lengths, shifting every end frame): same step — matched by id,
 * falling back to index — at the same fractional position, so neither the
 * picture nor any progress indicator visibly jumps.
 */
export function mapFrameAcrossTimelines(
  previousSteps: PlaybookScript["steps"],
  nextSteps: PlaybookScript["steps"],
  frame: number,
): number {
  if (!previousSteps.length || !nextSteps.length) return 0;
  let index = previousSteps.findIndex((step) => frame < step.end_frame);
  if (index === -1) index = previousSteps.length - 1;
  const prevStart = index > 0 ? previousSteps[index - 1].end_frame : 0;
  const prevLength = Math.max(1, previousSteps[index].end_frame - prevStart);
  const fraction = Math.min(1, Math.max(0, (frame - prevStart) / prevLength));
  const previousId = previousSteps[index].step_id;
  let nextIndex = nextSteps.findIndex((step) => step.step_id === previousId);
  if (nextIndex === -1) nextIndex = Math.min(index, nextSteps.length - 1);
  const nextStart = nextIndex > 0 ? nextSteps[nextIndex - 1].end_frame : 0;
  const nextEnd = nextSteps[nextIndex].end_frame;
  const mapped = Math.round(nextStart + fraction * (nextEnd - nextStart));
  return Math.min(Math.max(nextStart, mapped), Math.max(nextStart, nextEnd - 1));
}

export function resolvePlayerTimelineKey(script: PlaybookScript): string {
  const fingerprint = JSON.stringify({
    fps: script.fps,
    total_frames: script.total_frames,
    steps: script.steps.map((step) => ({
      step_id: step.step_id,
      end_frame: step.end_frame,
    })),
  });
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i += 1) {
    hash = Math.imul(31, hash) + fingerprint.charCodeAt(i);
  }
  return `playbook-${hash >>> 0}`;
}
