import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CONIC_ARCHETYPE_CATALOG } from "../../../shared/domain/conicArchetypeCatalog";
import { applyInteraction } from "../../../features/playbook/interaction/engine";
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
    expect(playbook.steps.every((step) => followups[step.step_id]?.length === 5)).toBe(true);
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
      expect(script.steps.every((step) => followupMap[step.step_id]?.length === 5)).toBe(true);
      expect(item.visualInvariants[0].requiredSemanticRoles.length).toBeGreaterThan(2);
      const payload = JSON.stringify(script);
      for (const role of item.visualInvariants[0].requiredSemanticRoles) {
        expect(payload).toContain(`"semantic_role":"${role}"`);
      }
      expect(existsSync(resolve(`public${item.poster.url}`))).toBe(true);
    }
  });

  it("slows only the requested segment while preserving a valid Playbook timeline", () => {
    const manifest = PUBLIC_GOLD_TEMPLATES.find(
      (item) => item.caseId === "ellipse-focus-definition",
    )!;
    const base = manifest.buildPublicPlaybook(manifest.parameterSchema!.defaults);
    const target = base.steps[2];
    const previousEnd = base.steps[1].end_frame;
    const originalDuration = target.end_frame - previousEnd;

    const result = applyInteraction(base, {
      adapter_id: "math.conic-followup",
      step_id: target.step_id,
      target_id: `step:${target.step_id}:slow-current-segment`,
      action: "slow-current-segment",
      factor: 1.5,
    }, 1, [manifest.interactionAdapter]);

    const slowed = result.script.steps[2];
    expect(slowed.end_frame - previousEnd).toBe(Math.ceil(originalDuration * 1.5));
    expect(result.script.steps[3].end_frame - slowed.end_frame).toBe(90);
    expect(result.script.total_frames).toBe(result.script.steps.at(-1)?.end_frame);
    expect(new Set(result.script.steps.map((step) => step.step_id)).size)
      .toBe(result.script.steps.length);
    expect(base.steps[2].end_frame).toBe(target.end_frame);
  });

  it("changes, emphasizes, or clarifies only the active conic step", () => {
    const manifest = PUBLIC_GOLD_TEMPLATES.find(
      (item) => item.caseId === "ellipse-focus-definition",
    )!;
    const base = manifest.buildPublicPlaybook(manifest.parameterSchema!.defaults);
    const target = base.steps[3];
    const prefix = `step:${target.step_id}`;

    const changed = applyInteraction(base, {
      adapter_id: "math.conic-followup",
      step_id: target.step_id,
      target_id: `${prefix}:change-explanation`,
      action: "change-explanation",
      explanation: "先比较两段距离的变化，再观察它们的和保持为 2a。",
    }, 1, [manifest.interactionAdapter]).script;
    expect(changed.steps[3].voiceover_text)
      .toBe("先比较两段距离的变化，再观察它们的和保持为 2a。");
    expect(changed.steps[2]).toEqual(base.steps[2]);
    expect(changed.steps[4]).toEqual(base.steps[4]);

    const emphasized = applyInteraction(base, {
      adapter_id: "math.conic-followup",
      step_id: target.step_id,
      target_id: `${prefix}:emphasize-conclusion`,
      action: "emphasize-conclusion",
      reason: "P 在椭圆上，所以焦距和恒等于 2a。",
      semantic_role: "focal_distance",
    }, 1, [manifest.interactionAdapter]).script;
    expect(emphasized.steps[3].voiceover_text).toContain("焦距和恒等于 2a");
    const emphasizedSnapshot = emphasized.steps[3].snapshot;
    expect(emphasizedSnapshot.kind).toBe("math_scene");
    if (emphasizedSnapshot.kind === "math_scene") {
      expect(emphasizedSnapshot.segments
        ?.filter((segment) => segment.semantic_role === "focal_distance")
        .every((segment) => segment.emphasis === "accent"))
        .toBe(true);
    }
    expect(emphasized.steps[2]).toEqual(base.steps[2]);

    const clarified = applyInteraction(base, {
      adapter_id: "math.conic-followup",
      step_id: target.step_id,
      target_id: `${prefix}:clarify-current-step`,
      action: "clarify-current-step",
      clarification: "这里只补充当前一步：单段距离变化不影响距离和。",
    }, 1, [manifest.interactionAdapter]).script;
    expect(clarified.steps[3].voiceover_text).toContain("这里只补充当前一步");
    expect(clarified.steps.filter((step) => step.step_id !== target.step_id))
      .toEqual(base.steps.filter((step) => step.step_id !== target.step_id));
  });

  it("clamps parameter Follow-ups and rebuilds all affected conic state through the Gold builder", () => {
    const manifest = PUBLIC_GOLD_TEMPLATES.find((item) => item.caseId === "pole-polar")!;
    const base = manifest.buildPublicPlaybook({ k: 5 });
    const stepId = "pole-polar-result";

    const result = applyInteraction(base, {
      adapter_id: "math.conic-followup",
      step_id: stepId,
      target_id: `step:${stepId}:set-parameter`,
      action: "set-parameter",
      parameter_id: "k",
      value: 100,
    }, 1, [manifest.interactionAdapter]);

    expect(result.script.parameter_controls[0].value).toBe("8");
    expect(result.script.steps[0].voiceover_text).toContain("P=(8,8)");
    const tangentScene = result.script.steps[1].snapshot;
    const resultScene = result.script.steps[5].snapshot;
    expect(tangentScene.kind).toBe("math_scene");
    expect(resultScene.kind).toBe("math_scene");
    if (tangentScene.kind === "math_scene" && resultScene.kind === "math_scene") {
      const points = tangentScene.points?.filter((point) => ["A", "B"].includes(point.label ?? "")) ?? [];
      expect(points).toHaveLength(2);
      for (const point of points) {
        expect(point.x ** 2 + point.y ** 2).toBeCloseTo(25, 8);
        expect(8 * point.x + 8 * point.y).toBeCloseTo(25, 8);
      }
      expect(resultScene.formula_latex).toContain("x+y=3.13");
    }
    expect(base.parameter_controls[0].value).toBe("5");
  });

  it("publishes all five semantic Follow-up intents for every active conic step", () => {
    const expectedActions = [
      "slow-current-segment",
      "change-explanation",
      "emphasize-conclusion",
      "set-parameter",
      "clarify-current-step",
    ];

    for (const manifest of PUBLIC_GOLD_TEMPLATES) {
      const params = manifest.parameterSchema?.defaults ?? {};
      const script = manifest.buildPublicPlaybook(params);
      const followups = manifest.buildFollowups(params, script);
      for (const step of script.steps) {
        const presets = followups[step.step_id];
        expect(presets.map((preset) => preset.operation?.action)).toEqual(expectedActions);
        expect(presets.every((preset) =>
          preset.operation?.step_id === step.step_id &&
          preset.operation.target_id.startsWith(`step:${step.step_id}:`)
        )).toBe(true);
      }
    }
  });
});
