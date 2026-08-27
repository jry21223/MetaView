import { describe, expect, it } from "vitest";

import { narrationStepFrames } from "../../narrationTiming";
import {
  DERIVATIVE_TANGENT_GOLD_TEMPLATE,
  buildDerivativeTangentGoldPlaybook,
} from "./derivativeTangentGoldTemplate";
import {
  INTEGRAL_AREA_GOLD_TEMPLATE,
  buildIntegralAreaGoldPlaybook,
  lowerRiemannSum,
  upperRiemannSum,
} from "./integralAreaGoldTemplate";

const MATH_GOLD_TEMPLATES = [
  DERIVATIVE_TANGENT_GOLD_TEMPLATE,
  INTEGRAL_AREA_GOLD_TEMPLATE,
] as const;

describe("calculus public Gold Templates", () => {
  it("keeps every case structurally complete with narration-paced timing", () => {
    for (const item of MATH_GOLD_TEMPLATES) {
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
        if (!control.steps) continue;
        expect(control.steps.length).toBeGreaterThan(0);
        for (const stepId of control.steps) {
          expect(stepIds.has(stepId)).toBe(true);
        }
      }
      expect(item.handsOnStepIds?.length).toBeGreaterThanOrEqual(1);
      expect(item.handsOnStepIds?.length).toBeLessThanOrEqual(3);
      for (const stepId of item.handsOnStepIds ?? []) {
        expect(stepIds.has(stepId)).toBe(true);
      }
      expect(Object.keys(prompts)).toEqual(script.steps.map((step) => step.step_id));
      expect(script.steps.every((step) => prompts[step.step_id]?.length === 3)).toBe(true);
      expect(item.expectedFacts.length).toBeGreaterThanOrEqual(3);
      expect(item.poster.url).toBe(`/template-previews/${item.caseId}/poster.webp`);
      expect(item.poster.frame).toBeLessThan(script.total_frames);
      const payload = JSON.stringify(script);
      for (const role of item.visualInvariants[0].requiredSemanticRoles) {
        expect(payload).toContain(`"semantic_role":"${role}"`);
      }
    }
  });

  it("opens the derivative on Galileo's folio 107v data and closes on the odd-number check", () => {
    const script = buildDerivativeTangentGoldPlaybook({ a: 2, h: 1 });
    expect(script.steps).toHaveLength(8);

    const data = script.steps[0];
    expect(data.voiceover_text).toContain("伽利略");
    expect(data.voiceover_text).toContain("2123");
    expect(data.snapshot.kind).toBe("math_plot");
    if (data.snapshot.kind === "math_plot") {
      expect(data.snapshot.curves).toHaveLength(0);
      expect(data.snapshot.points).toHaveLength(8);
      expect(data.snapshot.points?.[0]).toMatchObject({ x: 1, y: 1 });
      expect(data.snapshot.points?.at(-1)?.x).toBe(8);
      expect(data.snapshot.points?.at(-1)?.y).toBeCloseTo(2123 / 33, 6);
    }

    const secant = script.steps[2];
    expect(secant.voiceover_text).toContain("2a+h=5");
    if (secant.snapshot.kind === "math_plot") {
      expect(secant.snapshot.curves[1]?.expression).toBe("5*x-6");
      expect(secant.snapshot.marker_x).toBe(2);
      expect(secant.snapshot.shade_from).toBe(2);
      expect(secant.snapshot.shade_to).toBe(3);
    }

    const tangent = script.steps[4];
    expect(tangent.voiceover_text).toContain("f′(2)=4");
    if (tangent.snapshot.kind === "math_plot") {
      expect(tangent.snapshot.curves[1]?.expression).toBe("4*x-4");
      expect(tangent.snapshot.curves[1]?.semantic_role).toBe("tangent");
    }

    const verify = script.steps[6];
    expect(verify.voiceover_text).toContain("9.03");
    if (verify.snapshot.kind === "math_plot") {
      expect(verify.snapshot.marker_x).toBe(4.5);
      expect(verify.snapshot.shade_from).toBe(4);
      expect(verify.snapshot.shade_to).toBe(5);
    }
  });

  it("recomputes secant and tangent lines from the a and h controls", () => {
    const moved = buildDerivativeTangentGoldPlaybook({ a: 3, h: 0.5 });
    const secant = moved.steps[2];
    expect(secant.voiceover_text).toContain("2a+h=6.5");
    if (secant.snapshot.kind === "math_plot") {
      expect(secant.snapshot.curves[1]?.expression).toBe("6.5*x-10.5");
    }
    const tangent = moved.steps[4];
    expect(tangent.voiceover_text).toContain("f′(3)=6");
    if (tangent.snapshot.kind === "math_plot") {
      expect(tangent.snapshot.curves[1]?.expression).toBe("6*x-9");
    }

    const clamped = buildDerivativeTangentGoldPlaybook({ a: 99, h: -1 });
    expect(clamped.parameter_controls.map((control) => control.value)).toEqual(["3.5", "0.05"]);
    expect(JSON.stringify(clamped)).not.toContain("NaN");
  });

  it("answers the derivative mechanism questions with step-specific mathematics", () => {
    const defaults = DERIVATIVE_TANGENT_GOLD_TEMPLATE.parameterSchema!.defaults;
    const script = DERIVATIVE_TANGENT_GOLD_TEMPLATE.buildPublicPlaybook(defaults);
    const followups = DERIVATIVE_TANGENT_GOLD_TEMPLATE.buildFollowups(defaults, script);
    expect(followups["derivative-shrink-h"][1].answer).toContain("误差恰好等于间隔");
    expect(followups["derivative-verify-odd"][1].answer).toContain("中点");
    expect(followups["derivative-skeleton"][1].answer).toContain("|t|");
  });

  it("squeezes the integral between exact lower and upper Riemann sums", () => {
    expect(upperRiemannSum(2, 4)).toBeCloseTo(3.75, 12);
    expect(lowerRiemannSum(2, 4)).toBeCloseTo(1.75, 12);
    expect(upperRiemannSum(2, 4) - lowerRiemannSum(2, 4)).toBeCloseTo(8 / 4, 12);
    expect(upperRiemannSum(2, 1024)).toBeGreaterThan(8 / 3);
    expect(lowerRiemannSum(2, 1024)).toBeLessThan(8 / 3);

    const script = buildIntegralAreaGoldPlaybook({ n: 4, b: 2 });
    expect(script.steps).toHaveLength(8);

    const lower = script.steps[1];
    expect(lower.snapshot.kind).toBe("math_scene");
    if (lower.snapshot.kind === "math_scene") {
      // Left endpoints: the k=0 rectangle has zero height and is skipped.
      expect(lower.snapshot.regions).toHaveLength(3);
      expect(lower.snapshot.regions?.every(
        (region) => region.semantic_role === "riemann_rectangle",
      )).toBe(true);
    }

    const upper = script.steps[2];
    expect(upper.voiceover_text).toContain("1.75 < S < 3.75");
    if (upper.snapshot.kind === "math_scene") {
      expect(upper.snapshot.regions).toHaveLength(7);
    }

    const refine = script.steps[3];
    expect(refine.voiceover_text).toContain("n=8，2.19 与 3.19");
    expect(refine.voiceover_text).toContain("n=64，2.6 与 2.73");

    expect(script.steps[4].voiceover_text).toContain("n(n+1)(2n+1)/6");
    expect(script.steps[5].voiceover_text).toContain("2.67");
    expect(script.steps[6].voiceover_text).toContain("F(x)=x³/3");
    expect(script.steps[7].voiceover_text).toContain("27/3=9");
  });

  it("rebuilds every integral quantity when n and b change", () => {
    const dense = buildIntegralAreaGoldPlaybook({ n: 64, b: 2 });
    const refine = dense.steps[3];
    if (refine.snapshot.kind === "math_scene") {
      // 64 upper + 63 lower rectangles (left-endpoint k=0 skipped).
      expect(refine.snapshot.regions).toHaveLength(127);
    }
    expect(refine.voiceover_text).toContain(`n=64`);

    const widened = buildIntegralAreaGoldPlaybook({ n: 4, b: 3 });
    expect(widened.steps[5].voiceover_text).toContain("S=lim Σf(xₖ)Δx=9");
    expect(widened.steps[6].voiceover_text).toContain("F(3)−F(0)=9");
    expect(upperRiemannSum(3, 4) - lowerRiemannSum(3, 4)).toBeCloseTo(27 / 4, 12);

    const clamped = buildIntegralAreaGoldPlaybook({ n: 0, b: 99 });
    expect(clamped.parameter_controls.map((control) => control.value)).toEqual(["2", "3"]);
    expect(JSON.stringify(clamped)).not.toContain("NaN");
  });
});
