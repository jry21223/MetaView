import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { PUBLIC_GOLD_TEMPLATES } from "./publicGoldTemplates";

describe("public gold template manifest", () => {
  it("migrates pole-polar into the public manifest without changing its frozen Playbook", () => {
    const manifest = PUBLIC_GOLD_TEMPLATES.find((item) => item.caseId === "pole-polar");
    expect(manifest?.archetypeId).toBe("conic.pole-polar.circle");
    expect(manifest?.visibility).toBe("public");

    const playbook = manifest!.buildPublicPlaybook(manifest!.parameterSchema!.defaults);
    const followups = manifest!.buildFollowups(manifest!.parameterSchema!.defaults, playbook);
    expect(playbook.steps).toHaveLength(6);
    expect(playbook.steps.every((step) => followups[step.step_id]?.length === 3)).toBe(true);
  });

  it("keeps public identifiers and archetypes unique", () => {
    expect(new Set(PUBLIC_GOLD_TEMPLATES.map((item) => item.caseId)).size)
      .toBe(PUBLIC_GOLD_TEMPLATES.length);
    expect(new Set(PUBLIC_GOLD_TEMPLATES.map((item) => item.archetypeId)).size)
      .toBe(PUBLIC_GOLD_TEMPLATES.length);
  });

  it("publishes exactly six conic teacher cases with complete deterministic contracts", () => {
    expect(PUBLIC_GOLD_TEMPLATES).toHaveLength(6);
    for (const item of PUBLIC_GOLD_TEMPLATES) {
      const defaults = item.parameterSchema?.defaults ?? {};
      const script = item.buildPublicPlaybook(defaults);
      const followupMap = item.buildFollowups(defaults, script);
      expect(script.steps.length).toBeGreaterThanOrEqual(item.pedagogicalRubric.minimumSteps);
      expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);
      expect(new Set(script.steps.map((step) => step.step_id)).size).toBe(script.steps.length);
      expect(script.steps.every((step) => followupMap[step.step_id]?.length === 3)).toBe(true);
      expect(item.visualInvariants[0].requiredSemanticRoles.length).toBeGreaterThan(2);
      const payload = JSON.stringify(script);
      for (const role of item.visualInvariants[0].requiredSemanticRoles) {
        expect(payload).toContain(`"semantic_role":"${role}"`);
      }
      expect(existsSync(resolve(`public${item.poster.url}`))).toBe(true);
    }
  });
});
