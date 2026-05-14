import { describe, expect, it } from "vitest";
import {
  clamp,
  clamp01,
  clipReveal,
  easeInOut,
  easeOut,
  fadeRamp,
  lerp,
  springProgress,
} from "./animation";

describe("animation helpers", () => {
  describe("clamp01", () => {
    it("clamps values into [0, 1]", () => {
      expect(clamp01(-0.5)).toBe(0);
      expect(clamp01(0)).toBe(0);
      expect(clamp01(0.42)).toBe(0.42);
      expect(clamp01(1)).toBe(1);
      expect(clamp01(2)).toBe(1);
    });

    it("treats NaN as 0", () => {
      expect(clamp01(NaN)).toBe(0);
    });
  });

  describe("clamp", () => {
    it("clamps to arbitrary window", () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-2, 0, 10)).toBe(0);
      expect(clamp(20, 0, 10)).toBe(10);
    });
  });

  describe("easeInOut & easeOut", () => {
    it("returns 0 at t=0 and 1 at t=1", () => {
      expect(easeInOut(0)).toBe(0);
      expect(easeInOut(1)).toBe(1);
      expect(easeOut(0)).toBe(0);
      expect(easeOut(1)).toBe(1);
    });

    it("is monotonic on [0,1]", () => {
      let prev = -Infinity;
      for (let t = 0; t <= 1; t += 0.05) {
        const v = easeInOut(t);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    });
  });

  describe("fadeRamp", () => {
    it("is 0 before start and 1 after start+duration", () => {
      expect(fadeRamp(0, 10, 5)).toBe(0);
      expect(fadeRamp(10, 10, 5)).toBe(0);
      expect(fadeRamp(12.5, 10, 5)).toBeCloseTo(0.5, 5);
      expect(fadeRamp(15, 10, 5)).toBe(1);
      expect(fadeRamp(20, 10, 5)).toBe(1);
    });

    it("treats zero duration as a step function", () => {
      expect(fadeRamp(9, 10, 0)).toBe(0);
      expect(fadeRamp(10, 10, 0)).toBe(1);
    });
  });

  describe("springProgress", () => {
    it("starts near 0 and saturates near 1", () => {
      const early = springProgress(0, 30);
      const late = springProgress(120, 30);
      expect(early).toBeLessThan(0.2);
      expect(late).toBeGreaterThan(0.9);
    });
  });

  describe("clipReveal", () => {
    it("never returns less than 1 when total > 0", () => {
      expect(clipReveal(50, 0)).toBe(1);
      expect(clipReveal(0, 0.5)).toBe(0);
      expect(clipReveal(50, 1)).toBe(50);
      expect(clipReveal(50, 0.5)).toBe(25);
    });
  });

  describe("lerp", () => {
    it("interpolates within [0,1]", () => {
      expect(lerp(10, 20, 0)).toBe(10);
      expect(lerp(10, 20, 0.5)).toBe(15);
      expect(lerp(10, 20, 1)).toBe(20);
    });

    it("clamps t to [0,1]", () => {
      expect(lerp(10, 20, -1)).toBe(10);
      expect(lerp(10, 20, 2)).toBe(20);
    });
  });
});
