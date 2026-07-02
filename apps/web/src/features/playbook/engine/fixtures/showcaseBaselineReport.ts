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
}

export interface ShowcaseBaselineReport {
  ok: boolean;
  generatedAt: string;
  fixtureCount: number;
  renderedCount: number;
  missingSummaryIds: string[];
  unexpectedSummaryIds: string[];
  entries: ShowcaseBaselineReportEntry[];
}

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

export function createShowcaseBaselineReport(
  catalogEntries: readonly ShowcaseBaselineCatalogEntry[],
  summaryEntries: readonly ShowcaseBaselineSummaryEntry[],
  generatedAt = new Date().toISOString(),
): ShowcaseBaselineReport {
  const summaryById = new Map(summaryEntries.map((entry) => [entry.id, entry]));
  const catalogIds = new Set(catalogEntries.map((entry) => entry.id));
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
      };
    }

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
    };
  });

  return {
    ok:
      missingSummaryIds.length === 0 &&
      unexpectedSummaryIds.length === 0 &&
      entries.every((entry) => entry.issues.length === 0),
    generatedAt,
    fixtureCount: catalogEntries.length,
    renderedCount: summaryEntries.length,
    missingSummaryIds,
    unexpectedSummaryIds,
    entries,
  };
}
