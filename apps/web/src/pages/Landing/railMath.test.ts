import { describe, expect, it } from "vitest";

import {
  railActivatedIndex,
  railOffsetPercent,
  railPanelIndex,
  railProgressFromScroll,
  railTargetPosition,
} from "./railMath";

describe("railMath", () => {
  describe("railOffsetPercent", () => {
    it("maps panel position to track offset percent", () => {
      expect(railOffsetPercent(0, 4)).toBe(-0);
      expect(railOffsetPercent(1, 4)).toBe(-25);
      expect(railOffsetPercent(2.5, 4)).toBe(-62.5);
    });
  });

  describe("railActivatedIndex", () => {
    it("activates the panel whose midpoint the position has crossed", () => {
      expect(railActivatedIndex(0.49, 4)).toBe(0);
      expect(railActivatedIndex(0.5, 4)).toBe(1);
      expect(railActivatedIndex(1.49, 4)).toBe(1);
      expect(railActivatedIndex(1.5, 4)).toBe(2);
    });

    it("clamps to the first panel", () => {
      expect(railActivatedIndex(-1, 4)).toBe(0);
      expect(railActivatedIndex(0, 4)).toBe(0);
    });

    it("clamps to the last panel", () => {
      expect(railActivatedIndex(3.49, 4)).toBe(3);
      expect(railActivatedIndex(3.5, 4)).toBe(3);
      expect(railActivatedIndex(99, 4)).toBe(3);
    });
  });

  describe("railPanelIndex", () => {
    it("rounds to the nearest panel", () => {
      expect(railPanelIndex(0.4, 4)).toBe(0);
      expect(railPanelIndex(0.5, 4)).toBe(1);
      expect(railPanelIndex(1.4, 4)).toBe(1);
    });

    it("clamps to the last panel", () => {
      expect(railPanelIndex(3, 4)).toBe(3);
      expect(railPanelIndex(4, 4)).toBe(3);
      expect(railPanelIndex(99, 4)).toBe(3);
    });

    it("clamps negative positions to the first panel", () => {
      expect(railPanelIndex(-1, 4)).toBe(0);
    });
  });

  describe("railTargetPosition", () => {
    it("scales progress to the last panel index", () => {
      expect(railTargetPosition(0, 4)).toBe(0);
      expect(railTargetPosition(0.5, 4)).toBe(1.5);
      expect(railTargetPosition(1, 4)).toBe(3);
    });

    it("clamps progress outside [0, 1]", () => {
      expect(railTargetPosition(-0.5, 4)).toBe(0);
      expect(railTargetPosition(2, 4)).toBe(3);
    });
  });

  describe("railProgressFromScroll", () => {
    it("is 0 before the section top", () => {
      expect(railProgressFromScroll(100, 200, 400)).toBe(0);
    });

    it("is 1 at the end of travel", () => {
      expect(railProgressFromScroll(600, 200, 400)).toBe(1);
    });

    it("interpolates within travel", () => {
      expect(railProgressFromScroll(400, 200, 400)).toBe(0.5);
    });

    it("clamps beyond travel", () => {
      expect(railProgressFromScroll(2000, 200, 400)).toBe(1);
    });
  });
});
