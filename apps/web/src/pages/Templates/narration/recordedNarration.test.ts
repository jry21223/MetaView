import { describe, expect, it } from "vitest";

import { RECORDED_NARRATION, RECORDED_NARRATION_VOICE } from "./recordedNarration";
import { PUBLIC_GOLD_TEMPLATES } from "../gold-templates/publicGoldTemplates";

/**
 * The recordings are made from the default-parameter playbook and then played
 * back verbatim, so a narration edit that lands without re-running
 * `apps/api/scripts/generate_template_narration.py` would have every visitor
 * hearing the old sentence under the new subtitle. Nothing at runtime can
 * catch that — the drift check lives here instead.
 */
describe("recorded template narration", () => {
  it("matches, line for line, the narration each case ships at its defaults", () => {
    for (const [caseId, entries] of Object.entries(RECORDED_NARRATION)) {
      const manifest = PUBLIC_GOLD_TEMPLATES.find((item) => item.caseId === caseId);
      expect(manifest, `no public case named ${caseId}`).toBeDefined();
      const script = manifest!.buildPublicPlaybook(manifest!.parameterSchema?.defaults ?? {});
      const spoken = script.steps.filter((step) => step.voiceover_text.trim());

      expect(entries.map((entry) => entry.step_id)).toEqual(
        spoken.map((step) => step.step_id),
      );
      for (const [index, entry] of entries.entries()) {
        expect(
          entry.text,
          `${caseId}/${entry.step_id} 的录音与当前旁白不符 — 重新运行 `
            + "apps/api/scripts/generate_template_narration.py",
        ).toBe(spoken[index].voiceover_text.trim());
      }
    }
  });

  it("names the voice it was recorded with, and files every line by step id", () => {
    expect(RECORDED_NARRATION_VOICE).toBeTruthy();
    for (const [caseId, entries] of Object.entries(RECORDED_NARRATION)) {
      expect(entries.length, caseId).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.file).toBe(`${entry.step_id}.mp3`);
      }
    }
  });
});
