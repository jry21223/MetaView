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

  it("rejects prototype-pollution path segments on add/replace and does not pollute Object.prototype", () => {
    const original = playbook();
    const scope = deriveRepairScope([
      { code: "step.empty_voiceover", path: "steps[0].voiceover_text" },
    ]);

    expect(() =>
      applyPlaybookPatch(
        original,
        [{ op: "add", path: "/steps/0/__proto__/polluted", value: "yes" }],
        scope,
      ),
    ).toThrow(/forbidden segment/);

    expect(() =>
      applyPlaybookPatch(
        original,
        [{ op: "replace", path: "/steps/0/constructor/prototype/polluted", value: "yes" }],
        scope,
      ),
    ).toThrow(/forbidden segment/);

    expect(() =>
      applyPlaybookPatch(
        original,
        [{ op: "add", path: "/steps/0/prototype/polluted", value: "yes" }],
        scope,
      ),
    ).toThrow(/forbidden segment/);

    // Object.prototype must remain clean after rejected pollution attempts.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted")).toBe(false);
  });

  it("does not expand director-only issues to all mutable roots", () => {
    const original = playbook();
    const scope = deriveRepairScope([
      { code: "director.plan_mismatch", path: "director.beats[0]" },
    ]);
    expect(scope.allowedPrefixes).toEqual([]);
    expect(() =>
      applyPlaybookPatch(
        original,
        [{ op: "replace", path: "/title", value: "should not be allowed" }],
        scope,
      ),
    ).toThrow(/outside the issue-scoped allowlist/);
  });

  it("still expands explicit playbook/schema issues to mutable roots", () => {
    const scope = deriveRepairScope([{ code: "schema.invalid", path: "schema" }]);
    expect(scope.allowedPrefixes).toEqual(
      expect.arrayContaining(["/title", "/summary", "/steps", "/parameter_controls"]),
    );
  });

  it("preserves compiler-owned step_id under whole-step replace", () => {
    const original = playbook();
    const scope = deriveRepairScope([
      { code: "snapshot.empty_payload", path: "steps[2].snapshot" },
    ]);
    const repaired = applyPlaybookPatch(
      original,
      [
        {
          op: "replace",
          path: "/steps/2",
          value: {
            ...original.steps[2],
            step_id: "hijacked",
            end_frame: 1,
            voiceover_text: "整步替换后的旁白，身份字段必须仍由编译器持有。",
            snapshot: { kind: "math_formula", formula_latex: "g(x)" },
            layers: [
              {
                timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 0 },
                body: { kind: "math_formula", formula_latex: "g(x)" },
              },
            ],
          },
        },
      ],
      scope,
    );
    expect(repaired.steps[2].step_id).toBe("step_03");
    expect(repaired.steps[2].voiceover_text).toContain("整步替换后的旁白");
    expect(repaired.steps[2].end_frame).toBeGreaterThan(original.steps[1].end_frame);
  });

  it("fail-closes unknown issue paths instead of unlocking all steps", () => {
    const original = playbook();
    const scope = deriveRepairScope([
      { code: "mystery.issue", path: "something.unknown.field" },
    ]);
    expect(scope.allowedPrefixes).toEqual([]);
    expect(() =>
      applyPlaybookPatch(
        original,
        [{ op: "replace", path: "/steps/0/title", value: "should not land" }],
        scope,
      ),
    ).toThrow(/outside the issue-scoped allowlist/);
  });
});
