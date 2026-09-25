import { describe, expect, it } from "vitest";

import { equationImbalance, parseChemEquation, parseSpecies } from "./equationBalance";

describe("chemical equation balance", () => {
  it("counts atoms through subscripts, brackets, isotopes and charges", () => {
    expect(parseSpecies("Ca(OH)_2")).toEqual({ counts: { Ca: 1, O: 2, H: 2 }, charge: 0 });
    expect(parseSpecies("SO_4^{2-}")).toEqual({ counts: { S: 1, O: 4 }, charge: -2 });
    expect(parseSpecies("CH_3CH_2^{18}OH")).toEqual({ counts: { C: 2, H: 6, "18O": 1 }, charge: 0 });
    expect(parseSpecies("H^+")).toEqual({ counts: { H: 1 }, charge: 1 });
    expect(parseSpecies("e^-")).toEqual({ counts: {}, charge: -1 });
    expect(parseSpecies("Cl")).toEqual({ counts: { Cl: 1 }, charge: 0 });
  });

  it("accepts balanced molecular, ionic and half equations", () => {
    for (const text of [
      "2H_2 + O_2 = 2H_2O",
      "Ca(OH)_2 + 2HCl = CaCl_2 + 2H_2O",
      "Fe^{3+} + e^- = Fe^{2+}",
      "Zn − 2e^- = Zn^{2+}",
      "2HI(g) ⇌ H_2(g) + I_2(g)",
      "N_2 + 3H_2 ⇌ 2NH_3　ΔH = −92.4 kJ/mol",
      "CH_3COOH + CH_3^{18}OH ⇌ CH_3CO^{18}OCH_3 + H_2O",
    ]) {
      const equation = parseChemEquation(text);
      expect(equation, text).not.toBeNull();
      expect(equationImbalance(equation!), text).toEqual({ atoms: {}, charge: 0 });
    }
  });

  it("reports the element or charge that does not balance", () => {
    expect(equationImbalance(parseChemEquation("H_2 + O_2 = H_2O")!)).toEqual({ atoms: { O: 1 }, charge: 0 });
    expect(equationImbalance(parseChemEquation("Fe^{3+} = Fe^{2+}")!)).toEqual({ atoms: {}, charge: 1 });
    // A tracer that swaps sides is an imbalance, not a rounding detail.
    expect(equationImbalance(parseChemEquation("CH_3^{18}OH = CH_3OH")!)).toEqual({ atoms: { "18O": 1, O: -1 }, charge: 0 });
  });

  it("does not mistake arithmetic, prose or structural fragments for equations", () => {
    for (const text of [
      "E = 0.34 − (−0.76) = 1.10 V",
      "c(HCl) = 0.1000 × 20.00 ÷ 20.00",
      "C=O + H^+ → C=O^+–H",
      "指针不偏转：I = 0",
      "n(e^-) = 0.2 mol",
      "E_a = 184 kJ/mol",
      "化学能 → 电能",
    ]) {
      expect(parseChemEquation(text), text).toBeNull();
    }
  });
});
