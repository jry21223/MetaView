import { describe, expect, it } from "vitest";

import {
  buildCompetitionGoldPlaybook,
  buildIslandBiogeographyGoldPlaybook,
  buildPredatorPreyGoldPlaybook,
  competitionInterior,
  competitionRegime,
  ECOLOGY_PUBLIC_GOLD_TEMPLATES,
  islandRates,
} from "./ecologyGoldTemplates";
import { narrationStepFrames } from "../../narrationTiming";

describe("ecology interaction & community Gold Templates", () => {
  it("publishes the three new university-ecology cases", () => {
    expect(ECOLOGY_PUBLIC_GOLD_TEMPLATES.map((item) => item.caseId)).toEqual([
      "predator-prey",
      "competition-exclusion",
      "island-biogeography",
    ]);
    for (const item of ECOLOGY_PUBLIC_GOLD_TEMPLATES) {
      expect(item.subject).toBe("university_ecology");
      expect(item.domain).toBe("biology");
    }
  });

  it("keeps every case structurally complete and every follow-up local to a step", () => {
    for (const item of ECOLOGY_PUBLIC_GOLD_TEMPLATES) {
      const defaults = item.parameterSchema?.defaults ?? {};
      const script = item.buildPublicPlaybook(defaults);
      const prompts = item.buildFollowups(defaults, script);
      expect(script.schema_version).toBe("2.0.0");
      expect(script.steps.length).toBeGreaterThanOrEqual(item.pedagogicalRubric.minimumSteps);
      expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);
      let previousEnd = 0;
      for (const step of script.steps) {
        expect(step.end_frame - previousEnd).toBe(narrationStepFrames(step.voiceover_text, 30));
        previousEnd = step.end_frame;
      }
      const stepIds = new Set(script.steps.map((step) => step.step_id));
      expect(stepIds.size).toBe(script.steps.length);
      for (const control of item.parameterSchema?.controls ?? []) {
        expect(control.steps?.length ?? 0).toBeGreaterThan(0);
        for (const stepId of control.steps ?? []) {
          expect(stepIds.has(stepId)).toBe(true);
        }
      }
      expect(item.handsOnStepIds?.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(item.handsOnStepIds?.length ?? 0).toBeLessThanOrEqual(3);
      for (const stepId of item.handsOnStepIds ?? []) {
        expect(stepIds.has(stepId)).toBe(true);
      }
      expect(Object.keys(prompts)).toEqual(script.steps.map((step) => step.step_id));
      expect(script.steps.every((step) => prompts[step.step_id]?.length === 3)).toBe(true);
      expect(item.expectedFacts.length).toBeGreaterThanOrEqual(3);
      expect(item.visualInvariants[0].requiredStateFields.length).toBeGreaterThanOrEqual(4);
      expect(item.poster.url).toBe(`/template-previews/${item.caseId}/poster.webp`);
      expect(item.poster.frame).toBeLessThan(script.total_frames);
      const payload = JSON.stringify(script);
      for (const role of item.visualInvariants[0].requiredSemanticRoles) {
        expect(payload).toContain(`"semantic_role":"${role}"`);
      }
    }
  });

  it("teaches predation from the pelt record to the Volterra principle", () => {
    const script = buildPredatorPreyGoldPlaybook({ r: 0.55, a: 0.028, q: 0, N0: 30 });
    expect(script.steps).toHaveLength(9);

    // The opening carries both 21-year pelt series verbatim.
    const opening = script.steps[0].snapshot;
    expect(opening.kind).toBe("math_plot");
    if (opening.kind === "math_plot") {
      expect(opening.polylines).toHaveLength(2);
      expect(opening.polylines![0].points).toHaveLength(21);
      expect(opening.polylines![0].points[0]).toEqual([0, 30]);
      expect(opening.polylines![0].points.at(-1)).toEqual([20, 24.7]);
      expect(opening.polylines![1].points[0]).toEqual([0, 4]);
    }

    // Equilibrium narration matches m/(ea) and r/a.
    expect(script.steps[3].voiceover_text).toContain("(34, 20)");
    // H = eaN − m·lnN + aP − r·lnP is conserved along the sampled orbit.
    const phase = script.steps[3].snapshot;
    if (phase.kind === "math_plot") {
      const orbit = phase.polylines![0].points;
      const H = ([n, p]: [number, number]) =>
        0.75 * 0.028 * n - 0.72 * Math.log(n) + 0.028 * p - 0.55 * Math.log(p);
      const h0 = H(orbit[0]);
      for (const point of orbit) {
        expect(Math.abs(H(point) - h0) / Math.abs(h0)).toBeLessThan(0.005);
      }
    }

    // The data loop step pairs the two pelt series into one phase trajectory.
    const loop = script.steps[5].snapshot;
    if (loop.kind === "math_plot") {
      expect(loop.polylines![0].points).toHaveLength(21);
      expect(loop.polylines![0].points[0]).toEqual([30, 4]);
    }

    // Volterra: harvesting shifts the averages toward more prey, fewer predators.
    const harvested = buildPredatorPreyGoldPlaybook({ r: 0.55, a: 0.028, q: 0.15, N0: 30 });
    const volterra = harvested.steps[6];
    expect(volterra.voiceover_text).toContain("(41, 14)");
    if (volterra.snapshot.kind === "math_plot") {
      expect(volterra.snapshot.points?.some(
        (point) => point.semantic_role === "shifted_equilibrium",
      )).toBe(true);
    }
    // q ≥ r collapses the predator and lets LV prey escape.
    const collapsed = buildPredatorPreyGoldPlaybook({ r: 0.3, a: 0.028, q: 0.35, N0: 30 });
    expect(collapsed.steps[6].voiceover_text).toContain("指数逃逸");

    // Density dependence damps the neutral cycle into the predicted focus.
    const damped = script.steps[7].snapshot;
    if (damped.kind === "math_plot") {
      const spiral = damped.polylines![0].points;
      const [nEnd, pEnd] = spiral.at(-1)!;
      expect(Math.abs(nEnd - 0.72 / (0.75 * 0.028))).toBeLessThan(2);
      expect(Math.abs(pEnd - (0.55 / 0.028) * (1 - 34.3 / 150))).toBeLessThan(2);
      const half = Math.floor(spiral.length / 2);
      const earlyMax = Math.max(...spiral.slice(0, half).map(([n]) => n));
      const lateMax = Math.max(...spiral.slice(half).map(([n]) => n));
      expect(earlyMax).toBeGreaterThan(55);
      expect(lateMax).toBeLessThan(42);
    }

    // N0 flows into the slider-driven orbits.
    const moved = buildPredatorPreyGoldPlaybook({ r: 0.55, a: 0.028, q: 0, N0: 60 });
    for (const stepIndex of [3, 4, 8]) {
      const snapshot = moved.steps[stepIndex].snapshot;
      if (snapshot.kind === "math_plot") {
        expect(snapshot.polylines?.[0]?.points[0]).toEqual([60, 4]);
      }
    }
  });

  it("walks competition through exclusion, coexistence, and founder control", () => {
    const script = buildCompetitionGoldPlaybook({ alpha: 1.5, beta: 0.7, N10: 2, N20: 2 });
    expect(script.steps).toHaveLength(9);

    // Gause's mixture: caudatum rises for about a week, then slides out.
    expect(script.steps[1].voiceover_text).toContain("第 8 天冲到约 24");
    const mixture = script.steps[1].snapshot;
    if (mixture.kind === "math_plot") {
      const caudatum = mixture.polylines![1].points;
      const at = (day: number) => caudatum.find(([t]) => t >= day)![1];
      expect(at(24)).toBeLessThan(9);
      expect(Math.max(...caudatum.map(([, n]) => n))).toBeGreaterThan(20);
    }

    // Exclusion geometry: trajectory ends on the winner's axis.
    const exclusion = script.steps[4].snapshot;
    if (exclusion.kind === "math_plot") {
      const tail = exclusion.polylines![2].points.at(-1)!;
      expect(tail[0]).toBeGreaterThan(98);
      expect(tail[1]).toBeLessThan(2);
    }

    // Stable coexistence lands on the interior equilibrium.
    const interior = competitionInterior(0.6, 0.4);
    expect(interior.n1).toBeCloseTo(87.6, 1);
    expect(interior.n2).toBeCloseTo(28.9, 1);
    expect(script.steps[5].voiceover_text).toContain("(88, 29)");
    const coexist = script.steps[5].snapshot;
    if (coexist.kind === "math_plot") {
      for (const lineIndex of [2, 3]) {
        const end = coexist.polylines![lineIndex].points.at(-1)!;
        expect(end[0]).toBeCloseTo(interior.n1, 0);
        expect(end[1]).toBeCloseTo(interior.n2, 0);
      }
    }

    // Founder control: the two pinned starts reach opposite winners.
    const founder = script.steps[6].snapshot;
    if (founder.kind === "math_plot") {
      const first = founder.polylines![2].points.at(-1)!;
      const second = founder.polylines![3].points.at(-1)!;
      expect(first[0]).toBeGreaterThan(95);
      expect(first[1]).toBeLessThan(2);
      expect(second[0]).toBeLessThan(5);
      expect(second[1]).toBeGreaterThan(55);
    }

    // The regime map covers all four textbook outcomes.
    expect(competitionRegime(1.5, 0.7)).toBe("双小核草履虫稳赢");
    expect(competitionRegime(1.8, 0.5)).toBe("大草履虫稳赢");
    expect(competitionRegime(0.6, 0.4)).toBe("稳定共存");
    expect(competitionRegime(1.8, 0.9)).toBe("先到者赢");
    const sandbox = buildCompetitionGoldPlaybook({ alpha: 0.6, beta: 0.4, N10: 2, N20: 2 });
    expect(sandbox.steps[8].voiceover_text).toContain("稳定共存");
    expect(sandbox.steps[8].voiceover_text).toContain("(88, 29)");
  });

  it("balances immigration against extinction and recovers the species-area rule", () => {
    const script = buildIslandBiogeographyGoldPlaybook({ A: 10, D: 40, P: 100 });
    expect(script.steps).toHaveLength(9);

    // Wilson's Krakatau equilibrium: about 30 species.
    const defaults = islandRates(10, 40, 100);
    expect(defaults.sStar).toBeCloseTo(30, 0);
    expect(script.steps[2].voiceover_text).toContain("S*=30");

    // The census points ride the opening and closing steps.
    for (const stepIndex of [0, 8]) {
      const snapshot = script.steps[stepIndex].snapshot;
      if (snapshot.kind === "math_plot") {
        expect(snapshot.points).toHaveLength(4);
        expect(snapshot.points?.at(-1)).toMatchObject({ x: 50, y: 29 });
      }
    }

    // Area and distance effects both drag the equilibrium to about 12.
    expect(islandRates(1, 40, 100).sStar).toBeCloseTo(11.9, 1);
    expect(islandRates(10, 200, 100).sStar).toBeCloseTo(12.3, 1);
    expect(script.steps[4].voiceover_text).toContain("掉到 12");
    expect(script.steps[5].voiceover_text).toContain("掉到 12");

    // Tenfold area roughly doubles the equilibrium: z lands in 0.28–0.40.
    const s1 = islandRates(1, 40, 100).sStar;
    const s10 = islandRates(10, 40, 100).sStar;
    const s100 = islandRates(100, 40, 100).sStar;
    expect(Math.log10(s10 / s1)).toBeGreaterThan(0.25);
    expect(Math.log10(s10 / s1)).toBeLessThan(0.45);
    expect(Math.log10(s100 / s10)).toBeGreaterThan(0.25);
    expect(Math.log10(s100 / s10)).toBeLessThan(0.45);
    expect(script.steps[6].voiceover_text).toContain("翻一番");

    // Turnover narration matches μ·S* at the current parameters.
    const turnover = defaults.ce * defaults.sStar;
    expect(script.steps[3].voiceover_text).toContain(`${turnover.toFixed(1)} 种/年`);

    // Sliders actually move the crossing.
    const far = buildIslandBiogeographyGoldPlaybook({ A: 10, D: 200, P: 100 });
    expect(far.steps[2].voiceover_text).toContain("S*=12");
    const large = buildIslandBiogeographyGoldPlaybook({ A: 100, D: 40, P: 100 });
    expect(large.steps[2].voiceover_text).toContain("S*=57");
  });
});
