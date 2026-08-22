import { describe, expect, it } from "vitest";

import { resolveOptionalEnv } from "../src/env.js";

describe("resolveOptionalEnv", () => {
  it("returns the first non-blank trimmed candidate", () => {
    expect(resolveOptionalEnv("  https://api.example/v1  ", "fallback")).toBe(
      "https://api.example/v1",
    );
  });

  it("treats blank strings as unset", () => {
    expect(resolveOptionalEnv("", "   ", undefined, null, "https://ok")).toBe(
      "https://ok",
    );
  });

  it("returns undefined when every candidate is blank or missing", () => {
    expect(resolveOptionalEnv(undefined, null, "", "  ")).toBeUndefined();
  });
});
