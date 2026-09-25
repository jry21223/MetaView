import { describe, expect, it } from "vitest";

import {
  equilibriumConstant,
  HABER_K_FORWARD,
  HABER_K_REF,
  integrateSegment,
  reactionQuotient,
  scaleState,
  solveEquilibrium,
} from "./haberDomain";

describe("N₂ + 3H₂ ⇌ 2NH₃ equilibrium model", () => {
  it("relaxes 1.0/3.0/0 mol/L to the round teaching equilibrium 0.6/1.8/0.8", () => {
    const eq = solveEquilibrium({ n2: 1, h2: 3, nh3: 0 }, HABER_K_REF);
    expect(eq.n2).toBeCloseTo(0.6, 9);
    expect(eq.h2).toBeCloseTo(1.8, 9);
    expect(eq.nh3).toBeCloseTo(0.8, 9);
  });

  it("integrates the rate law onto the same equilibrium the solver finds", () => {
    const path = integrateSegment({ t0: 0, t1: 30, start: { n2: 1, h2: 3, nh3: 0 }, k: HABER_K_REF, kf: HABER_K_FORWARD });
    const end = path.at(-1)![1];
    expect(end.nh3).toBeCloseTo(0.8, 3);
    expect(reactionQuotient(end) / HABER_K_REF).toBeCloseTo(1, 2);
    // Atoms are conserved along the whole path: 2·N₂ + NH₃ and 2·H₂ + 3·NH₃.
    for (const [, state] of path) {
      expect(2 * state.n2 + state.nh3).toBeCloseTo(2, 9);
      expect(2 * state.h2 + 3 * state.nh3).toBeCloseTo(6, 9);
    }
  });

  it("shifts forward after adding N₂, but only partly uses it up", () => {
    const eq0 = solveEquilibrium({ n2: 1, h2: 3, nh3: 0 }, HABER_K_REF);
    const disturbed = { ...eq0, n2: eq0.n2 + 0.6 };
    expect(reactionQuotient(disturbed)).toBeLessThan(HABER_K_REF);
    const eq1 = solveEquilibrium(disturbed, HABER_K_REF);
    expect(eq1.nh3).toBeGreaterThan(eq0.nh3);
    expect(eq1.n2).toBeGreaterThan(eq0.n2);
    expect(eq1.n2).toBeLessThan(disturbed.n2);
  });

  it("shifts toward fewer gas molecules when the volume is halved", () => {
    const eq0 = solveEquilibrium({ n2: 1, h2: 3, nh3: 0 }, HABER_K_REF);
    const squeezed = scaleState(eq0, 2);
    expect(reactionQuotient(squeezed)).toBeCloseTo(HABER_K_REF / 4, 9);
    const eq = solveEquilibrium(squeezed, HABER_K_REF);
    expect(eq.nh3).toBeGreaterThan(squeezed.nh3);
  });

  it("lowers K on heating because the forward reaction is exothermic", () => {
    expect(equilibriumConstant(700)).toBeCloseTo(HABER_K_REF, 9);
    // van 't Hoff with ΔH = −92.4 kJ/mol: K(800)/K(700) = e^(−1.985) ≈ 0.137.
    expect(equilibriumConstant(800) / equilibriumConstant(700)).toBeCloseTo(0.137, 3);
    const eq0 = solveEquilibrium({ n2: 1, h2: 3, nh3: 0 }, HABER_K_REF);
    const hot = solveEquilibrium(eq0, equilibriumConstant(800));
    expect(hot.nh3).toBeLessThan(eq0.nh3);
  });
});
