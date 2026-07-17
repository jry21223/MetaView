import { describe, expect, it } from "vitest";
import {
  parseShowcaseCase,
  safeParseShowcaseCase,
  showcaseCaseJsonSchema,
} from "./showcaseSchema";

function curatedCase(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0",
    id: "math-derivative-tangent",
    slug: "derivative-tangent",
    title: "导数的几何意义",
    summary: "从割线走向切线。",
    domain: "math",
    topic: "导数",
    prompt: "解释切线斜率。",
    learningGoal: "理解瞬时变化率。",
    keyConcepts: ["割线", "切线"],
    reviewStatus: "reviewed",
    visibility: "public",
    posterUrl: "/showcases/derivative-tangent/poster.webp",
    playbookUrl: "/showcases/derivative-tangent/playbook.json",
    directorUrl: "/showcases/derivative-tangent/director.json",
    evidence: { kind: "curated-preview", sourceCommit: "clean-commit" },
    demonstratedCapabilities: ["playable"],
    availableActions: ["play", "regenerate"],
    ...overrides,
  };
}

describe("showcase case schema", () => {
  it("derives JSON Schema from the runtime schema", () => {
    expect(showcaseCaseJsonSchema.type).toBe("object");
    expect(showcaseCaseJsonSchema.properties).toHaveProperty("evidence");
    expect(JSON.stringify(showcaseCaseJsonSchema)).toContain("curated-preview");
  });

  it("accepts a curated public preview without verified-only fields", () => {
    expect(parseShowcaseCase(curatedCase()).evidence.kind).toBe("curated-preview");
  });

  it("rejects a curated preview that is labelled verified", () => {
    const result = safeParseShowcaseCase(curatedCase({ reviewStatus: "verified" }));
    expect(result.success).toBe(false);
  });

  it("requires a revision example when revision is advertised", () => {
    const result = safeParseShowcaseCase(
      curatedCase({ demonstratedCapabilities: ["playable", "revision"] }),
    );
    expect(result.success).toBe(false);
  });

  it("requires three distinct live source runs and matching repeat count", () => {
    const base = curatedCase({
      reviewStatus: "verified",
      evidence: {
        kind: "live-verified",
        generatorCommit: "generator",
        rendererCommit: "renderer",
        benchmarkVersion: "2.0.0",
        benchmarkReport: { status: "passed", summary: "passed" },
        sourceRunIds: ["run-1", "run-2", "run-3"],
        repeatCount: 3,
        verifiedAt: "2026-07-13T00:00:00Z",
        routingMode: "auto",
      },
    });
    expect(parseShowcaseCase(base).evidence.kind).toBe("live-verified");
    expect(
      safeParseShowcaseCase({
        ...base,
        evidence: { ...base.evidence, sourceRunIds: ["run-1", "run-2"], repeatCount: 2 },
      }).success,
    ).toBe(false);
    expect(
      safeParseShowcaseCase({
        ...base,
        evidence: { ...base.evidence, repeatCount: 4 },
      }).success,
    ).toBe(false);
    expect(
      safeParseShowcaseCase({
        ...base,
        evidence: { ...base.evidence, sourceRunIds: ["run-1", "run-1", "run-3"] },
      }).success,
    ).toBe(false);
  });

  it.each(["../secret", "foo/bar", "foo\\bar", "foo%2Fbar"]) (
    "rejects path traversal slug %s",
    (slug) => {
      expect(() => parseShowcaseCase(curatedCase({ slug }))).toThrow();
    },
  );
});
