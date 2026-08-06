import { describe, expect, it } from "vitest";

import { clamp, clampPanOffset, followupDesiredCenter } from "./cameraMath";

describe("cameraMath", () => {
  describe("clamp", () => {
    it("passes values within bounds", () => {
      expect(clamp(5, -10, 10)).toBe(5);
    });

    it("clamps below the minimum", () => {
      expect(clamp(-15, -10, 10)).toBe(-10);
    });

    it("clamps above the maximum", () => {
      expect(clamp(15, -10, 10)).toBe(10);
    });
  });

  describe("followupDesiredCenter", () => {
    it("centers the prompt shot at 60% width", () => {
      expect(followupDesiredCenter(800, 450, "prompt")).toEqual({ x: 480, y: 234 });
    });

    it("centers the response shot at 50% width", () => {
      expect(followupDesiredCenter(800, 450, "response")).toEqual({ x: 400, y: 234 });
    });
  });

  describe("clampPanOffset", () => {
    it("pans by the desired offset within maxPan", () => {
      expect(clampPanOffset(480, 200, 24)).toBe(24);
      expect(clampPanOffset(480, 470, 24)).toBe(10);
    });

    it("clamps at the max pan in both directions", () => {
      expect(clampPanOffset(100, 500, 24)).toBe(-24);
      expect(clampPanOffset(500, 100, 24)).toBe(24);
    });
  });
});
