import { describe, expect, it } from "vitest";

import { narrationStepFrames } from "../../narrationTiming";
import {
  SPRING_SHM_GOLD_TEMPLATE,
  buildSpringShmGoldPlaybook,
  solveShm,
} from "./springShmGoldTemplate";

describe("spring SHM public Gold Template", () => {
  it("solves the closed-form quantities from k, m, A", () => {
    const state = solveShm({ A: 0.5, k: 4, m: 1 });
    expect(state.omega).toBeCloseTo(2, 12);
    expect(state.period).toBeCloseTo(Math.PI, 12);
    expect(state.maxSpeed).toBeCloseTo(1, 12);
    expect(state.energy).toBeCloseTo(0.5, 12);

    const heavy = solveShm({ A: 0.5, k: 4, m: 4 });
    expect(heavy.period).toBeCloseTo(2 * Math.PI, 12);
    const stiff = solveShm({ A: 0.5, k: 16, m: 1 });
    expect(stiff.period).toBeCloseTo(Math.PI / 2, 12);
  });

  it("keeps the lesson structurally complete with narration-paced timing", () => {
    const defaults = SPRING_SHM_GOLD_TEMPLATE.parameterSchema!.defaults;
    const script = SPRING_SHM_GOLD_TEMPLATE.buildPublicPlaybook(defaults);
    const followups = SPRING_SHM_GOLD_TEMPLATE.buildFollowups(defaults, script);

    expect(script.steps.map((step) => step.step_id)).toEqual([
      "shm-hooke",
      "shm-restoring",
      "shm-newton",
      "shm-cosine",
      "shm-isochronism",
      "shm-energy",
      "shm-phase",
      "shm-universality",
      "shm-boundary",
    ]);
    expect(script.steps.map((step) => step.snapshot.kind)).toEqual([
      "physics_force_scene",
      "physics_force_scene",
      "math_formula",
      "math_plot",
      "math_plot",
      "math_plot",
      "phase_portrait_scene",
      "math_plot",
      "math_plot",
    ]);
    expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);
    let previousEnd = 0;
    for (const step of script.steps) {
      expect(step.end_frame - previousEnd).toBe(narrationStepFrames(step.voiceover_text, 30));
      previousEnd = step.end_frame;
    }
    const stepIds = new Set(script.steps.map((step) => step.step_id));
    for (const control of SPRING_SHM_GOLD_TEMPLATE.parameterSchema?.controls ?? []) {
      for (const stepId of control.steps ?? []) {
        expect(stepIds.has(stepId)).toBe(true);
      }
    }
    for (const stepId of SPRING_SHM_GOLD_TEMPLATE.handsOnStepIds ?? []) {
      expect(stepIds.has(stepId)).toBe(true);
    }
    expect(script.steps.every((step) => followups[step.step_id]?.length === 3)).toBe(true);

    const payload = JSON.stringify(script);
    for (const role of SPRING_SHM_GOLD_TEMPLATE.visualInvariants[0].requiredSemanticRoles) {
      expect(payload).toContain(`"semantic_role":"${role}"`);
    }
    expect(payload).toContain("ceiiinosssttuv");
  });

  it("draws an actual spring: wall, coil to the mass edge, equilibrium and range marks", () => {
    const script = buildSpringShmGoldPlaybook({ A: 0.5, k: 4, m: 1 });
    const scene = script.steps[0].snapshot;
    expect(scene.kind).toBe("physics_force_scene");
    if (scene.kind !== "physics_force_scene") return;

    const coil = scene.springs![0];
    expect(coil.semantic_role).toBe("spring_coil");
    expect(coil.x0).toBe(13);
    // Mass center 50 + 0.5·25 = 62.5; the coil stops at the mass edge (radius 4).
    expect(coil.x1).toBeCloseTo(58.5, 9);
    expect(coil.label).toBe("k=4 N/m");

    const roles = scene.trajectories!.map((item) => item.semantic_role);
    expect(roles).toEqual(["wall", "amplitude_range"]);
    expect(scene.points?.[0]).toMatchObject({ x: 50, semantic_role: "equilibrium_mark" });

    // The ±A ruler doubles as the flow tracer's rail: one full period of
    // x(t)=A·cos(ωt) sampled uniformly in time, so the shared-clock tracer
    // performs real simple harmonic motion along a visually unchanged line.
    const rail = scene.trajectories!.find((item) => item.semantic_role === "amplitude_range")!;
    expect(rail.flow).toBe(true);
    expect(rail.points).toHaveLength(49);
    expect(rail.points.every(([, y]) => y === 64)).toBe(true);
    expect(rail.points[0][0]).toBeCloseTo(50 + 0.5 * 25, 9);
    expect(rail.points[24][0]).toBeCloseTo(50 - 0.5 * 25, 9);
    expect(rail.points[48][0]).toBeCloseTo(rail.points[0][0], 9);
    rail.points.forEach(([x], index) => {
      expect(x).toBeCloseTo(50 + 0.5 * 25 * Math.cos((2 * Math.PI * index) / 48), 9);
    });

    const wide = buildSpringShmGoldPlaybook({ A: 1.2, k: 4, m: 1 });
    const wideScene = wide.steps[0].snapshot;
    if (wideScene.kind === "physics_force_scene") {
      expect(wideScene.springs![0].x1).toBeCloseTo(50 + 1.2 * 25 - 4, 9);
      const range = wideScene.trajectories!.find((item) => item.semantic_role === "amplitude_range")!;
      const xs = range.points.map(([x]) => x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 * 1.2 * 25, 9);
    }
  });

  it("tells the isochronism story with numbers that follow the parameters", () => {
    const base = buildSpringShmGoldPlaybook({ A: 0.5, k: 4, m: 1 });
    expect(base.steps[3].voiceover_text).toContain("ω=√(4/1)=2 rad/s");
    expect(base.steps[4].voiceover_text).toContain("3.14");
    expect(base.steps[5].voiceover_text).toContain("0.5 J");
    expect(base.steps[5].voiceover_text).toContain("1 m/s");

    const isochronism = base.steps[4].snapshot;
    expect(isochronism.kind).toBe("math_plot");
    if (isochronism.kind === "math_plot") {
      // A equals the reference amplitude, so only primary + two bounds remain.
      expect(isochronism.curves).toHaveLength(3);
    }

    const bigger = buildSpringShmGoldPlaybook({ A: 1, k: 4, m: 1 });
    // Same period: the isochronism step keeps the same T while A doubles.
    expect(bigger.steps[4].voiceover_text).toContain("3.14");
    const biggerScene = bigger.steps[4].snapshot;
    if (biggerScene.kind === "math_plot") {
      expect(biggerScene.curves).toHaveLength(4);
      expect(biggerScene.curves[0].expression).toBe("1*cos(2*x)");
      expect(biggerScene.curves[1].semantic_role).toBe("displacement_reference");
    }

    const heavy = buildSpringShmGoldPlaybook({ A: 0.5, k: 4, m: 4 });
    expect(heavy.steps[4].voiceover_text).toContain("6.28");
  });

  it("locks the phase orbit to the energy ellipse with semi-axes A and Aω", () => {
    const script = buildSpringShmGoldPlaybook({ A: 0.5, k: 4, m: 1 });
    const phase = script.steps[6].snapshot;
    expect(phase.kind).toBe("phase_portrait_scene");
    if (phase.kind !== "phase_portrait_scene") return;

    expect(phase.equilibria).toEqual([{ x: 0, y: 0, label: "平衡点", stable: true }]);
    const orbit = phase.trajectories[0].points;
    expect(orbit).toHaveLength(97);
    expect(orbit[0][0]).toBeCloseTo(0.5, 12);
    expect(Math.abs(orbit[0][1])).toBeLessThan(1e-12);
    for (const [x, v] of orbit) {
      expect((x / 0.5) ** 2 + (v / 1) ** 2).toBeCloseTo(1, 8);
    }
  });

  it("keeps the energy budget exact and the damped contrast only in the boundary step", () => {
    const script = buildSpringShmGoldPlaybook({ A: 0.5, k: 4, m: 1 });
    const energy = script.steps[5].snapshot;
    if (energy.kind === "math_plot") {
      expect(energy.curves.map((curve) => curve.semantic_role)).toEqual([
        "potential_energy",
        "kinetic_energy",
        "total_energy",
      ]);
      expect(energy.curves[0].expression).toBe("0.25*(1+cos(4*x))");
      expect(energy.curves[2].expression).toBe("0.5");
    }
    const boundary = script.steps[8].snapshot;
    if (boundary.kind === "math_plot") {
      expect(boundary.curves.some((curve) => curve.semantic_role === "damped_reference")).toBe(true);
    }
    const payload = JSON.stringify(script.steps.slice(0, 8));
    expect(payload).not.toContain("damped_reference");
  });

  it("clamps illegal parameters into the published ranges", () => {
    const script = buildSpringShmGoldPlaybook({ A: 99, k: -5, m: 0 });
    expect(script.parameter_controls.map((control) => control.value)).toEqual(["1.2", "1", "0.25"]);
    expect(JSON.stringify(script)).not.toContain("NaN");
  });
});
