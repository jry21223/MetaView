import { interpolate } from "remotion";

export interface AnimPhase {
  name: string;
  frames: number;
  easing?: (t: number) => number;
}

export interface PhaseState {
  current: string | null;
  index: number;
  localProgress: number;
  globalProgress: number;
  isComplete: boolean;
  totalFrames: number;
}

const linear = (t: number): number => t;

export function getPhaseState(
  phases: readonly AnimPhase[],
  elapsed: number,
): PhaseState {
  const totalFrames = phases.reduce((acc, p) => acc + p.frames, 0);
  if (elapsed <= 0 || phases.length === 0) {
    return {
      current: phases[0]?.name ?? null,
      index: 0,
      localProgress: 0,
      globalProgress: 0,
      isComplete: phases.length === 0,
      totalFrames,
    };
  }
  if (elapsed >= totalFrames) {
    const last = phases[phases.length - 1];
    return {
      current: last.name,
      index: phases.length - 1,
      localProgress: 1,
      globalProgress: 1,
      isComplete: true,
      totalFrames,
    };
  }
  let acc = 0;
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    if (elapsed < acc + phase.frames) {
      const raw = (elapsed - acc) / phase.frames;
      const eased = (phase.easing ?? linear)(raw);
      return {
        current: phase.name,
        index: i,
        localProgress: eased,
        globalProgress: elapsed / totalFrames,
        isComplete: false,
        totalFrames,
      };
    }
    acc += phase.frames;
  }
  return {
    current: null,
    index: phases.length,
    localProgress: 1,
    globalProgress: 1,
    isComplete: true,
    totalFrames,
  };
}

export function interpolatePhases(
  elapsed: number,
  phases: readonly AnimPhase[],
  keyframes: readonly number[],
): number {
  if (phases.length === 0) return keyframes[0] ?? 0;
  if (keyframes.length !== phases.length + 1) {
    // Don't crash the player when an animation template ships a mismatched
    // (phases, keyframes) pair — log once and fall back to the first keyframe
    // so the affected snapshot freezes on its initial value instead of
    // taking the whole composition down. See issue #54.
    console.warn(
      `interpolatePhases: keyframes.length (${keyframes.length}) must equal phases.length + 1 (${phases.length + 1}); returning fallback`,
    );
    return keyframes[0] ?? 0;
  }
  const totalFrames = phases.reduce((acc, p) => acc + p.frames, 0);
  if (elapsed <= 0) return keyframes[0];
  if (elapsed >= totalFrames) return keyframes[keyframes.length - 1];
  let acc = 0;
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    if (elapsed < acc + phase.frames) {
      const raw = (elapsed - acc) / phase.frames;
      return interpolate(raw, [0, 1], [keyframes[i], keyframes[i + 1]], {
        easing: phase.easing ?? linear,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
    acc += phase.frames;
  }
  return keyframes[keyframes.length - 1];
}
