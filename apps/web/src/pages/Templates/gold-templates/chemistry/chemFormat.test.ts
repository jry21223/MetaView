import { describe, expect, it } from "vitest";

import { dec, percentSpoken, percentText, ratioSpoken, scientificMarkup, scientificSpoken, signed } from "./chemFormat";

describe("chemistry number formatting", () => {
  it("never prints a negative zero reading", () => {
    // pH of 1.000 mol/L HCl is −lg 1 = −0 in floating point.
    expect(dec(-Math.log10(1))).toBe("0.00");
    expect(dec(-0.0001)).toBe("0.00");
    expect(dec(-0.76)).toBe("-0.76");
    expect(signed(-0.76)).toBe("−0.76");
  });

  it("carries a rounded mantissa into the exponent", () => {
    expect(scientificMarkup(9.96e-5)).toBe("1.0×10^{-4}");
    expect(scientificSpoken(1.85e-14)).toBe("1.9 乘以 10 的负 14 次方");
  });

  it("speaks large ratios with two significant figures in Chinese units", () => {
    expect(ratioSpoken(2502)).toBe("2500");
    expect(ratioSpoken(251189)).toBe("25 万");
    expect(ratioSpoken(2.51e7)).toBe("2500 万");
    expect(ratioSpoken(2.1e9)).toBe("21 亿");
    expect(ratioSpoken(52.3)).toBe("52");
  });

  it("writes tiny relative errors as a bound, not as zero", () => {
    expect(percentText(0)).toBe("< 0.001%");
    expect(percentText(-0.00079)).toBe("−0.079%");
    expect(percentSpoken(-0.0079)).toBe("偏小约百分之 0.79");
  });
});
