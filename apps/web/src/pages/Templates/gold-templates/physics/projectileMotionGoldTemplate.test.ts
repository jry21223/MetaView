import { describe, expect, it } from "vitest";

import { narrationStepFrames } from "../../narrationTiming";
import {
  PROJECTILE_MOTION_GOLD_TEMPLATE,
  buildProjectileMotionPlaybook,
} from "./projectileMotionGoldTemplate";

describe("projectile motion public Gold Template", () => {
  it("publishes a complete teacher-grade manifest", () => {
    expect(PROJECTILE_MOTION_GOLD_TEMPLATE).toMatchObject({
      caseId: "projectile",
      archetypeId: "physics.projectile.motion-decomposition",
      subject: "high_school_physics",
      domain: "projectile_motion",
      visibility: "public",
    });
    expect(PROJECTILE_MOTION_GOLD_TEMPLATE.requiredCapabilities.length).toBeGreaterThanOrEqual(5);
    expect(PROJECTILE_MOTION_GOLD_TEMPLATE.expectedFacts).toHaveLength(6);
    expect(PROJECTILE_MOTION_GOLD_TEMPLATE.pedagogicalRubric.minimumSteps).toBe(10);
    expect(PROJECTILE_MOTION_GOLD_TEMPLATE.parameterSchema?.controls.map((control) => control.id))
      .toEqual(["speed", "angle", "gravity"]);
    expect(PROJECTILE_MOTION_GOLD_TEMPLATE.poster.url).toBe("/template-previews/projectile/poster.webp");
    expect(PROJECTILE_MOTION_GOLD_TEMPLATE.handsOnStepIds).toEqual([
      "projectile-landing",
      "projectile-moon",
    ]);
  });

  it("teaches the two-bullet opening, decomposition, composition, and the moon boundary", () => {
    const script = buildProjectileMotionPlaybook({ speed: 20, angle: 45, gravity: 9.8 });
    expect(script.steps.map((step) => step.step_id)).toEqual([
      "projectile-two-bullets",
      "projectile-decompose",
      "projectile-horizontal",
      "projectile-vertical-velocity",
      "projectile-vertical-position",
      "projectile-compose",
      "projectile-apex",
      "projectile-landing",
      "projectile-parabola",
      "projectile-moon",
    ]);
    expect(script.steps.map((step) => step.snapshot.kind)).toEqual([
      "physics_force_scene",
      "physics_force_scene",
      "math_plot",
      "math_plot",
      "math_plot",
      "physics_force_scene",
      "physics_force_scene",
      "physics_force_scene",
      "math_formula",
      "physics_force_scene",
    ]);
    expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);
    let previousEnd = 0;
    for (const step of script.steps) {
      expect(step.end_frame - previousEnd).toBe(narrationStepFrames(step.voiceover_text, 30));
      previousEnd = step.end_frame;
    }

    expect(script.steps[0].voiceover_text).toContain("0.039");
    expect(script.steps[1].voiceover_text).toContain("14.14");
    expect(script.steps[4].voiceover_text).toContain("同时落地");
    expect(script.steps[7].voiceover_text).toContain("45°");
    expect(script.steps[7].voiceover_text).toContain("90°−θ");
    expect(script.steps[8].voiceover_text).toContain("两门新科学");
    expect(script.steps[9].voiceover_text).toContain("阿波罗 14");
  });

  it("keeps the semantic teaching objects and equations in the Playbook contract", () => {
    const script = buildProjectileMotionPlaybook({ speed: 20, angle: 45, gravity: 9.8 });
    const payload = JSON.stringify(script);

    for (const role of PROJECTILE_MOTION_GOLD_TEMPLATE.visualInvariants[0].requiredSemanticRoles) {
      expect(payload).toContain(`"semantic_role":"${role}"`);
    }
    expect(payload).toContain("projectile-body");
    expect(payload).toContain("gravity-acceleration");
    expect(payload).toContain("x(t)");
    expect(payload).toContain("y(t)");
  });

  it("provides three step-local follow-ups with step-specific mechanisms", () => {
    const params = { speed: 20, angle: 45, gravity: 9.8 };
    const script = PROJECTILE_MOTION_GOLD_TEMPLATE.buildPublicPlaybook(params);
    const followups = PROJECTILE_MOTION_GOLD_TEMPLATE.buildFollowups(params, script);

    for (const step of script.steps) {
      expect(followups[step.step_id]).toHaveLength(3);
      expect(followups[step.step_id].every((item) => item.id.startsWith(step.step_id))).toBe(true);
    }
    expect(followups["projectile-two-bullets"][1].answer).toContain("枪管微小上仰");
    expect(followups["projectile-landing"][1].answer).toContain("sin2θ");
    expect(followups["projectile-moon"][1].answer).toContain("反比于 g");
  });

  it("recomputes every dependent fact when g changes", () => {
    const earth = buildProjectileMotionPlaybook({ speed: 20, angle: 45, gravity: 9.8 });
    const strongerGravity = buildProjectileMotionPlaybook({ speed: 20, angle: 45, gravity: 19.6 });
    const earthLanding = earth.steps.find((step) => step.step_id === "projectile-landing")!;
    const strongLanding = strongerGravity.steps.find((step) => step.step_id === "projectile-landing")!;

    expect(earth.initial_data?.gravity).not.toEqual(strongerGravity.initial_data?.gravity);
    expect(earthLanding.voiceover_text).toContain("2.89");
    expect(earthLanding.voiceover_text).toContain("40.82");
    expect(strongLanding.voiceover_text).toContain("1.44");
    expect(strongLanding.voiceover_text).toContain("20.41");

    const moon = buildProjectileMotionPlaybook({ speed: 20, angle: 45, gravity: 1.62 });
    expect(moon.steps.at(-1)?.voiceover_text).toContain("月球弹道附近");
  });

  it.each([
    [{ speed: 0, angle: 45, gravity: 9.8 }, "stationary", "T=H=R=0"],
    [{ speed: 20, angle: 0, gravity: 9.8 }, "ground-tangent", "没有正的腾空时间"],
    [{ speed: 20, angle: 90, gravity: 9.8 }, "vertical-launch", "竖直上抛过程仍完整存在"],
  ])("renders finite boundary case %#", (params, boundaryCase, explanation) => {
    const script = buildProjectileMotionPlaybook(params);
    const payload = JSON.stringify(script);

    expect(script.initial_data?.boundary_case).toEqual([boundaryCase]);
    expect(payload).toContain(explanation);
    expect(payload).not.toContain("NaN");
    expect(payload).not.toContain("Infinity");
  });

  it("falls back or clamps illegal public parameters without corrupting facts", () => {
    const script = buildProjectileMotionPlaybook({
      speed: "not-a-number",
      angle: 200,
      gravity: -50,
    });

    expect(script.parameter_controls.map((control) => control.value)).toEqual(["20", "90", "1.6"]);
    expect(script.initial_data?.boundary_case).toEqual(["vertical-launch"]);
    expect(JSON.stringify(script)).not.toContain("NaN");
  });
});
