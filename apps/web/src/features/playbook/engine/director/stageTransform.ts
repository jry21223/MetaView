import type { DirectorBeat } from "./types";

export function stageTransformForBeat(
  beat: DirectorBeat | null,
  localProgress: number,
): string | undefined {
  if (!beat) return undefined;

  switch (beat.camera_motion) {
    case "hold":
    case "focus_target":
      return undefined;
    case "push_in":
      return `scale(${(1 + localProgress * 0.025).toFixed(4)})`;
    case "pull_out":
      return `scale(${(1.025 - localProgress * 0.025).toFixed(4)})`;
    case "pan_left":
      return `translateX(${(-14 * localProgress).toFixed(2)}px)`;
    case "pan_right":
      return `translateX(${(14 * localProgress).toFixed(2)}px)`;
  }
}
