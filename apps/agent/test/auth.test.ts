import { describe, expect, it } from "vitest";

import { hasValidSharedToken } from "../src/auth.js";

describe("agent shared-token auth", () => {
  it("allows generate calls when no token is configured", () => {
    expect(hasValidSharedToken(undefined, undefined)).toBe(true);
  });

  it("accepts the configured shared token", () => {
    expect(hasValidSharedToken("secret", "secret")).toBe(true);
  });

  it("rejects missing or wrong shared tokens", () => {
    expect(hasValidSharedToken("secret", undefined)).toBe(false);
    expect(hasValidSharedToken("secret", "wrong")).toBe(false);
  });

  it("rejects length-mismatched tokens without throwing", () => {
    expect(hasValidSharedToken("secret", "sec")).toBe(false);
    expect(hasValidSharedToken("sec", "secret")).toBe(false);
  });
});
