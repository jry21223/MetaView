import type { DirectorBeat } from "./types";

function pacingProgress(beat: DirectorBeat, localProgress: number): number {
  const progress = Math.max(0, Math.min(1, localProgress));
  if (beat.pacing === "fast") return Math.sqrt(progress);
  if (beat.pacing === "slow") return progress * progress * (3 - 2 * progress);
  return progress;
}

export function stageTransformForBeat(
  beat: DirectorBeat | null,
  localProgress: number,
): string | undefined {
  if (!beat) return undefined;
  const progress = pacingProgress(beat, localProgress);

  switch (beat.camera_motion) {
    case "hold":
    case "focus_target":
      return undefined;
    case "push_in":
      return `scale(${(1 + progress * 0.05).toFixed(4)})`;
    case "pull_out":
      return `scale(${(1.05 - progress * 0.05).toFixed(4)})`;
    case "pan_left":
      return `translateX(${(-24 * progress).toFixed(2)}px)`;
    case "pan_right":
      return `translateX(${(24 * progress).toFixed(2)}px)`;
  }
}
