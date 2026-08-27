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
      "physics_force_scene",
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

  it("shows the two-bullet strobe instead of merely narrating it", () => {
    const script = buildProjectileMotionPlaybook({ speed: 20, angle: 45, gravity: 9.8 });
    const opening = script.steps[0].snapshot;
    expect(opening.kind).toBe("physics_force_scene");
    if (opening.kind !== "physics_force_scene") return;

    expect(opening.ground_y).toBe(78);
    const roles = (opening.trajectories ?? []).map((item) => item.semantic_role);
    expect(roles).toEqual(["fired_trajectory", "drop_line", "equal_height_link"]);

    const dropLine = opening.trajectories!.find((item) => item.semantic_role === "drop_line")!;
    expect(new Set(dropLine.points.map(([x]) => x)).size).toBe(1);

    // Both bullet paths carry live tracers on the shared clock, and the drop
    // line is sampled in time (y ∝ f²) so equal index means equal height.
    const firedPath = opening.trajectories!.find((item) => item.semantic_role === "fired_trajectory")!;
    expect(firedPath.flow).toBe(true);
    expect(dropLine.flow).toBe(true);
    expect(dropLine.points).toHaveLength(firedPath.points.length);
    dropLine.points.forEach(([, y], index) => {
      expect(y).toBeCloseTo(firedPath.points[index][1], 9);
    });

    // Strobe pairs: at every sampled instant both bullets sit at the same height.
    const twins = opening.points!.filter((point) => point.semantic_role === "time_sample_twin");
    const fired = opening.points!.filter((point) => point.semantic_role === "time_sample");
    expect(twins).toHaveLength(5);
    expect(fired).toHaveLength(5);
    twins.forEach((twin, index) => {
      expect(fired[index].y).toBeCloseTo(twin.y, 9);
      expect(fired[index].x).toBeGreaterThan(twin.x);
    });
    expect(opening.annotations?.[0]?.text).toContain("同一时刻");

    // The single-trajectory teaching steps cruise a P(t) tracer; the
    // complementary overlay must not (its two arcs span different times).
    const compose = script.steps[5].snapshot;
    if (compose.kind === "physics_force_scene") {
      expect(compose.flow_tracer).toBe(true);
    }
    const overlay = script.steps[8].snapshot;
    if (overlay.kind === "physics_force_scene") {
      expect(overlay.trajectories?.some((item) => item.flow)).toBeFalsy();
    }
  });

  it("overlays the complementary angle onto one shared scale with a common landing point", () => {
    const tilted = buildProjectileMotionPlaybook({ speed: 20, angle: 30, gravity: 9.8 });
    const parabola = tilted.steps[8];
    expect(parabola.voiceover_text).toContain("同一个点");
    expect(parabola.snapshot.kind).toBe("physics_force_scene");
    if (parabola.snapshot.kind === "physics_force_scene") {
      const [current, complementary] = parabola.snapshot.trajectories!;
      expect(current.semantic_role).toBe("current_trajectory");
      expect(complementary.semantic_role).toBe("complementary_trajectory");
      const currentEnd = current.points.at(-1)!;
      const complementaryEnd = complementary.points.at(-1)!;
      expect(currentEnd[0]).toBeCloseTo(complementaryEnd[0], 6);
      expect(currentEnd[1]).toBeCloseTo(complementaryEnd[1], 6);
      // 60° flies higher than 30° on the same scale.
      const peak = (points: Array<[number, number]>) => Math.min(...points.map(([, y]) => y));
      expect(peak(complementary.points)).toBeLessThan(peak(current.points));
      expect(parabola.snapshot.points?.[0]).toMatchObject({ semantic_role: "landing_mark" });
      expect(parabola.snapshot.annotations?.[0]?.text).toBe("同一落点");
    }

    const symmetric = buildProjectileMotionPlaybook({ speed: 20, angle: 45, gravity: 9.8 });
    const symmetricParabola = symmetric.steps[8];
    expect(symmetricParabola.voiceover_text).toContain("互补对称轴");
    if (symmetricParabola.snapshot.kind === "physics_force_scene") {
      expect(symmetricParabola.snapshot.trajectories).toHaveLength(1);
    }
  });

  it("strobes the composed trajectory and marks apex and range at landing", () => {
    const script = buildProjectileMotionPlaybook({ speed: 20, angle: 45, gravity: 9.8 });
    const compose = script.steps[5].snapshot;
    if (compose.kind === "physics_force_scene") {
      expect(compose.points?.filter((point) => point.semantic_role === "time_sample")).toHaveLength(7);
    }
    const landing = script.steps[7].snapshot;
    if (landing.kind === "physics_force_scene") {
      const roles = landing.points?.map((point) => point.semantic_role);
      expect(roles).toEqual(["apex_mark", "landing_mark"]);
      expect(landing.points?.[0].label).toBe("H=10.2 m");
      // The range number sits below the ground line, clear of the vectors.
      expect(landing.annotations?.[0]).toMatchObject({ text: "R=40.82 m", semantic_role: "range_note" });
      expect(landing.annotations![0].y).toBeGreaterThan(landing.ground_y!);
    }
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
