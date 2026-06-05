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
  it("keeps hold and focus_target out of the stage transform", () => {
    expect(stageTransformForBeat(beat("hold"), 0.5)).toBeUndefined();
    expect(stageTransformForBeat(beat("focus_target"), 0.5)).toBeUndefined();
  });

  it("returns conservative push and pull scales", () => {
    expect(stageTransformForBeat(beat("push_in"), 0.5)).toBe("scale(1.0125)");
    expect(stageTransformForBeat(beat("pull_out"), 0.5)).toBe("scale(1.0125)");
  });

  it("returns small pan transforms", () => {
    expect(stageTransformForBeat(beat("pan_left"), 0.5)).toBe("translateX(-7.00px)");
    expect(stageTransformForBeat(beat("pan_right"), 0.5)).toBe("translateX(7.00px)");
  });
});
