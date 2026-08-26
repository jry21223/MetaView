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
 * Settled frame of one step — used to keep the viewer's place when a reshaped
 * timeline (parameter edits change narration lengths, so end frames shift and
 * the keyed Player remounts) would otherwise reset playback to the opening
 * poster. The step's last own frame shows its fully revealed visuals.
 */
export function resolveCarriedStepFrame(
  script: PlaybookScript,
  stepIndex: number,
  fallback: number,
): number {
  const step = script.steps[stepIndex];
  if (!step) return fallback;
  const start = stepIndex > 0 ? script.steps[stepIndex - 1]?.end_frame ?? 0 : 0;
  const lastFrame = Math.max(0, script.total_frames - 1);
  return Math.min(Math.max(start, step.end_frame - 1), lastFrame);
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
