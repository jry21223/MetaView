import { describe, expect, it } from "vitest";
import type { DirectorBeat, DirectorScript, DirectorSource } from "./types";
import { resolveEffectiveVoiceover } from "./voiceover";

function beat(voiceoverText: string | null): DirectorBeat {
  return {
    beat_id: "beat_01",
    step_id: "s1",
    start_frame: 0,
    end_frame: 60,
    intent: "focus",
    shot_type: "medium",
    camera_motion: "hold",
    pacing: "normal",
    voiceover_text: voiceoverText,
    emphasis_terms: [],
  };
}

function director(source: DirectorSource): DirectorScript {
  return {
    schema_version: "1.0.0",
    source,
    run_id: "run-1",
    beats: [],
  };
}

describe("resolveEffectiveVoiceover", () => {
  it("does not allow rule directors to override narration", () => {
    expect(
      resolveEffectiveVoiceover({
        director: director("rule"),
        beat: beat("Director text."),
        fallback: "Step text.",
      }),
    ).toBe("Step text.");
  });

  it.each(["manual", "llm", "agent"] as const)(
    "allows %s directors to override narration",
    (source) => {
      expect(
        resolveEffectiveVoiceover({
          director: director(source),
          beat: beat(" Director text. "),
          fallback: "Step text.",
        }),
      ).toBe("Director text.");
    },
  );
});
