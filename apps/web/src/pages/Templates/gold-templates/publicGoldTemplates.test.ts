import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CONIC_ARCHETYPE_CATALOG } from "../../../shared/domain/conicArchetypeCatalog";
import { attachPublicGoldTemplate } from "./manifest";
import { PUBLIC_GOLD_TEMPLATES } from "./publicGoldTemplates";

describe("public gold template manifest", () => {
  it("attaches every public conic builder to the authoritative archetype metadata", () => {
    expect(PUBLIC_GOLD_TEMPLATES).toHaveLength(CONIC_ARCHETYPE_CATALOG.length);

    for (const archetype of CONIC_ARCHETYPE_CATALOG) {
      const manifest = PUBLIC_GOLD_TEMPLATES.find(
        (item) => item.archetypeId === archetype.archetypeId,
      );
      expect(manifest?.caseId).toBe(archetype.publicCaseId);
      expect(manifest?.requiredCapabilities).toBe(archetype.requiredCapabilities);
      expect(manifest?.expectedFacts).toBe(archetype.expectedFacts);
      expect(manifest?.visualInvariants).toBe(archetype.visualInvariants);
      expect(manifest?.pedagogicalRubric).toBe(archetype.pedagogicalRubric);
    }
  });

  it("rejects public case or metadata mismatches at the page integration boundary", () => {
    const manifest = PUBLIC_GOLD_TEMPLATES[0];
    const definition = {
      caseId: manifest.caseId,
      archetypeId: manifest.archetypeId,
      subject: manifest.subject,
      domain: manifest.domain,
      topic: manifest.topic,
      visibility: manifest.visibility,
      title: manifest.title,
      description: manifest.description,
      canonicalPrompt: manifest.canonicalPrompt,
      parameterSchema: manifest.parameterSchema,
      poster: manifest.poster,
      buildPublicPlaybook: manifest.buildPublicPlaybook,
      buildFollowups: manifest.buildFollowups,
    };

    expect(() => attachPublicGoldTemplate({ ...definition, caseId: "wrong-case" })).toThrow(
      "does not match",
    );
    expect(() => attachPublicGoldTemplate({
      ...definition,
      expectedFacts: [],
    } as never)).toThrow("must come from the catalog");
  });

  it("migrates pole-polar into the public manifest without changing its frozen Playbook", () => {
    const manifest = PUBLIC_GOLD_TEMPLATES.find((item) => item.caseId === "pole-polar");
    expect(manifest?.archetypeId).toBe("conic.pole-polar.circle");
    expect(manifest?.visibility).toBe("public");

    const playbook = manifest!.buildPublicPlaybook(manifest!.parameterSchema!.defaults);
    const followups = manifest!.buildFollowups(manifest!.parameterSchema!.defaults, playbook);
    expect(playbook.steps).toHaveLength(6);
    expect(playbook.steps.every((step) => followups[step.step_id]?.length === 3)).toBe(true);
  });

  it("keeps the Gold manifest upstream of the legacy preview adapter", () => {
    const publicRegistrySource = readFileSync(
      resolve("src/pages/Templates/gold-templates/publicGoldTemplates.ts"),
      "utf8",
    );
    const manifestSource = readFileSync(
      resolve("src/pages/Templates/gold-templates/manifest.ts"),
      "utf8",
    );
    expect(publicRegistrySource).not.toContain("getTemplatePreviewCase");
    expect(manifestSource).not.toContain("as TemplatePreviewCaseId");
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
