import { describe, expect, it } from "vitest";

import {
  PROJECTILE_DEFAULTS,
  normalizeProjectileInput,
  projectileAtTime,
  projectileSceneTrajectory,
  PROJECTILE_SCENE_WIDTH,
  sampleProjectile,
  solveProjectile,
} from "./projectileMotionDomain";

describe("projectile motion deterministic domain", () => {
  it("solves a 20 m/s, 45 degree same-height launch", () => {
    const state = solveProjectile({ speed: 20, angle: 45, gravity: 9.8 });

    expect(state.vx).toBeCloseTo(Math.sqrt(200), 10);
    expect(state.vy0).toBeCloseTo(Math.sqrt(200), 10);
    expect(state.apexTime).toBeCloseTo(1.443075, 5);
    expect(state.flightTime).toBeCloseTo(2.88615, 5);
    expect(state.maxHeight).toBeCloseTo(10.20408, 5);
    expect(state.range).toBeCloseTo(40.81633, 5);
    expect(state.boundaryCase).toBe("regular");

    const apex = projectileAtTime(state, state.apexTime);
    expect(apex.vy).toBe(0);
    expect(apex.y).toBeCloseTo(state.maxHeight, 10);
  });

  it("samples the launch and landing from the same equations", () => {
    const state = solveProjectile({ speed: 24, angle: 35, gravity: 9.8 });
    const samples = sampleProjectile(state, 51);

    expect(samples).toHaveLength(51);
    expect(samples[0]).toMatchObject({ time: 0, x: 0, y: 0 });
    expect(samples.at(-1)?.time).toBeCloseTo(state.flightTime, 12);
    expect(samples.at(-1)?.x).toBeCloseTo(state.range, 12);
    expect(samples.at(-1)?.y).toBe(0);
    expect(samples[25].y).toBeCloseTo(state.maxHeight, 10);
  });

  it("maps real metres with one common scene scale on both axes", () => {
    const state = solveProjectile({ speed: 20, angle: 45, gravity: 9.8 });
    const scene = projectileSceneTrajectory(state, 49);
    const launch = scene[0];
    const apex = scene[24];
    const landing = scene[48];
    const horizontalPixelsPerMetre = (landing[0] - launch[0]) / state.range;
    const verticalPixelsPerMetre = (launch[1] - apex[1]) / state.maxHeight;

    expect(launch[1]).toBeCloseTo(landing[1], 8);
    expect(horizontalPixelsPerMetre).toBeCloseTo(verticalPixelsPerMetre, 4);
  });

  it("normalizes non-finite and out-of-range inputs deterministically", () => {
    expect(normalizeProjectileInput({ speed: Number.NaN, angle: "bad", gravity: Infinity }))
      .toEqual(PROJECTILE_DEFAULTS);
    expect(normalizeProjectileInput({ speed: -5, angle: 180, gravity: 0 }))
      .toEqual({ speed: 0, angle: 90, gravity: 1.6 });
  });

  it("handles stationary, ground-tangent, and vertical-launch boundaries", () => {
    const stationary = solveProjectile({ speed: 0, angle: 45, gravity: 9.8 });
    const tangent = solveProjectile({ speed: 20, angle: 0, gravity: 9.8 });
    const vertical = solveProjectile({ speed: 20, angle: 90, gravity: 9.8 });

    expect(stationary).toMatchObject({
      boundaryCase: "stationary",
      flightTime: 0,
      range: 0,
      maxHeight: 0,
    });
    expect(tangent).toMatchObject({
      boundaryCase: "ground-tangent",
      flightTime: 0,
      range: 0,
      maxHeight: 0,
    });
    expect(vertical.boundaryCase).toBe("vertical-launch");
    expect(vertical.vx).toBe(0);
    expect(vertical.range).toBe(0);
    expect(vertical.flightTime).toBeGreaterThan(0);
    // A vertical launch has zero range, so every sample sits on the centre
    // line of the wide (16:9) scene space.
    expect(new Set(projectileSceneTrajectory(vertical).map(([x]) => x))).toEqual(
      new Set([PROJECTILE_SCENE_WIDTH / 2]),
    );
  });
});
