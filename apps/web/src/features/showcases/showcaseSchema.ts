import { z } from "zod";

export const SHOWCASE_SCHEMA_VERSION = "1.0" as const;

export const ShowcaseDomainSchema = z.enum(["math", "algorithm", "code", "physics"]);
export type ShowcaseDomain = z.infer<typeof ShowcaseDomainSchema>;

export const ShowcaseReviewStatusSchema = z.enum(["draft", "reviewed", "verified"]);
export const ShowcaseVisibilitySchema = z.enum(["hidden", "public"]);
export const ShowcaseCapabilitySchema = z.enum([
  "playable",
  "followup",
  "revision",
  "restore",
  "export",
]);
export const ShowcaseActionSchema = z.enum(["play", "regenerate"]);

const PublicBenchmarkReportSchema = z
  .object({
    status: z.enum(["passed", "not-run"]),
    summary: z.string().min(1),
    version: z.string().min(1).optional(),
  })
  .strict();

export const ShowcaseEvidenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("curated-preview"),
      sourceCommit: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("recorded-verified"),
      sourceCommit: z.string().min(1),
      fixtureId: z.string().min(1),
      benchmarkReport: PublicBenchmarkReportSchema,
      verifiedAt: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("live-verified"),
      generatorCommit: z.string().min(1),
      rendererCommit: z.string().min(1),
      benchmarkVersion: z.literal("2.0.0"),
      benchmarkReport: PublicBenchmarkReportSchema,
      sourceRunIds: z.array(z.string().min(1)).min(3),
      repeatCount: z.number().int().min(3),
      verifiedAt: z.string().min(1),
      routingMode: z.literal("auto"),
    })
    .strict(),
]);
export type ShowcaseEvidence = z.infer<typeof ShowcaseEvidenceSchema>;

export const ShowcaseRevisionExampleSchema = z
  .object({
    sourceRunId: z.string().min(1),
    prompt: z.string().min(1),
    summary: z.string().min(1),
    beforeVersionId: z.string().min(1),
    afterVersionId: z.string().min(1),
    afterPlaybookUrl: z.string().min(1),
    afterDirectorUrl: z.string().min(1),
  })
  .strict();
export type ShowcaseRevisionExample = z.infer<typeof ShowcaseRevisionExampleSchema>;

export const ShowcaseCaseSchema = z
  .object({
    schemaVersion: z.literal(SHOWCASE_SCHEMA_VERSION),
    id: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1),
    summary: z.string().min(1),
    domain: ShowcaseDomainSchema,
    topic: z.string().min(1),
    prompt: z.string().min(1),
    learningGoal: z.string().min(1),
    keyConcepts: z.array(z.string().min(1)).min(1),
    reviewStatus: ShowcaseReviewStatusSchema,
    visibility: ShowcaseVisibilitySchema,
    posterUrl: z.string().min(1),
    playbookUrl: z.string().min(1),
    directorUrl: z.string().min(1),
    lessonSummaryUrl: z.string().min(1).optional(),
    qualitySummaryUrl: z.string().min(1).optional(),
    benchmarkSummaryUrl: z.string().min(1).optional(),
    evidence: ShowcaseEvidenceSchema,
    demonstratedCapabilities: z.array(ShowcaseCapabilitySchema).min(1),
    availableActions: z.array(ShowcaseActionSchema).min(1),
    revisionExample: ShowcaseRevisionExampleSchema.optional(),
  })
  .strict();

export type ShowcaseCase = z.infer<typeof ShowcaseCaseSchema>;

export const ShowcaseManifestEntrySchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    metaUrl: z.string().min(1),
    visibility: z.literal("public"),
  })
  .strict();

export const ShowcaseManifestSchema = z
  .object({
    schemaVersion: z.literal(SHOWCASE_SCHEMA_VERSION),
    cases: z.array(ShowcaseManifestEntrySchema),
  })
  .strict();

export type ShowcaseManifest = z.infer<typeof ShowcaseManifestSchema>;
export type ShowcaseManifestEntry = z.infer<typeof ShowcaseManifestEntrySchema>;

export const showcaseCaseJsonSchema = z.toJSONSchema(ShowcaseCaseSchema, {
  target: "draft-2020-12",
});

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A URL segment is intentionally stricter than the content schema. This keeps
 * static fetches inside /showcases even when a manifest or a caller is bad.
 */
export function assertSafeShowcaseSlug(slug: string): string {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    throw new Error("案例地址无效。");
  }
  if (decoded !== slug || !SLUG_PATTERN.test(slug) || slug.includes("..")) {
    throw new Error("案例地址无效。");
  }
  return slug;
}

function semanticIssues(value: ShowcaseCase): Array<{ path: (string | number)[]; message: string }> {
  const issues: Array<{ path: (string | number)[]; message: string }> = [];
  if (value.reviewStatus === "verified" && value.evidence.kind === "curated-preview") {
    issues.push({
      path: ["evidence", "kind"],
      message: "已验证案例不能使用精选预览证据。",
    });
  }
  if (
    value.evidence.kind === "live-verified" &&
    value.evidence.repeatCount !== value.evidence.sourceRunIds.length
  ) {
    issues.push({
      path: ["evidence", "repeatCount"],
      message: "实时验证的重复次数必须等于独立运行记录数。",
    });
  }
  if (
    value.evidence.kind === "live-verified" &&
    new Set(value.evidence.sourceRunIds).size !== value.evidence.sourceRunIds.length
  ) {
    issues.push({
      path: ["evidence", "sourceRunIds"],
      message: "实时验证必须引用互不重复的独立运行记录。",
    });
  }
  if (value.demonstratedCapabilities.includes("revision") && !value.revisionExample) {
    issues.push({
      path: ["revisionExample"],
      message: "展示 revision 能力时必须提供真实修订示例。",
    });
  }
  return issues;
}

export function safeParseShowcaseCase(
  input: unknown,
): z.ZodSafeParseResult<ShowcaseCase> {
  const parsed = ShowcaseCaseSchema.safeParse(input);
  if (!parsed.success) return parsed;
  const issues = semanticIssues(parsed.data);
  if (issues.length === 0) return parsed;
  return {
    success: false,
    error: new z.ZodError(
      issues.map((issue) => ({
        code: "custom" as const,
        path: issue.path,
        message: issue.message,
      })),
    ) as z.ZodError<ShowcaseCase>,
  };
}

export function parseShowcaseCase(input: unknown): ShowcaseCase {
  const parsed = safeParseShowcaseCase(input);
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}

export function safeParseShowcaseManifest(
  input: unknown,
): z.ZodSafeParseResult<ShowcaseManifest> {
  const parsed = ShowcaseManifestSchema.safeParse(input);
  if (!parsed.success) return parsed;
  try {
    parsed.data.cases.forEach((entry) => assertSafeShowcaseSlug(entry.slug));
  } catch (error) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: "custom",
          path: ["cases"],
          message: error instanceof Error ? error.message : "案例清单无效。",
        },
      ]) as z.ZodError<ShowcaseManifest>,
    };
  }
  return parsed;
}
