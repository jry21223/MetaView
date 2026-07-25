import { describe, expect, it } from "vitest";

import { evaluateExpression } from "../src/state/safeMath.js";

describe("safeMath expression bounds", () => {
  it("evaluates simple arithmetic", () => {
    expect(evaluateExpression("1 + 2 * 3")).toBe(7);
    expect(evaluateExpression("sin(0)")).toBe(0);
  });

  it("rejects expressions beyond the length safety limit", () => {
    const expression = `1${"+1".repeat(200)}`;
    expect(() => evaluateExpression(expression)).toThrow(/256-character safety limit/);
  });

  it("rejects deeply nested parentheses", () => {
    const expression = `${"(".repeat(40)}1${")".repeat(40)}`;
    expect(() => evaluateExpression(expression)).toThrow(/parse depth limit/);
  });
});
