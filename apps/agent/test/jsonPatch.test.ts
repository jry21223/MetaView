import { describe, expect, it } from "vitest";

import { applyPlaybookPatch, deriveRepairScope } from "../src/state/jsonPatch.js";
import type { PlaybookOutput } from "../src/state/types.js";

function playbook(): PlaybookOutput {
  const steps = Array.from({ length: 8 }, (_, index) => {
    const snapshot = { kind: "math_formula", formula_latex: `x_${index + 1}` };
    return {
      step_id: `step_${String(index + 1).padStart(2, "0")}`,
      title: `Step ${index + 1}`,
      end_frame: (index + 1) * 180,
      narration_template: [`Narration ${index + 1}`],
      voiceover_text: `Narration ${index + 1}`,
      tokens: [],
      code_highlight: null,
      snapshot,
      layers: [
        {
          timing: { enter_at: 0, exit_at: 1, appear_anim: "fade" as const, z_order: 0 },
          body: { ...snapshot },
        },
      ],
    };
  });
  return {
    schema_version: "1.0.0",
    fps: 30,
    total_frames: steps.at(-1)!.end_frame,
    domain: "math",
    title: "Patch test",
    summary: "Patch test",
    steps,
    parameter_controls: [],
  };
}

describe("path-scoped Playbook repair", () => {
  it("limits a step issue to that step and normalizes derived timing", () => {
    const original = playbook();
    const scope = deriveRepairScope([
      { code: "step.empty_voiceover", path: "steps[2].voiceover_text" },
    ]);
    const repaired = applyPlaybookPatch(
      original,
      [
        {
          op: "replace",
          path: "/steps/2/voiceover_text",
          value: "修复后的第三步旁白，解释当前公式和结论。",
        },
      ],
      scope,
    );
    expect(repaired.steps[2].voiceover_text).toContain("修复后的第三步");
    expect(repaired.steps[1]).toEqual(original.steps[1]);
    expect(repaired.total_frames).toBe(repaired.steps.at(-1)!.end_frame);
  });

  it("rejects unrelated mutations and compiler-owned fields", () => {
    const original = playbook();
    const scope = deriveRepairScope([
      { code: "step.empty_voiceover", path: "steps[2].voiceover_text" },
    ]);
    expect(() =>
      applyPlaybookPatch(
        original,
        [{ op: "replace", path: "/steps/5/title", value: "unrelated" }],
        scope,
      ),
    ).toThrow(/outside the issue-scoped allowlist/);
    expect(() =>
      applyPlaybookPatch(
        original,
        [{ op: "replace", path: "/steps/2/end_frame", value: 1 }],
        scope,
      ),
    ).toThrow(/compiler-owned/);
  });

  it("automatically mirrors a patched snapshot to the primary layer", () => {
    const original = playbook();
    const scope = deriveRepairScope([
      { code: "snapshot.empty_payload", path: "steps[0].snapshot" },
    ]);
    const repaired = applyPlaybookPatch(
      original,
      [
        {
          op: "replace",
          path: "/steps/0/snapshot",
          value: { kind: "math_formula", formula_latex: "f'(1)=2" },
        },
      ],
      scope,
    );
    expect(repaired.steps[0].layers[0].body).toEqual(repaired.steps[0].snapshot);
  });
});
