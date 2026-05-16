import { describe, expect, it } from "vitest";
import { AUTO_VOICE, DOMAIN_VOICE_MAP, resolveVoice } from "./useTTS";

describe("resolveVoice (issue #52)", () => {
  it("returns the explicit voice when the user picked a concrete one", () => {
    expect(resolveVoice("nova", "math")).toBe("nova");
    expect(resolveVoice("onyx", undefined)).toBe("onyx");
  });

  it("maps each known domain to its per-subject voice under AUTO", () => {
    expect(resolveVoice(AUTO_VOICE, "math")).toBe(DOMAIN_VOICE_MAP.math);
    expect(resolveVoice(AUTO_VOICE, "algorithm")).toBe(DOMAIN_VOICE_MAP.algorithm);
    expect(resolveVoice(AUTO_VOICE, "chemistry")).toBe(DOMAIN_VOICE_MAP.chemistry);
    expect(resolveVoice(AUTO_VOICE, "code")).toBe(DOMAIN_VOICE_MAP.code);
    expect(resolveVoice(AUTO_VOICE, "physics")).toBe(DOMAIN_VOICE_MAP.physics);
  });

  it("falls back to alloy under AUTO when domain is missing or unknown", () => {
    expect(resolveVoice(AUTO_VOICE, undefined)).toBe("alloy");
    expect(resolveVoice(AUTO_VOICE, "")).toBe("alloy");
    expect(resolveVoice(AUTO_VOICE, "unknown-subject")).toBe("alloy");
  });

  it("verifies the DOMAIN_VOICE_MAP entries are all unique non-empty strings", () => {
    const voices = Object.values(DOMAIN_VOICE_MAP);
    expect(voices.length).toBeGreaterThan(0);
    for (const v of voices) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
    expect(new Set(voices).size).toBe(voices.length); // distinct per subject
  });
});
