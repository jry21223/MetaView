import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPhaseState,
  interpolatePhases,
  type AnimPhase,
} from "./useMultiPhaseAnimation";

const PHASES: AnimPhase[] = [
  { name: "in", frames: 10 },
  { name: "hold", frames: 10 },
  { name: "out", frames: 10 },
];

describe("interpolatePhases", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns the first keyframe when elapsed is at or before start", () => {
    expect(interpolatePhases(0, PHASES, [0, 1, 1, 0])).toBe(0);
    expect(interpolatePhases(-5, PHASES, [0, 1, 1, 0])).toBe(0);
  });

  it("returns the last keyframe when elapsed is past the timeline", () => {
    expect(interpolatePhases(999, PHASES, [0, 1, 1, 0])).toBe(0);
  });

  it("interpolates linearly within a phase by default", () => {
    // halfway through "in" (frame 5 of 10) — between keyframes[0]=0 and keyframes[1]=1
    expect(interpolatePhases(5, PHASES, [0, 1, 1, 0])).toBeCloseTo(0.5, 5);
    // halfway through "out" (frame 25 of 30) — between keyframes[2]=1 and keyframes[3]=0
    expect(interpolatePhases(25, PHASES, [0, 1, 1, 0])).toBeCloseTo(0.5, 5);
  });

  it("does NOT throw when keyframes length is shorter than phases.length+1 (issue #54)", () => {
    expect(() => interpolatePhases(5, PHASES, [0, 1])).not.toThrow();
  });

  it("does NOT throw when keyframes length is longer than phases.length+1 (issue #54)", () => {
    expect(() => interpolatePhases(5, PHASES, [0, 1, 1, 0, 0, 0])).not.toThrow();
  });

  it("returns a numeric fallback and warns on length mismatch (issue #54)", () => {
    const result = interpolatePhases(5, PHASES, [0.42]);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBe(0.42);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when keyframes is empty and length mismatched", () => {
    const result = interpolatePhases(5, PHASES, []);
    expect(result).toBe(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("handles an empty phases array without warning", () => {
    expect(interpolatePhases(5, [], [0.7])).toBe(0.7);
    expect(interpolatePhases(5, [], [])).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("getPhaseState", () => {
  it("reports the active phase index and local progress", () => {
    const s = getPhaseState(PHASES, 5);
    expect(s.current).toBe("in");
    expect(s.index).toBe(0);
    expect(s.localProgress).toBeCloseTo(0.5, 5);
    expect(s.isComplete).toBe(false);
  });

  it("clamps to last phase when elapsed exceeds total", () => {
    const s = getPhaseState(PHASES, 999);
    expect(s.current).toBe("out");
    expect(s.isComplete).toBe(true);
    expect(s.localProgress).toBe(1);
  });
});
