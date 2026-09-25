import { describe, expect, it } from "vitest";

import {
  endpointError,
  equivalenceVolumeMl,
  indicatorColorName,
  jumpRange,
  titrationPh,
  volumeAtPh,
} from "./titrationDomain";

const TEXTBOOK = { acidConc: 0.1, acidVolumeMl: 20, baseConc: 0.1 };

describe("strong acid – strong base titration", () => {
  it("reproduces the textbook pH values of 0.1000 mol/L HCl titrated with NaOH", () => {
    expect(titrationPh(TEXTBOOK, 0)).toBeCloseTo(1.0, 2);
    expect(titrationPh(TEXTBOOK, 10)).toBeCloseTo(1.48, 2);
    expect(titrationPh(TEXTBOOK, 18)).toBeCloseTo(2.28, 2);
    expect(titrationPh(TEXTBOOK, 19.98)).toBeCloseTo(4.3, 2);
    expect(titrationPh(TEXTBOOK, 20)).toBeCloseTo(7.0, 6);
    expect(titrationPh(TEXTBOOK, 20.02)).toBeCloseTo(9.7, 2);
    expect(titrationPh(TEXTBOOK, 22)).toBeCloseTo(11.68, 2);
    expect(titrationPh(TEXTBOOK, 40)).toBeCloseTo(12.52, 2);
  });

  it("puts the jump between 19.98 and 20.02 mL — about one drop", () => {
    const jump = jumpRange(TEXTBOOK);
    expect(equivalenceVolumeMl(TEXTBOOK)).toBe(20);
    expect(jump.vLow).toBeCloseTo(19.98, 6);
    expect(jump.vHigh).toBeCloseTo(20.02, 6);
    expect(jump.phHigh - jump.phLow).toBeCloseTo(5.4, 1);
  });

  it("narrows the jump by one pH unit per side for every tenfold dilution", () => {
    const dilute = jumpRange({ acidConc: 0.01, acidVolumeMl: 20, baseConc: 0.01 });
    const strong = jumpRange({ acidConc: 1, acidVolumeMl: 20, baseConc: 1 });
    expect(dilute.phLow).toBeCloseTo(5.3, 1);
    expect(dilute.phHigh).toBeCloseTo(8.7, 1);
    expect(strong.phLow).toBeCloseTo(3.3, 1);
    expect(strong.phHigh).toBeCloseTo(10.7, 1);
  });

  it("finds the volume where the flask reaches a given pH", () => {
    expect(volumeAtPh(TEXTBOOK, 7)).toBeCloseTo(20, 4);
    expect(volumeAtPh(TEXTBOOK, 4.3)).toBeCloseTo(19.98, 2);
  });

  it("keeps both indicators inside 0.1 % at 0.1 mol/L but not methyl orange at 0.01 mol/L", () => {
    expect(Math.abs(endpointError(TEXTBOOK, "phenolphthalein").relativeError)).toBeLessThan(0.001);
    expect(Math.abs(endpointError(TEXTBOOK, "methyl_orange").relativeError)).toBeLessThan(0.001);
    const dilute = { acidConc: 0.01, acidVolumeMl: 20, baseConc: 0.01 };
    expect(endpointError(dilute, "methyl_orange").relativeError).toBeLessThan(-0.005);
    expect(Math.abs(endpointError(dilute, "phenolphthalein").relativeError)).toBeLessThan(0.001);
  });

  it("names the indicator colour the way the lab sheet does", () => {
    expect(indicatorColorName("phenolphthalein", 7)).toBe("无色");
    expect(indicatorColorName("phenolphthalein", 9.7)).toBe("浅红色");
    expect(indicatorColorName("phenolphthalein", 11)).toBe("红色");
    expect(indicatorColorName("methyl_orange", 2)).toBe("红色");
    expect(indicatorColorName("methyl_orange", 3.8)).toBe("橙色");
    expect(indicatorColorName("methyl_orange", 7)).toBe("黄色");
  });
});
