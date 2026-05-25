import { describe, expect, it } from "vitest";
import { PLAYBOOK_DEFAULTS } from "../../../../shared/config/constants";
import type { PlaybookScript } from "../types";
import { resolveInitialPreviewFrame, resolvePlayerTimelineKey } from "./previewFrame";

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

describe("resolveInitialPreviewFrame", () => {
  it("starts the player on a visible early frame instead of frame zero", () => {
    expect(resolveInitialPreviewFrame(script())).toBe(PLAYBOOK_DEFAULTS.INITIAL_PREVIEW_FRAME);
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

  it("changes when snapshot content changes without changing the timeline shape", () => {
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

    expect(resolvePlayerTimelineKey(base)).not.toBe(resolvePlayerTimelineKey(changed));
  });
});
