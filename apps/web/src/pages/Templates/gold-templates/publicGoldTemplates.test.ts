import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CONIC_ARCHETYPE_CATALOG } from "../../../shared/domain/conicArchetypeCatalog";
import { applyInteraction } from "../../../features/playbook/interaction/engine";
import { attachPublicGoldTemplate } from "./manifest";
import { PUBLIC_GOLD_TEMPLATES } from "./publicGoldTemplates";

describe("public gold template manifest", () => {
  it("attaches every public conic builder to the authoritative archetype metadata", () => {
    const conicTemplates = PUBLIC_GOLD_TEMPLATES.filter(
      (item) => item.domain === "conic_sections",
    );
    expect(conicTemplates).toHaveLength(CONIC_ARCHETYPE_CATALOG.length);

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
    expect(PUBLIC_GOLD_TEMPLATES).toHaveLength(13);
    expect(new Set(PUBLIC_GOLD_TEMPLATES.map((item) => item.caseId)).size)
      .toBe(PUBLIC_GOLD_TEMPLATES.length);
    expect(new Set(PUBLIC_GOLD_TEMPLATES.map((item) => item.archetypeId)).size)
      .toBe(PUBLIC_GOLD_TEMPLATES.length);
    for (const item of PUBLIC_GOLD_TEMPLATES) {
      expect(item.visibility).toBe("public");
      expect(existsSync(resolve(`public${item.poster.url}`))).toBe(true);
      expect(item.requiredCapabilities.length).toBeGreaterThan(0);
      expect(item.expectedFacts.length).toBeGreaterThan(0);
      expect(item.visualInvariants.length).toBeGreaterThan(0);
    }
  });

  it("publishes exactly nine conic teacher cases with complete deterministic contracts", () => {
    const conicTemplates = PUBLIC_GOLD_TEMPLATES.filter(
      (item) => item.domain === "conic_sections",
    );
    expect(conicTemplates).toHaveLength(9);
    for (const item of conicTemplates) {
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

  it("orders every public conic case as an explicit teacher-grade reasoning chain", () => {
    const expectedTitleCues: Record<string, readonly string[]> = {
      "ellipse-string-construction": ["观察目标", "拉紧绳子", "改变 t", "积累尾迹", "验证轨迹", "总结"],
      "ellipse-standard-equation": ["观察目标", "移项", "第一次平方", "第二次平方", "引入 b²", "总结"],
      "ellipse-parameters-eccentricity": ["观察目标", "改变 c", "定义离心率", "验证一", "验证二", "总结"],
      "ellipse-focus-definition": ["观察目标", "改变 t", "测量", "提出猜想", "代数解释", "验证"],
      "parabola-focus-directrix": ["观察目标", "改变 t", "构造", "代数解释", "验证"],
      "hyperbola-asymptotes": ["观察目标", "提出猜想", "改变 u", "代数验证", "焦距差", "总结"],
      "line-ellipse-position": ["观察目标", "验证一", "验证二", "验证三", "竖直直线", "下结论"],
      "ellipse-chord-midpoint-locus": ["观察目标", "动弦", "中点", "提出猜想", "韦达", "验证"],
      "pole-polar": ["观察目标", "构造", "猜想", "代数解释", "验证", "总结"],
    };

    const conicManifests = PUBLIC_GOLD_TEMPLATES.filter(
      (manifest) => manifest.archetypeId.startsWith("conic."),
    );
    expect(conicManifests).toHaveLength(9);
    for (const manifest of conicManifests) {
      const script = manifest.buildPublicPlaybook(manifest.parameterSchema?.defaults ?? {});
      expect(script.steps.map((step, index) => step.title.includes(
        expectedTitleCues[manifest.caseId][index],
      ))).toEqual(script.steps.map(() => true));

      for (const step of script.steps) {
        expect(step.voiceover_text.length).toBeGreaterThan(24);
        expect(step.snapshot.kind).toBe("math_scene");
        if (step.snapshot.kind !== "math_scene") continue;
        expect(step.snapshot.formula_latex?.trim()).toBeTruthy();
        expect(step.snapshot.caption?.trim()).toBeTruthy();
        expect(step.snapshot.caption).not.toBe(step.title);
        expect(step.snapshot.caption).not.toBe(step.voiceover_text);
      }
    }
  });

  it("shows the derivation and a concrete conclusion check instead of only naming results", () => {
    const byCase = new Map(PUBLIC_GOLD_TEMPLATES.filter(
      (manifest) => manifest.archetypeId.startsWith("conic."),
    ).map((manifest) => [
      manifest.caseId,
      manifest.buildPublicPlaybook(manifest.parameterSchema?.defaults ?? {}),
    ]));

    const stringConstruction = byCase.get("ellipse-string-construction")!;
    const trailScene = stringConstruction.steps[3].snapshot;
    const verifyScene = stringConstruction.steps[4].snapshot;
    expect(trailScene.kind).toBe("math_scene");
    expect(verifyScene.kind).toBe("math_scene");
    if (trailScene.kind === "math_scene" && verifyScene.kind === "math_scene") {
      expect(trailScene.curves ?? []).toHaveLength(0);
      expect(trailScene.points?.some((point) => point.semantic_role === "locus_trail")).toBe(true);
      expect(verifyScene.curves?.some((curve) => curve.semantic_role === "conic_curve")).toBe(true);
    }
    expect(stringConstruction.steps[4].voiceover_text).toContain("恰好等于 1");
    expect(stringConstruction.steps.at(-1)?.voiceover_text).toContain("退化为线段");
    expect(stringConstruction.steps.at(-1)?.voiceover_text).toContain("2a>2c");

    const ellipse = byCase.get("ellipse-focus-definition")!;
    expect(ellipse.steps[4].snapshot.kind).toBe("math_scene");
    expect(ellipse.steps[4].voiceover_text).toContain("变化项正好抵消");
    expect(ellipse.steps.at(-1)?.voiceover_text).toContain("10=2a");

    const parabola = byCase.get("parabola-focus-directrix")!;
    expect(parabola.steps[3].snapshot.kind).toBe("math_scene");
    if (parabola.steps[3].snapshot.kind === "math_scene") {
      expect(parabola.steps[3].snapshot.formula_latex).toContain("(t^2+1)=PH");
      expect(parabola.steps[0].snapshot.formula_latex).toContain("y^2=2px");
    }
    expect(parabola.steps.at(-1)?.voiceover_text).toMatch(/PF=\d+(?:\.\d+)?、PH=\d+(?:\.\d+)?/);

    const hyperbola = byCase.get("hyperbola-asymptotes")!;
    expect(hyperbola.steps[3].voiceover_text).toContain("x²−a²");
    expect(hyperbola.steps.at(-1)?.voiceover_text).toContain("当前数值 6 与推导一致");
    // 双曲函数超出高中范围：允许其留在机器侧曲线表达式里，但任何学生可见
    // 文本（旁白/公式/说明）都不得出现。
    for (const step of hyperbola.steps) {
      const visible = [
        step.voiceover_text,
        step.snapshot.kind === "math_scene" ? step.snapshot.formula_latex ?? "" : "",
        step.snapshot.kind === "math_scene" ? step.snapshot.caption ?? "" : "",
      ].join(" ");
      expect(visible).not.toMatch(/cosh|sinh|tanh/);
    }

    const lineEllipse = byCase.get("line-ellipse-position")!;
    expect(lineEllipse.steps.slice(1, 4).map((step) => step.voiceover_text)).toEqual([
      expect.stringContaining("两个实根"),
      expect.stringContaining("重根"),
      expect.stringContaining("无实数解"),
    ]);
    expect(lineEllipse.steps.at(-1)?.voiceover_text).toContain("所以直线与椭圆相交");

    const locus = byCase.get("ellipse-chord-midpoint-locus")!;
    const firstLocusScene = locus.steps[0].snapshot;
    const resultLocusScene = locus.steps.at(-1)?.snapshot;
    expect(firstLocusScene.kind).toBe("math_scene");
    expect(resultLocusScene?.kind).toBe("math_scene");
    if (firstLocusScene.kind === "math_scene" && resultLocusScene?.kind === "math_scene") {
      expect(firstLocusScene.points?.some((point) => point.semantic_role === "chord_midpoint"))
        .toBe(false);
      expect(resultLocusScene.points?.some((point) => point.semantic_role === "locus_trail"))
        .toBe(true);
      expect(resultLocusScene.curves?.some((curve) => curve.semantic_role === "theoretical_locus"))
        .toBe(true);
    }
    expect(locus.steps.at(-1)?.voiceover_text).toContain("左边计算为 0");

    const polePolar = byCase.get("pole-polar")!;
    const tangencyScene = polePolar.steps[1].snapshot;
    expect(tangencyScene.kind).toBe("math_scene");
    if (tangencyScene.kind === "math_scene") {
      expect(tangencyScene.segments?.filter(
        (segment) => segment.semantic_role === "radius_to_tangent",
      )).toHaveLength(2);
    }
    expect(polePolar.steps[4].voiceover_text).toContain("都等于 R²=25");
    expect(polePolar.steps.at(-1)?.voiceover_text).toContain("x+y=5");
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
    }, 1, [manifest.interactionAdapter!]);

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
    }, 1, [manifest.interactionAdapter!]).script;
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
    }, 1, [manifest.interactionAdapter!]).script;
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
    }, 1, [manifest.interactionAdapter!]).script;
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
    }, 1, [manifest.interactionAdapter!]);

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

  it("answers conic why-questions with step-specific mathematics, not engine wording", () => {
    const conicManifests = PUBLIC_GOLD_TEMPLATES.filter(
      (manifest) => manifest.domain === "conic_sections",
    );
    const whyByCaseStep = new Map<string, string>();
    for (const manifest of conicManifests) {
      const params = manifest.parameterSchema?.defaults ?? {};
      const script = manifest.buildPublicPlaybook(params);
      const followupMap = manifest.buildFollowups(params, script);
      for (const step of script.steps) {
        for (const preset of followupMap[step.step_id]) {
          expect(preset.answer).not.toContain("纯函数内核");
          expect(preset.answer).not.toContain("重新构建完整 Playbook");
        }
        whyByCaseStep.set(`${manifest.caseId}:${step.step_id}`, followupMap[step.step_id][2].answer);
      }
    }
    expect(whyByCaseStep.get("ellipse-focus-definition:ellipse-shape-parameters")).toContain("正好抵消");
    expect(whyByCaseStep.get("parabola-focus-directrix:parabola-distance")).toContain("配成 (x+p/2)²");
    expect(whyByCaseStep.get("hyperbola-asymptotes:hyperbola-summary")).toContain("ex 项抵消");
    expect(whyByCaseStep.get("line-ellipse-position:line-ellipse-tangent")).toContain("重合成一个");
    expect(whyByCaseStep.get("ellipse-chord-midpoint-locus:chord-vieta")).toContain("消去 m");
  });

  it("publishes all five semantic Follow-up intents for every active conic step", () => {
    const expectedActions = [
      "slow-current-segment",
      "change-explanation",
      "emphasize-conclusion",
      "set-parameter",
      "clarify-current-step",
    ];

    const conicManifests = PUBLIC_GOLD_TEMPLATES.filter(
      (manifest) => manifest.domain === "conic_sections",
    );
    for (const manifest of conicManifests) {
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
