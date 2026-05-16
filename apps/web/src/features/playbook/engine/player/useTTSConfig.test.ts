import { describe, expect, it } from "vitest";
import { __testing } from "./useTTS";

const { sanitizeStoredConfig } = __testing;

describe("useTTS — stored config migration (issue #40)", () => {
  it("strips legacy apiKey / baseUrl / model fields from persisted state", () => {
    const legacy = {
      enabled: true,
      backend: "openai",
      voice: "echo",
      rate: 1.25,
      apiKey: "sk-leaked-key",
      baseUrl: "https://api.openai.com/v1",
      model: "tts-1",
    };
    const sanitized = sanitizeStoredConfig(legacy);
    expect(sanitized).toEqual({
      enabled: true,
      backend: "openai",
      voice: "echo",
      rate: 1.25,
    });
    // The migration path MUST drop the legacy secret; otherwise issue #40 isn't fixed.
    expect("apiKey" in sanitized).toBe(false);
    expect("baseUrl" in sanitized).toBe(false);
    expect("model" in sanitized).toBe(false);
  });

  it("rejects unknown backends and non-finite rates", () => {
    expect(
      sanitizeStoredConfig({ backend: "azure", rate: Number.NaN }),
    ).toEqual({});
  });

  it("returns an empty object for malformed payloads", () => {
    expect(sanitizeStoredConfig(null)).toEqual({});
    expect(sanitizeStoredConfig("string")).toEqual({});
    expect(sanitizeStoredConfig([1, 2, 3])).toEqual({});
  });
});
