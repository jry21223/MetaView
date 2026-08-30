import { describe, expect, it } from "vitest";

import { fmtNum } from "./plotMath";

describe("fmtNum", () => {
  it("formats ordinary values compactly", () => {
    expect(fmtNum(0)).toBe("0");
    expect(fmtNum(1.4430750636)).toBe("1.443");
    expect(fmtNum(-40.82)).toBe("-40.82");
    expect(fmtNum(663)).toBe("663");
  });

  it("keeps exponential form for values that are genuinely extreme", () => {
    expect(fmtNum(1.5e-7)).toBe("1.5e-7");
    expect(fmtNum(2.5e6)).toBe("2.5e+6");
  });

  it("reads float residue at a curve's own zero as zero, not as a tiny number", () => {
    // Shipped defect: vᵧ(t)=v₀sinθ−gt evaluated at the apex came back as
    // -3.09e-11, and the projectile lesson displayed the marker as
    // "(1.443, -3.1e-11)" for twenty seconds of a teaching video.
    const residue = 14.1421356237 - 9.8 * 1.4430750636460152;
    expect(residue).not.toBe(0);
    expect(fmtNum(residue)).toBe("-3.1e-11");     // no scale: unchanged
    expect(fmtNum(residue, 33.94)).toBe("0");     // against its own y span
  });

  it("does not flatten a small value that the axis can actually resolve", () => {
    // 0.002 on a 1.3-tall axis is a real reading, not noise.
    expect(fmtNum(0.002, 1.3)).toBe("0.002");
    expect(fmtNum(1e-5, 1.3)).toBe("1.0e-5");
  });

  it("ignores a scale that is missing or degenerate", () => {
    expect(fmtNum(1e-11, Number.NaN)).toBe("1.0e-11");
    expect(fmtNum(1e-11, 0)).toBe("1.0e-11");
    expect(fmtNum(1e-11)).toBe("1.0e-11");
  });
});
