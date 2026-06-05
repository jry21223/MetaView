import type { DirectorBeat, DirectorScript, MetaStep } from "./types";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function findActiveDirectorBeat(
  director: DirectorScript | null | undefined,
  frame: number,
): DirectorBeat | undefined {
  const beats = director?.beats ?? [];
  if (beats.length === 0) return undefined;
  const active = beats.find((beat) => frame >= beat.start_frame && frame < beat.end_frame);
  if (active) return active;
  return frame >= beats[beats.length - 1].end_frame ? beats[beats.length - 1] : undefined;
}

export function findDirectorBeatForStep(
  director: DirectorScript | null | undefined,
  step: MetaStep | null | undefined,
): DirectorBeat | undefined {
  if (!director || !step) return undefined;
  return director.beats.find((beat) => beat.step_id === step.step_id);
}

export function resolveDirectorVoiceover(
  director: DirectorScript | null | undefined,
  step: MetaStep,
): string {
  const directorText = findDirectorBeatForStep(director, step)?.voiceover_text?.trim();
  return directorText || step.voiceover_text;
}

export function cameraTransformForBeat(
  beat: DirectorBeat | undefined,
  frame: number,
): string | undefined {
  if (!beat || beat.camera_motion === "hold") return undefined;
  const duration = Math.max(1, beat.end_frame - beat.start_frame);
  const progress = clamp01((frame - beat.start_frame) / duration);

  switch (beat.camera_motion) {
    case "push_in":
      return `scale(${(1 + progress * 0.06).toFixed(4)})`;
    case "pull_out":
      return `scale(${(1.06 - progress * 0.06).toFixed(4)})`;
    case "pan_left":
      return `translateX(${(-18 * progress).toFixed(2)}px)`;
    case "pan_right":
      return `translateX(${(18 * progress).toFixed(2)}px)`;
  }
}
