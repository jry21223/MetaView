import { describe, expect, it } from "vitest";

import {
  CROSS_SUBJECT_PUBLIC_GOLD_TEMPLATES,
  monsoonState,
  traceTwoSum,
} from "./crossSubjectGoldTemplates";

describe("cross-subject public Gold Templates", () => {
  it("publishes one deterministic teacher case for each requested subject", () => {
    expect(CROSS_SUBJECT_PUBLIC_GOLD_TEMPLATES.map((item) => item.caseId)).toEqual([
      "two-sum",
      "redox-electron",
      "dna-replication",
      "monsoon",
    ]);
    expect(new Set(CROSS_SUBJECT_PUBLIC_GOLD_TEMPLATES.map((item) => item.subject))).toEqual(new Set([
      "computer_science",
      "high_school_chemistry",
      "high_school_biology",
      "high_school_geography",
    ]));
  });

  it("keeps every case structurally complete and every follow-up local to a step", () => {
    for (const item of CROSS_SUBJECT_PUBLIC_GOLD_TEMPLATES) {
      const defaults = item.parameterSchema?.defaults ?? {};
      const script = item.buildPublicPlaybook(defaults);
      const prompts = item.buildFollowups(defaults, script);
      expect(script.schema_version).toBe("2.0.0");
      expect(script.steps.length).toBeGreaterThanOrEqual(6);
      expect(script.steps.length).toBeGreaterThanOrEqual(item.pedagogicalRubric.minimumSteps);
      expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);
      expect(script.steps.map((step) => step.end_frame)).toEqual(
        script.steps.map((_, index) => (index + 1) * 90),
      );
      expect(new Set(script.steps.map((step) => step.step_id)).size).toBe(script.steps.length);
      expect(Object.keys(prompts)).toEqual(script.steps.map((step) => step.step_id));
      expect(script.steps.every((step) => prompts[step.step_id]?.length === 3)).toBe(true);
      expect(item.expectedFacts.length).toBeGreaterThanOrEqual(3);
      expect(item.visualInvariants[0].requiredStateFields.length).toBeGreaterThanOrEqual(4);
      expect(item.poster.url).toBe(`/template-previews/${item.caseId}/poster.webp`);
      expect(item.poster.frame).toBeLessThan(script.total_frames);
    }
  });

  it("traces Two Sum by checking before inserting and verifies all selectable targets", () => {
    const item = CROSS_SUBJECT_PUBLIC_GOLD_TEMPLATES.find((entry) => entry.caseId === "two-sum")!;
    for (const [target, expected] of [[9, [0, 1]], [18, [1, 2]], [26, [2, 3]]] as const) {
      const trace = traceTwoSum([2, 7, 11, 15], target);
      const match = trace.at(-1)!;
      expect([match.matchedIndex, match.index]).toEqual(expected);
      expect(match.seenBefore[match.complement]).toBe(match.matchedIndex);
      expect(match.seenBefore[match.value]).toBeUndefined();

      const script = item.buildPublicPlaybook({ target: String(target) });
      expect(script.steps.find((step) => step.step_id === "two-sum-verify")?.voiceover_text)
        .toContain(`=${target}`);
      expect(script.steps.every((step) => step.snapshot.kind === "code_trace_scene")).toBe(true);
    }
  });

  it("balances the zinc-copper redox explanation through two-electron half reactions", () => {
    const item = CROSS_SUBJECT_PUBLIC_GOLD_TEMPLATES.find((entry) => entry.caseId === "redox-electron")!;
    const script = item.buildPublicPlaybook({});
    expect(script.steps.map((step) => step.snapshot.kind)).toEqual(Array(6).fill("reaction_scene"));
    expect(script.steps[2].voiceover_text).toContain("Zn → Zn²⁺ + 2e⁻");
    expect(script.steps[3].voiceover_text).toContain("Cu²⁺ + 2e⁻ → Cu");
    expect(script.steps[5].voiceover_text).toContain("总电荷都为 +2");
    const transfer = script.steps[4].snapshot;
    expect(transfer.kind).toBe("reaction_scene");
    if (transfer.kind === "reaction_scene") {
      expect(transfer.electron_flows).toEqual(expect.arrayContaining([
        expect.objectContaining({ semantic_role: "electron_flow", label: "2e⁻" }),
      ]));
    }
  });

  it("states the direction, discontinuous synthesis, and semi-conservative result for DNA", () => {
    const item = CROSS_SUBJECT_PUBLIC_GOLD_TEMPLATES.find((entry) => entry.caseId === "dna-replication")!;
    const script = item.buildPublicPlaybook({ strandFocus: "lagging" });
    const payload = JSON.stringify(script);
    expect(script.steps.every((step) => step.snapshot.kind === "bio_process_scene")).toBe(true);
    expect(payload).toContain("5′→3′");
    expect(payload).toContain("冈崎片段");
    expect(payload).toContain("一条亲代旧链和一条新合成链");
    expect(payload).toContain('"asset_id":"dna-helix"');
    expect(payload).toContain('"asset_id":"replication-fork"');
    expect(payload).toContain("本画面是过程结构示意");
    const final = script.steps.at(-1)!.snapshot;
    expect(final.kind).toBe("bio_process_scene");
    if (final.kind === "bio_process_scene") {
      expect(final.steps.filter((step) => ["leading", "lagging"].includes(step.id)))
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ x: 68, width: 13 }),
          expect.objectContaining({ x: 68, width: 13 }),
        ]));
      expect(final.callouts?.map((callout) => callout.label)).toEqual([
        "旧链 + 新链",
        "旧链 + 新链",
      ]);
    }
  });

  it("reverses monsoon pressure and flow consistently between summer and winter", () => {
    const summer = monsoonState("summer");
    const winter = monsoonState("winter");
    expect(summer).toMatchObject({ landPressure: "low", oceanPressure: "high", moisture: "moist" });
    expect(winter).toMatchObject({ landPressure: "high", oceanPressure: "low", moisture: "dry" });
    expect(summer.flowFrom).toEqual(winter.flowTo);
    expect(summer.flowTo).toEqual(winter.flowFrom);

    const item = CROSS_SUBJECT_PUBLIC_GOLD_TEMPLATES.find((entry) => entry.caseId === "monsoon")!;
    const winterScript = item.buildPublicPlaybook({ season: "winter" });
    const final = winterScript.steps.at(-1)!;
    expect(final.voiceover_text).toContain("大陆为高压、海洋为低压");
    expect(final.voiceover_text).toContain("陆地吹向海洋");
    expect(final.snapshot.kind).toBe("geo_map_scene");
    if (final.snapshot.kind === "geo_map_scene") {
      expect(final.snapshot.flows[0]).toMatchObject({
        semantic_role: "monsoon_flow",
        from: [38, 35],
        to: [76, 64],
      });
      expect(final.snapshot.layers.map((layer) => layer.label)).toEqual(["东亚大陆", "海岸线"]);
      expect(final.snapshot.flows[0].label).toBe("陆 → 海");
    }
  });

  it("uses a verified result frame for Two Sum instead of the following summary state", () => {
    const item = CROSS_SUBJECT_PUBLIC_GOLD_TEMPLATES.find((entry) => entry.caseId === "two-sum")!;
    const script = item.buildPublicPlaybook(item.parameterSchema?.defaults ?? {});
    const frame = item.poster.frame;
    const representative = script.steps.find((step) => frame < step.end_frame);
    expect(representative?.step_id).toBe("two-sum-verify");
    expect(representative?.snapshot.kind).toBe("code_trace_scene");
    if (representative?.snapshot.kind === "code_trace_scene") {
      expect(representative.snapshot.active_line).toBe(5);
      expect(representative.snapshot.variables?.result).toBe("[0, 1]");
    }
  });
});
