import { describe, expect, it } from "vitest";
import { __testing } from "./useTTS";

const { sanitizeStoredConfig } = __testing;

describe("useTTS — stored config migration (issue #40)", () => {
  it("preserves self-edition TTS provider fields from persisted state", () => {
    const stored = {
      enabled: true,
      backend: "openai",
      voice: "echo",
      rate: 1.25,
      apiKey: "sk-local-key",
      baseUrl: "https://api.openai.com/v1",
      model: "tts-1",
    };
    const sanitized = sanitizeStoredConfig(stored);
    expect(sanitized).toEqual({
      enabled: true,
      backend: "openai",
      voice: "echo",
      rate: 1.25,
      apiKey: "sk-local-key",
      baseUrl: "https://api.openai.com/v1",
      model: "tts-1",
    });
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
