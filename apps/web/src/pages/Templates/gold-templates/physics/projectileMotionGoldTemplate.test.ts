import { describe, expect, it } from "vitest";

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
    expect(PROJECTILE_MOTION_GOLD_TEMPLATE.expectedFacts).toHaveLength(4);
    expect(PROJECTILE_MOTION_GOLD_TEMPLATE.pedagogicalRubric.minimumSteps).toBe(10);
    expect(PROJECTILE_MOTION_GOLD_TEMPLATE.parameterSchema?.controls.map((control) => control.id))
      .toEqual(["speed", "angle", "gravity"]);
    expect(PROJECTILE_MOTION_GOLD_TEMPLATE.poster).toMatchObject({
      url: "/template-previews/projectile/poster.webp",
      frame: 600,
    });
  });

  it("teaches observation, decomposition, time relations, composition, key moments, and verification", () => {
    const script = buildProjectileMotionPlaybook({ speed: 20, angle: 45, gravity: 9.8 });
    expect(script.steps.map((step) => step.step_id)).toEqual([
      "projectile-observe",
      "projectile-decompose",
      "projectile-horizontal",
      "projectile-vertical-velocity",
      "projectile-vertical-position",
      "projectile-compose-trajectory",
      "projectile-apex",
      "projectile-landing",
      "projectile-eliminate-time",
      "projectile-verify-boundaries",
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
      "math_formula",
    ]);
    expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);
    expect(script.steps.every((step) => step.layers?.length === 1)).toBe(true);
    expect(script.steps.every((step) => step.layers?.[0].body === step.snapshot)).toBe(true);
  });

  it("keeps the equations and semantic teaching objects in the Playbook contract", () => {
    const script = buildProjectileMotionPlaybook({ speed: 20, angle: 45, gravity: 9.8 });
    const payload = JSON.stringify(script);

    for (const role of PROJECTILE_MOTION_GOLD_TEMPLATE.visualInvariants[0].requiredSemanticRoles) {
      expect(payload).toContain(`"semantic_role":"${role}"`);
    }
    expect(payload).toContain("projectile-body");
    expect(payload).toContain("horizontal-velocity");
    expect(payload).toContain("vertical-velocity");
    expect(payload).toContain("gravity-acceleration");
    expect(payload).toContain("x(t)");
    expect(payload).toContain("y(t)");
  });

  it("provides five local questions for every step", () => {
    const params = { speed: 20, angle: 45, gravity: 9.8 };
    const script = PROJECTILE_MOTION_GOLD_TEMPLATE.buildPublicPlaybook(params);
    const followups = PROJECTILE_MOTION_GOLD_TEMPLATE.buildFollowups(params, script);

    for (const step of script.steps) {
      expect(followups[step.step_id]).toHaveLength(5);
      expect(followups[step.step_id].every((item) => item.id.startsWith(step.step_id)))
        .toBe(true);
    }
    expect(followups["projectile-apex"][0].answer).toContain("vᵧ=0");
    expect(followups["projectile-eliminate-time"][1].answer).toContain("vₓ=0");
  });

  it("recomputes every dependent fact when g changes", () => {
    const earth = buildProjectileMotionPlaybook({ speed: 20, angle: 45, gravity: 9.8 });
    const strongerGravity = buildProjectileMotionPlaybook({ speed: 20, angle: 45, gravity: 19.6 });
    const earthData = earth.initial_data!;
    const strongData = strongerGravity.initial_data!;
    const earthLanding = earth.steps.find((step) => step.step_id === "projectile-landing")!;
    const strongLanding = strongerGravity.steps.find((step) => step.step_id === "projectile-landing")!;

    expect(earthData.speed).toEqual(strongData.speed);
    expect(earthData.angle).toEqual(strongData.angle);
    expect(earthData.gravity).not.toEqual(strongData.gravity);
    expect(earthLanding.voiceover_text).toContain("T=2.89 s");
    expect(strongLanding.voiceover_text).toContain("T=1.44 s");
    expect(strongLanding.voiceover_text).toContain("20.41 m");
  });

  it.each([
    [{ speed: 0, angle: 45, gravity: 9.8 }, "stationary", "T=H=R=0"],
    [{ speed: 20, angle: 0, gravity: 9.8 }, "ground-tangent", "没有正的腾空时间"],
    [{ speed: 20, angle: 90, gravity: 9.8 }, "vertical-launch", "R=0"],
  ])("renders finite boundary case %#", (params, boundaryCase, explanation) => {
    const script = buildProjectileMotionPlaybook(params);
    const payload = JSON.stringify(script);
    const verification = script.steps.find((step) => step.step_id === "projectile-verify-boundaries")!;

    expect(script.initial_data?.boundary_case).toEqual([boundaryCase]);
    expect(verification.voiceover_text).toContain(explanation);
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
