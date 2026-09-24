import { describe, expect, it } from "vitest";

import { scientificMarkup, scientificSpoken } from "./chemFormat";
import {
  activatedFraction,
  catalystRateGain,
  HI_EA_PLATINUM_KJ,
  HI_EA_UNCATALYSED_KJ,
  temperatureRateRatio,
} from "./collisionDomain";

describe("collision theory numbers for 2HI → H₂ + I₂", () => {
  it("puts about two in 10¹⁴ collisions over the uncatalysed barrier at 700 K", () => {
    // e^(−184000 / (8.314 × 700)) = e^(−31.62)
    expect(activatedFraction(HI_EA_UNCATALYSED_KJ, 700)).toBeCloseTo(1.85e-14, 15);
    expect(scientificMarkup(activatedFraction(HI_EA_UNCATALYSED_KJ, 700))).toBe("1.9×10^{-14}");
  });

  it("speeds the reaction about 50-fold from 700 K to 800 K", () => {
    expect(temperatureRateRatio(HI_EA_UNCATALYSED_KJ, 700, 800)).toBeCloseTo(52.0, 0);
  });

  it("makes a platinum surface about two billion times faster at 700 K", () => {
    const gain = catalystRateGain(HI_EA_UNCATALYSED_KJ, HI_EA_PLATINUM_KJ, 700);
    expect(gain).toBeGreaterThan(2.0e9);
    expect(gain).toBeLessThan(2.3e9);
  });

  it("reads powers of ten aloud in words", () => {
    expect(scientificSpoken(1.85e-14)).toBe("1.9 乘以 10 的负 14 次方");
    expect(scientificSpoken(2.14e9)).toBe("2.1 乘以 10 的 9 次方");
  });
});
