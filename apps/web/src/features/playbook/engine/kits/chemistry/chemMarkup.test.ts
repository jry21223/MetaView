import { describe, expect, it } from "vitest";

import { chemPlainText, estimateChemTextWidth, parseChemMarkup } from "./chemMarkup";

describe("chemistry formula markup", () => {
  it("splits subscripts and charges into separate runs", () => {
    expect(parseChemMarkup("SO_4^{2-}")).toEqual([
      { text: "SO", shift: null },
      { text: "4", shift: "sub" },
      { text: "2−", shift: "sup" },
    ]);
  });

  it("takes a digit run and its sign as one superscript without braces", () => {
    expect(parseChemMarkup("Zn^2+ + 2e^-")).toEqual([
      { text: "Zn", shift: null },
      { text: "2+", shift: "sup" },
      { text: " + 2e", shift: null },
      { text: "−", shift: "sup" },
    ]);
  });

  it("reads a leading mass number as a superscript before the element", () => {
    expect(parseChemMarkup("CH_3CO^{18}OC_2H_5")).toEqual([
      { text: "CH", shift: null },
      { text: "3", shift: "sub" },
      { text: "CO", shift: null },
      { text: "18", shift: "sup" },
      { text: "OC", shift: null },
      { text: "2", shift: "sub" },
      { text: "H", shift: null },
      { text: "5", shift: "sub" },
    ]);
  });

  it("draws Unicode input exactly like the markup it stands for", () => {
    expect(parseChemMarkup("Cu²⁺ + H₂O")).toEqual(parseChemMarkup("Cu^{2+} + H_2O"));
    expect(chemPlainText("¹⁸O")).toBe("18O");
  });

  it("estimates wider boxes for CJK text than for the same count of Latin letters", () => {
    expect(estimateChemTextWidth("负极", 20)).toBeGreaterThan(estimateChemTextWidth("Zn", 20));
    expect(estimateChemTextWidth("H_2O", 20)).toBeLessThan(estimateChemTextWidth("H2O", 20));
  });
});
