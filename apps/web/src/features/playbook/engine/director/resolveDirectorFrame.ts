import type { MetaStep } from "../types";
import type { DirectorBeat, DirectorScript } from "./types";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function findActiveDirectorBeat(
  director: DirectorScript | null | undefined,
  frame: number,
): DirectorBeat | null {
  const beats = director?.beats ?? [];
  if (beats.length === 0) return null;

  const active = beats.find((beat) => frame >= beat.start_frame && frame < beat.end_frame);
  if (active) return active;

  const last = beats[beats.length - 1];
  return frame >= last.end_frame ? last : null;
}

export function findDirectorBeatForStep(
  director: DirectorScript | null | undefined,
  step: MetaStep | null | undefined,
): DirectorBeat | null {
  if (!director || !step) return null;
  return director.beats.find((beat) => beat.step_id === step.step_id) ?? null;
}

export function directorBeatLocalProgress(
  beat: DirectorBeat | null,
  frame: number,
): number {
  if (!beat) return 0;
  const duration = Math.max(1, beat.end_frame - beat.start_frame);
  return clamp01((frame - beat.start_frame) / duration);
}
