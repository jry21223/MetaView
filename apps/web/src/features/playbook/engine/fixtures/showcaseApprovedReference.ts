import type {
  ShowcaseBaselineReferenceEntry,
  ShowcaseBaselineReport,
  ShowcaseScreenshotReferenceReview,
} from "./showcaseBaselineReport";

export interface ApprovedShowcaseReferenceOptions {
  reviewer: string;
  approvedAt: string;
  notes?: string;
}

export interface ApprovedShowcaseReference {
  generated_by: "showcase_baseline_approval";
  source_report_generated_at: string;
  approved_at: string;
  reviewer: string;
  fixture_count: number;
  entries: Array<ShowcaseBaselineReferenceEntry & { review: ShowcaseScreenshotReferenceReview }>;
}

function normalizedReviewer(reviewer: string): string {
  const trimmed = reviewer.trim();
  if (!trimmed) {
    throw new Error("A reviewer is required before approving showcase screenshot references.");
  }
  return trimmed;
}

function referenceStats(entry: ShowcaseBaselineReport["entries"][number]): ShowcaseBaselineReferenceEntry["stats"] {
  if (!entry.stats) {
    throw new Error(`Showcase fixture "${entry.id}" has no screenshot stats and is not ready for approval.`);
  }

  return {
    bytes: entry.stats.bytes,
    uniqueColors: entry.stats.uniqueColors,
    contentPixelRatio: entry.stats.contentPixelRatio,
    contentWidthRatio: entry.stats.contentWidthRatio,
    contentHeightRatio: entry.stats.contentHeightRatio,
  };
}

export function createApprovedShowcaseReference(
  report: ShowcaseBaselineReport,
  options: ApprovedShowcaseReferenceOptions,
): ApprovedShowcaseReference {
  if (!report.reviewReady) {
    throw new Error("Showcase baseline report is not ready for approval.");
  }

  const reviewer = normalizedReviewer(options.reviewer);
  const review: ShowcaseScreenshotReferenceReview = {
    status: "approved",
    reviewer,
    approvedAt: options.approvedAt,
    ...(options.notes?.trim() && { notes: options.notes.trim() }),
  };

  return {
    generated_by: "showcase_baseline_approval",
    source_report_generated_at: report.generatedAt,
    approved_at: options.approvedAt,
    reviewer,
    fixture_count: report.fixtureCount,
    entries: report.entries.map((entry) => ({
      id: entry.id,
      stats: referenceStats(entry),
      review,
    })),
  };
}
