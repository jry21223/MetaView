import {
  getShowcaseImageQualityIssues,
  type ShowcaseImageQualityIssue,
  type ShowcaseImageQualityStats,
  type ShowcaseImageQualityThresholds,
} from "./showcaseImageQuality";

export interface ShowcaseBaselineCatalogEntry {
  id: string;
  domain: string;
  packId: string;
  rendererKind: string;
  imageQuality: ShowcaseImageQualityThresholds;
}

export interface ShowcaseBaselineSummaryEntry extends ShowcaseImageQualityStats {
  id: string;
  frame: number;
  output: string;
  imageQuality?: ShowcaseImageQualityThresholds;
}

export type ShowcaseBaselineDriftIssue =
  | "bytes_drop"
  | "unique_colors_drop"
  | "content_pixel_ratio_drop"
  | "content_width_ratio_drop"
  | "content_height_ratio_drop";

export interface ShowcaseBaselineDriftPolicy {
  maxBytesDrop: number;
  maxUniqueColorsDrop: number;
  maxContentPixelRatioDrop: number;
  maxContentWidthRatioDrop: number;
  maxContentHeightRatioDrop: number;
}

export interface ShowcaseBaselineReferenceEntry {
  id: string;
  stats: Pick<
    ShowcaseImageQualityStats,
    "bytes" | "uniqueColors" | "contentPixelRatio" | "contentWidthRatio" | "contentHeightRatio"
  >;
}

export interface ShowcaseBaselineReference {
  entries: readonly ShowcaseBaselineReferenceEntry[];
}

export interface ShowcaseBaselineMargins {
  bytes: number;
  uniqueColors: number;
  nonTransparentRatio: number;
  contentPixelRatio: number;
  contentWidthRatio: number;
  contentHeightRatio: number;
}

export interface ShowcaseBaselineReportEntry {
  id: string;
  domain: string;
  packId: string;
  rendererKind: string;
  frame: number | null;
  output: string | null;
  baseline: ShowcaseImageQualityThresholds;
  stats: ShowcaseImageQualityStats | null;
  margins: ShowcaseBaselineMargins | null;
  issues: ShowcaseImageQualityIssue[];
  referenceStats: ShowcaseBaselineReferenceEntry["stats"] | null;
  driftIssues: ShowcaseBaselineDriftIssue[];
}

export interface ShowcaseBaselineReport {
  ok: boolean;
  driftOk: boolean;
  generatedAt: string;
  fixtureCount: number;
  renderedCount: number;
  missingSummaryIds: string[];
  unexpectedSummaryIds: string[];
  entries: ShowcaseBaselineReportEntry[];
}

export const DEFAULT_SHOWCASE_BASELINE_DRIFT_POLICY: ShowcaseBaselineDriftPolicy = {
  maxBytesDrop: 5000,
  maxUniqueColorsDrop: 12,
  maxContentPixelRatioDrop: 0.02,
  maxContentWidthRatioDrop: 0.05,
  maxContentHeightRatioDrop: 0.05,
};

function roundMargin(value: number) {
  return Number(value.toFixed(6));
}

function margin(stats: ShowcaseImageQualityStats, baseline: ShowcaseImageQualityThresholds): ShowcaseBaselineMargins {
  return {
    bytes: stats.bytes - baseline.minBytes,
    uniqueColors: stats.uniqueColors - baseline.minUniqueColors,
    nonTransparentRatio: roundMargin(stats.nonTransparentRatio - baseline.minNonTransparentRatio),
    contentPixelRatio: roundMargin(stats.contentPixelRatio - baseline.minContentPixelRatio),
    contentWidthRatio: roundMargin(stats.contentWidthRatio - baseline.minContentWidthRatio),
    contentHeightRatio: roundMargin(stats.contentHeightRatio - baseline.minContentHeightRatio),
  };
}

