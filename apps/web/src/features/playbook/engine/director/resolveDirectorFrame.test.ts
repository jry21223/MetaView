import { describe, expect, it } from "vitest";
import type { DirectorBeat, DirectorScript } from "./types";
import { directorBeatLocalProgress, findActiveDirectorBeat } from "./resolveDirectorFrame";

function beat(overrides: Partial<DirectorBeat> = {}): DirectorBeat {
  return {
    beat_id: "beat_01",
    step_id: "s1",
    start_frame: 0,
    end_frame: 30,
    intent: "focus",
    shot_type: "medium",
    camera_motion: "hold",
    pacing: "normal",
    emphasis_terms: [],
    ...overrides,
  };
}

function director(beats: DirectorBeat[]): DirectorScript {
  return {
    schema_version: "1.0.0",
    source: "rule",
    run_id: "run-1",
    beats,
  };
}

describe("resolveDirectorFrame", () => {
  it("resolves the active beat for a frame", () => {
    const first = beat({ beat_id: "first", start_frame: 0, end_frame: 30 });
    const second = beat({ beat_id: "second", start_frame: 30, end_frame: 60 });

    expect(findActiveDirectorBeat(director([first, second]), 45)).toBe(second);
  });

  it("holds the last beat after the director timeline ends", () => {
    const last = beat({ beat_id: "last", start_frame: 10, end_frame: 20 });

    expect(findActiveDirectorBeat(director([last]), 50)).toBe(last);
  });

  it("returns null before the first beat and without beats", () => {
    expect(findActiveDirectorBeat(director([beat({ start_frame: 10, end_frame: 20 })]), 5)).toBeNull();
    expect(findActiveDirectorBeat(director([]), 5)).toBeNull();
  });

  it("clamps local progress to the beat range", () => {
    const active = beat({ start_frame: 10, end_frame: 30 });

    expect(directorBeatLocalProgress(active, 0)).toBe(0);
    expect(directorBeatLocalProgress(active, 20)).toBe(0.5);
    expect(directorBeatLocalProgress(active, 40)).toBe(1);
  });
});
