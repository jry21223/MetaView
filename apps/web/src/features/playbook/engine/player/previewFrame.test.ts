import { describe, expect, it } from "vitest";
import { PLAYBOOK_DEFAULTS } from "../../../../shared/config/constants";
import type { PlaybookScript } from "../types";
import {
  mapFrameAcrossTimelines,
  resolveInitialPreviewFrame,
  resolvePlayerTimelineKey,
} from "./previewFrame";

function script(overrides: Partial<PlaybookScript> = {}): PlaybookScript {
  return {
    fps: PLAYBOOK_DEFAULTS.FPS,
    total_frames: 120,
    domain: "math",
    title: "Demo",
    summary: "Demo summary",
    parameter_controls: [],
    steps: [
      {
        step_id: "step-1",
        end_frame: 60,
        title: "Step 1",
        voiceover_text: "Narration",
        snapshot: {
          kind: "math_formula",
          formula_latex: "x^2",
        },
        tokens: [],
      },
      {
        step_id: "step-2",
        end_frame: 120,
        title: "Step 2",
        voiceover_text: "Narration",
        snapshot: {
          kind: "math_formula",
          formula_latex: "x^3",
        },
        tokens: [],
      },
    ],
    ...overrides,
  };
}

describe("mapFrameAcrossTimelines", () => {
  it("preserves the fractional position inside the matching step", () => {
    const before = script().steps;
    // Step 1 lengthened 60 → 90 frames, step 2 shifted accordingly.
    const after = script({
      total_frames: 150,
      steps: [
        { ...script().steps[0], end_frame: 90 },
        { ...script().steps[1], end_frame: 150 },
      ],
    }).steps;
    // Halfway through step 1 (frame 30 of 60) maps to halfway of 90.
    expect(mapFrameAcrossTimelines(before, after, 30)).toBe(45);
    // Halfway through step 2 (frame 90 of 60..120) maps to 90..150.
    expect(mapFrameAcrossTimelines(before, after, 90)).toBe(120);
  });

  it("matches steps by id and clamps inside the target step", () => {
    const before = script().steps;
    const reordered = script({
      total_frames: 120,
      steps: [
        { ...script().steps[1], end_frame: 60 },
        { ...script().steps[0], end_frame: 120 },
      ],
    }).steps;
    // Frame 59 sits at the end of s1; s1 now occupies 60..120.
    const mapped = mapFrameAcrossTimelines(before, reordered, 59);
    expect(mapped).toBeGreaterThanOrEqual(60);
    expect(mapped).toBeLessThan(120);
    expect(mapFrameAcrossTimelines([], reordered, 30)).toBe(0);
  });
});

describe("resolveInitialPreviewFrame", () => {
  it("starts the player on a visible early frame instead of frame zero", () => {
    expect(resolveInitialPreviewFrame(script())).toBe(PLAYBOOK_DEFAULTS.INITIAL_PREVIEW_FRAME);
  });

  it("accepts a settled first-step frame for deterministic previews", () => {
    expect(resolveInitialPreviewFrame(script(), 58)).toBe(58);
  });

  it("clamps requested preview frames to the first step", () => {
    expect(resolveInitialPreviewFrame(script(), 999)).toBe(59);
  });

  it("never seeks past the first step", () => {
    expect(
      resolveInitialPreviewFrame(
        script({
          total_frames: 20,
          steps: [
            {
              step_id: "short",
              end_frame: 8,
              title: "Short",
              voiceover_text: "Short",
              snapshot: {
                kind: "math_formula",
                formula_latex: "x",
              },
              tokens: [],
            },
          ],
        }),
      ),
    ).toBe(7);
  });
});

describe("resolvePlayerTimelineKey", () => {
  it("changes when the playbook timeline changes", () => {
    const base = script();
    const changed = script({
      total_frames: 150,
      steps: [
        {
          ...base.steps[0],
          end_frame: 75,
        },
        {
          ...base.steps[1],
          end_frame: 150,
        },
      ],
    });

    expect(resolvePlayerTimelineKey(base)).not.toBe(resolvePlayerTimelineKey(changed));
  });

  it("does not change when snapshot content changes without changing the timeline shape", () => {
    const base = script();
    const changed = script({
      steps: [
        {
          ...base.steps[0],
          snapshot: {
            kind: "math_formula",
            formula_latex: "x^4",
          },
        },
        base.steps[1],
      ],
    });

    expect(resolvePlayerTimelineKey(base)).toBe(resolvePlayerTimelineKey(changed));
  });
});
