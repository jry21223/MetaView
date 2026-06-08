import { PLAYBOOK_DEFAULTS } from "../../../../shared/config/constants";
import type { PlaybookScript } from "../types";

export function resolveInitialPreviewFrame(script: PlaybookScript): number {
  const lastFrame = Math.max(0, script.total_frames - 1);
  const firstStepLastFrame = Math.max(0, (script.steps[0]?.end_frame ?? script.total_frames) - 1);
  return Math.min(PLAYBOOK_DEFAULTS.INITIAL_PREVIEW_FRAME, firstStepLastFrame, lastFrame);
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
