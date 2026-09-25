import { describe, expect, it } from "vitest";

import type { ChemParticlesPanel } from "./sceneTypes";
import { morphParticles, smoothstep, thermalOffset } from "./transitions";

const RECT = { x: 0, y: 0, w: 100, h: 100 };

function flask(particles: ChemParticlesPanel["particles"]): ChemParticlesPanel {
  return { type: "particles", id: "flask", rect: RECT, particles };
}

describe("chemistry transitions", () => {
  it("eases in and out and stays inside [0, 1]", () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(2)).toBe(1);
  });

  it("merges H⁺ and OH⁻ into water at the point where they meet", () => {
    const before = flask([
      { id: "h", species: "H+", x: 0.2, y: 0.5 },
      { id: "oh", species: "OH-", x: 0.6, y: 0.5 },
    ]);
    const after = flask([{ id: "w", species: "H2O", x: 0.8, y: 0.8, from: ["h", "oh"] }]);

    const halfway = morphParticles(before, after, 0.5);
    const water = halfway.find((item) => item.id === "w")!;
    const proton = halfway.find((item) => item.id === "h")!;
    // Sources have converged on their centroid (0.4, 0.5) and are fading out.
    expect(proton.x).toBeCloseTo(0.4, 9);
    expect(proton.opacity).toBeLessThan(1);
    // The product starts where they met and is only beginning to appear.
    expect(water.x).toBeCloseTo(0.4 + (0.8 - 0.4) * (0.05 / 0.55), 6);

    const done = morphParticles(before, after, 1);
    expect(done.map((item) => item.id)).toEqual(["w"]);
    expect(done[0]).toMatchObject({ x: 0.8, y: 0.8, opacity: 1 });
  });

  it("slides particles without a source in from the declared entry side", () => {
    const before = flask([]);
    const after: ChemParticlesPanel = { ...flask([{ id: "n2", species: "N2", x: 0.5, y: 0.5 }]), entry: "top" };
    const start = morphParticles(before, after, 0)[0];
    expect(start.y).toBeLessThan(0);
    expect(start.opacity).toBe(1);
  });

  it("jiggles deterministically, the same frame always giving the same offset", () => {
    expect(thermalOffset("h2-3", 42, 5)).toEqual(thermalOffset("h2-3", 42, 5));
    expect(thermalOffset("h2-3", 42, 5)).not.toEqual(thermalOffset("h2-4", 42, 5));
    expect(thermalOffset("h2-3", 42, 0)).toEqual({ dx: 0, dy: 0, turn: 0 });
  });
});
