import { describe, expect, it } from "vitest";
import { PLAYBOOK_DEFAULTS } from "../../../../shared/config/constants";
import type { PlaybookScript } from "../types";
import {
  resolveCarriedStepFrame,
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

describe("resolveCarriedStepFrame", () => {
  it("keeps the viewer on the same step's settled frame after a timeline reshape", () => {
    // A parameter edit lengthened step 1's narration: 60 → 90 frames.
    const reshaped = script({
      total_frames: 150,
      steps: [
        { ...script().steps[0], end_frame: 90 },
        { ...script().steps[1], end_frame: 150 },
      ],
    });
    expect(resolveCarriedStepFrame(reshaped, 1, 0)).toBe(149);
    expect(resolveCarriedStepFrame(reshaped, 0, 0)).toBe(89);
  });

  it("clamps to the step start and falls back on out-of-range indexes", () => {
    const single = script({
      total_frames: 60,
      steps: [{ ...script().steps[0], end_frame: 60 }],
    });
    expect(resolveCarriedStepFrame(single, 0, 0)).toBe(59);
    expect(resolveCarriedStepFrame(single, 5, 17)).toBe(17);
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