function driftIssues(
  stats: ShowcaseImageQualityStats,
  referenceStats: ShowcaseBaselineReferenceEntry["stats"] | undefined,
  policy: ShowcaseBaselineDriftPolicy,
): ShowcaseBaselineDriftIssue[] {
  if (!referenceStats) return [];

  const issues: ShowcaseBaselineDriftIssue[] = [];
  if (referenceStats.bytes - stats.bytes > policy.maxBytesDrop) issues.push("bytes_drop");
  if (referenceStats.uniqueColors - stats.uniqueColors > policy.maxUniqueColorsDrop) {
    issues.push("unique_colors_drop");
  }
  if (referenceStats.contentPixelRatio - stats.contentPixelRatio > policy.maxContentPixelRatioDrop) {
    issues.push("content_pixel_ratio_drop");
  }
  if (referenceStats.contentWidthRatio - stats.contentWidthRatio > policy.maxContentWidthRatioDrop) {
    issues.push("content_width_ratio_drop");
  }
  if (referenceStats.contentHeightRatio - stats.contentHeightRatio > policy.maxContentHeightRatioDrop) {
    issues.push("content_height_ratio_drop");
  }
  return issues;
}

export function createShowcaseBaselineReport(
  catalogEntries: readonly ShowcaseBaselineCatalogEntry[],
  summaryEntries: readonly ShowcaseBaselineSummaryEntry[],
  generatedAt = new Date().toISOString(),
  reference?: ShowcaseBaselineReference,
  driftPolicy: ShowcaseBaselineDriftPolicy = DEFAULT_SHOWCASE_BASELINE_DRIFT_POLICY,
): ShowcaseBaselineReport {
  const summaryById = new Map(summaryEntries.map((entry) => [entry.id, entry]));
  const catalogIds = new Set(catalogEntries.map((entry) => entry.id));
  const referenceById = new Map((reference?.entries ?? []).map((entry) => [entry.id, entry.stats]));
  const missingSummaryIds = catalogEntries.filter((entry) => !summaryById.has(entry.id)).map((entry) => entry.id);
  const unexpectedSummaryIds = summaryEntries.filter((entry) => !catalogIds.has(entry.id)).map((entry) => entry.id);

  const entries = catalogEntries.map((entry): ShowcaseBaselineReportEntry => {
    const summary = summaryById.get(entry.id);
    if (!summary) {
      return {
        id: entry.id,
        domain: entry.domain,
        packId: entry.packId,
        rendererKind: entry.rendererKind,
        frame: null,
        output: null,
        baseline: entry.imageQuality,
        stats: null,
        margins: null,
        issues: [],
        referenceStats: referenceById.get(entry.id) ?? null,
        driftIssues: [],
      };
    }
    const referenceStats = referenceById.get(entry.id);

    return {
      id: entry.id,
      domain: entry.domain,
      packId: entry.packId,
      rendererKind: entry.rendererKind,
      frame: summary.frame,
      output: summary.output,
      baseline: entry.imageQuality,
      stats: {
        width: summary.width,
        height: summary.height,
        bytes: summary.bytes,
        uniqueColors: summary.uniqueColors,
        nonTransparentRatio: summary.nonTransparentRatio,
        dominantColor: summary.dominantColor,
        contentBounds: summary.contentBounds,
        contentPixelRatio: summary.contentPixelRatio,
        contentWidthRatio: summary.contentWidthRatio,
        contentHeightRatio: summary.contentHeightRatio,
      },
      margins: margin(summary, entry.imageQuality),
      issues: getShowcaseImageQualityIssues(summary, entry.imageQuality),
      referenceStats: referenceStats ?? null,
      driftIssues: driftIssues(summary, referenceStats, driftPolicy),
    };
  });

  return {
    ok:
      missingSummaryIds.length === 0 &&
      unexpectedSummaryIds.length === 0 &&
      entries.every((entry) => entry.issues.length === 0),
    driftOk: entries.every((entry) => entry.driftIssues.length === 0),
    generatedAt,
    fixtureCount: catalogEntries.length,
    renderedCount: summaryEntries.length,
    missingSummaryIds,
    unexpectedSummaryIds,
    entries,
  };
}
