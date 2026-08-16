import { describe, expect, it } from "vitest";

import { resolveGenerateTimeoutMs } from "../src/server.js";

describe("resolveGenerateTimeoutMs", () => {
  const ceiling = 540_000;

  it("falls back to the ceiling when the request carries no timeout", () => {
    expect(resolveGenerateTimeoutMs(undefined, ceiling)).toBe(ceiling);
    expect(resolveGenerateTimeoutMs(null, ceiling)).toBe(ceiling);
  });

  it("rejects zero, negative, and non-numeric values", () => {
    expect(resolveGenerateTimeoutMs(0, ceiling)).toBe(ceiling);
    expect(resolveGenerateTimeoutMs(-1, ceiling)).toBe(ceiling);
    expect(resolveGenerateTimeoutMs("abc", ceiling)).toBe(ceiling);
    expect(resolveGenerateTimeoutMs(Infinity, ceiling)).toBe(ceiling);
    expect(resolveGenerateTimeoutMs(NaN, ceiling)).toBe(ceiling);
  });

  it("uses an API-provided timeout below the ceiling", () => {
    expect(resolveGenerateTimeoutMs(300_000, ceiling)).toBe(300_000);
    expect(resolveGenerateTimeoutMs("300000", ceiling)).toBe(300_000);
  });

  it("clamps an API-provided timeout to the ceiling (issue #238)", () => {
    expect(resolveGenerateTimeoutMs(900_000, ceiling)).toBe(ceiling);
    expect(resolveGenerateTimeoutMs(600_000, ceiling)).toBe(ceiling);
  });
});
