import { describe, expect, it } from "vitest";

import { cellEmf, electrodeMassChange } from "./galvanicDomain";

describe("galvanic cell bookkeeping", () => {
  it("gives the textbook cell voltages from standard potentials", () => {
    expect(cellEmf("Zn")).toBe(1.1);
    expect(cellEmf("Fe")).toBe(0.78);
  });

  it("dissolves 6.5 g of zinc and plates 6.4 g of copper for 0.2 mol of electrons", () => {
    const zinc = electrodeMassChange("Zn", 0.2);
    expect(zinc.anodeLossG).toBeCloseTo(6.5, 9);
    expect(zinc.cathodeGainG).toBeCloseTo(6.4, 9);
    expect(zinc.charge).toBeCloseTo(19297, 0);
  });

  it("uses iron's +2 ion: 0.4 mol of electrons dissolve 11.2 g of iron", () => {
    expect(electrodeMassChange("Fe", 0.4).anodeLossG).toBeCloseTo(11.2, 9);
  });
});
