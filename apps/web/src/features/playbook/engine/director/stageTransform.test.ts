import { describe, expect, it } from "vitest";
import type { DirectorBeat, DirectorCameraMotion } from "./types";
import { stageTransformForBeat } from "./stageTransform";

function beat(cameraMotion: DirectorCameraMotion): DirectorBeat {
  return {
    beat_id: "beat_01",
    step_id: "s1",
    start_frame: 0,
    end_frame: 60,
    intent: "focus",
    shot_type: "medium",
    camera_motion: cameraMotion,
    pacing: "normal",
    emphasis_terms: [],
  };
}

describe("stageTransformForBeat", () => {
  it("keeps hold static and leaves focus_target to capable adapters", () => {
    expect(stageTransformForBeat(beat("hold"), 0.5)).toBeUndefined();
    expect(stageTransformForBeat(beat("focus_target"), 0.5)).toBeUndefined();
  });

  it.each([
    [0, "scale(1.0000)"],
    [0.5, "scale(1.0400)"],
    [1, "scale(1.0800)"],
  ])("maps push_in progress %s to %s", (progress, expected) => {
    expect(stageTransformForBeat(beat("push_in"), progress)).toBe(expected);
  });

  it.each([
    [0, "scale(1.0800)"],
    [0.5, "scale(1.0400)"],
    [1, "scale(1.0000)"],
  ])("maps pull_out progress %s to %s", (progress, expected) => {
    expect(stageTransformForBeat(beat("pull_out"), progress)).toBe(expected);
  });

  it.each([
    [0, "translateX(0.00px)", "translateX(0.00px)"],
    [0.5, "translateX(-20.00px)", "translateX(20.00px)"],
    [1, "translateX(-40.00px)", "translateX(40.00px)"],
  ])("maps pan progress %s in both directions", (progress, left, right) => {
    expect(stageTransformForBeat(beat("pan_left"), progress)).toBe(left);
    expect(stageTransformForBeat(beat("pan_right"), progress)).toBe(right);
  });

  it("maps pacing to deterministic motion progress", () => {
    expect(stageTransformForBeat({ ...beat("push_in"), pacing: "fast" }, 0.25)).toBe(
      "scale(1.0400)",
    );
    expect(stageTransformForBeat({ ...beat("push_in"), pacing: "normal" }, 0.25)).toBe(
      "scale(1.0200)",
    );
    expect(stageTransformForBeat({ ...beat("push_in"), pacing: "slow" }, 0.25)).toBe(
      "scale(1.0125)",
    );
  });

  it("clamps out-of-range and invalid progress without jumps", () => {
    expect(stageTransformForBeat(beat("push_in"), -1)).toBe("scale(1.0000)");
    expect(stageTransformForBeat(beat("push_in"), 2)).toBe("scale(1.0800)");
    expect(stageTransformForBeat(beat("pull_out"), Number.POSITIVE_INFINITY)).toBe(
      "scale(1.0000)",
    );
    expect(stageTransformForBeat(beat("pan_right"), Number.NaN)).toBe(
      "translateX(0.00px)",
    );
  });
});
