import { describe, expect, it } from "vitest";

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
});
