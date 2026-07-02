import { describe, expect, it } from "vitest";

import { createShowcaseBaselineReport, isShowcaseBaselineReleaseReady } from "./showcaseBaselineReport";
import type { ShowcaseImageQualityThresholds } from "./showcaseImageQuality";

const thresholds: ShowcaseImageQualityThresholds = {
  minWidth: 400,
  minHeight: 250,
  minBytes: 20000,
  minUniqueColors: 24,
  minNonTransparentRatio: 0.95,
  minContentPixelRatio: 0.02,
  minContentWidthRatio: 0.25,
  minContentHeightRatio: 0.18,
};

const passingStats = {
  width: 960,
  height: 540,
  bytes: 50000,
  uniqueColors: 100,
  nonTransparentRatio: 1,
  dominantColor: { red: 255, green: 255, blue: 255, alpha: 255 },
  contentBounds: { x: 20, y: 20, width: 600, height: 360 },
  contentPixelRatio: 0.12,
  contentWidthRatio: 0.625,
  contentHeightRatio: 0.667,
};

describe("showcaseBaselineReport", () => {
  it("reports margins for screenshot stats that meet the catalog baseline", () => {
    const report = createShowcaseBaselineReport(
      [
        {
          id: "projectile_motion",
          domain: "physics",
          packId: "physics-basic",
          rendererKind: "physics_force_scene",
          requiredMarkers: ['data-asset-id="projectile-body-dot"', 'data-semantic-role="motion_trail"'],
          imageQuality: thresholds,
          contractCoverage: {
            status: "matched",
            contractIds: ["projectile-contract"],
            requiredAssetIds: ["projectile-body-dot"],
            renderedAssetIds: ["projectile-body-dot", "force-vector-arrow"],
            missingAssetIds: [],
          },
        },
      ],
      [
        {
          id: "projectile_motion",
          frame: 77,
          output: "/tmp/projectile_motion.png",
          imageQuality: thresholds,
          ...passingStats,
        },
      ],
    );

    expect(report.ok).toBe(true);
    expect(report.contractOk).toBe(true);
    expect(report.contractIssues).toEqual([]);
    expect(report.reviewReady).toBe(true);
    expect(report.missingSummaryIds).toEqual([]);
    expect(report.unexpectedSummaryIds).toEqual([]);
    expect(report.entries[0]).toMatchObject({
      id: "projectile_motion",
      issues: [],
      margins: {
        bytes: 30000,
        uniqueColors: 76,
        contentPixelRatio: 0.1,
        contentWidthRatio: 0.375,
        contentHeightRatio: 0.487,
      },
      screenshotReview: {
        status: "ready_for_review",
        gate: "showcase_baseline",
        output: "/tmp/projectile_motion.png",
        requiredMarkerCount: 2,
        requiredMarkers: ['data-asset-id="projectile-body-dot"', 'data-semantic-role="motion_trail"'],
        blockingIssues: [],
        driftIssues: [],
      },
      contractCoverage: {
        status: "matched",
        contractIds: ["projectile-contract"],
        requiredAssetIds: ["projectile-body-dot"],
        renderedAssetIds: ["projectile-body-dot", "force-vector-arrow"],
        missingAssetIds: [],
      },
    });
  });

  it("flags missing summary rows, unexpected rows, and under-baseline renders", () => {
    const report = createShowcaseBaselineReport(
      [
        {
          id: "east_asia_monsoon",
          domain: "geography",
          packId: "geography-earth-basic",
          rendererKind: "geo_map_scene",
          requiredMarkers: ['data-asset-id="east-asia-land-110m"'],
          imageQuality: thresholds,
        },
        {
          id: "projectile_motion",
          domain: "physics",
          packId: "physics-basic",
          rendererKind: "physics_force_scene",
          requiredMarkers: ['data-asset-id="projectile-body-dot"'],
          imageQuality: thresholds,
        },
      ],
      [
        {
          id: "projectile_motion",
          frame: 77,
          output: "/tmp/projectile_motion.png",
          imageQuality: thresholds,
          ...passingStats,
          contentPixelRatio: 0.01,
        },
        {
          id: "unexpected_fixture",
          frame: 77,
          output: "/tmp/unexpected_fixture.png",
          imageQuality: thresholds,
          ...passingStats,
        },
      ],
    );

    expect(report.ok).toBe(false);
    expect(report.reviewReady).toBe(false);
    expect(report.missingSummaryIds).toEqual(["east_asia_monsoon"]);
    expect(report.unexpectedSummaryIds).toEqual(["unexpected_fixture"]);
    expect(report.entries.find((entry) => entry.id === "east_asia_monsoon")?.screenshotReview).toMatchObject({
      status: "blocked",
      output: null,
      blockingIssues: ["missing_summary"],
    });
    expect(report.entries.find((entry) => entry.id === "projectile_motion")?.issues).toContain(
      "content_pixel_ratio",
    );
    expect(report.entries.find((entry) => entry.id === "projectile_motion")?.screenshotReview).toMatchObject({
      status: "blocked",
      blockingIssues: ["content_pixel_ratio"],
    });
  });

  it("reports drift from a previous screenshot reference separately from hard baseline issues", () => {
    const report = createShowcaseBaselineReport(
      [
        {
          id: "projectile_motion",
          domain: "physics",
          packId: "physics-basic",
          rendererKind: "physics_force_scene",
          requiredMarkers: ['data-asset-id="projectile-body-dot"'],
          imageQuality: thresholds,
        },
      ],
      [
        {
          id: "projectile_motion",
          frame: 77,
          output: "/tmp/projectile_motion.png",
          imageQuality: thresholds,
          ...passingStats,
          uniqueColors: 70,
          contentPixelRatio: 0.085,
          contentWidthRatio: 0.53,
        },
      ],
      "2026-07-02T00:00:00.000Z",
      {
        entries: [
          {
            id: "projectile_motion",
            stats: {
              ...passingStats,
              uniqueColors: 100,
              contentPixelRatio: 0.12,
              contentWidthRatio: 0.625,
            },
          },
        ],
      },
    );

    expect(report.ok).toBe(true);
    expect(report.driftOk).toBe(false);
    expect(report.reviewReady).toBe(false);
    expect(report.entries[0]).toMatchObject({
      issues: [],
      driftIssues: ["unique_colors_drop", "content_pixel_ratio_drop", "content_width_ratio_drop"],
      screenshotReview: {
        status: "drift_review_needed",
        blockingIssues: [],
        driftIssues: ["unique_colors_drop", "content_pixel_ratio_drop", "content_width_ratio_drop"],
      },
    });
  });

  it("marks a human-approved screenshot reference as current when no drift is detected", () => {
    const report = createShowcaseBaselineReport(
      [
        {
          id: "projectile_motion",
          domain: "physics",
          packId: "physics-basic",
          rendererKind: "physics_force_scene",
          requiredMarkers: ['data-asset-id="projectile-body-dot"'],
          imageQuality: thresholds,
        },
      ],
      [
        {
          id: "projectile_motion",
          frame: 77,
          output: "/tmp/projectile_motion.png",
          imageQuality: thresholds,
          ...passingStats,
        },
      ],
      "2026-07-02T00:00:00.000Z",
      {
        entries: [
          {
            id: "projectile_motion",
            stats: passingStats,
            review: {
              status: "approved",
              reviewer: "visual-reviewer",
              approvedAt: "2026-07-02T00:00:00.000Z",
              notes: "Projectile asset, trail, vectors, and formula card reviewed.",
            },
          },
        ],
      },
    );

    expect(report.ok).toBe(true);
    expect(report.driftOk).toBe(true);
    expect(report.reviewReady).toBe(true);
    expect(report.approvedReferenceReady).toBe(true);
    expect(report.entries[0].screenshotReview).toMatchObject({
      status: "approved_reference_current",
      blockingIssues: [],
      driftIssues: [],
      referenceReview: {
        status: "approved",
        reviewer: "visual-reviewer",
        approvedAt: "2026-07-02T00:00:00.000Z",
        notes: "Projectile asset, trail, vectors, and formula card reviewed.",
      },
    });
  });

  it("supports an opt-in release gate that requires approved screenshot references", () => {
    const report = createShowcaseBaselineReport(
      [
        {
          id: "projectile_motion",
          domain: "physics",
          packId: "physics-basic",
          rendererKind: "physics_force_scene",
          requiredMarkers: ['data-asset-id="projectile-body-dot"'],
          imageQuality: thresholds,
        },
      ],
      [
        {
          id: "projectile_motion",
          frame: 77,
          output: "/tmp/projectile_motion.png",
          imageQuality: thresholds,
          ...passingStats,
        },
      ],
    );

    expect(report.ok).toBe(true);
    expect(report.approvedReferenceReady).toBe(false);
    expect(isShowcaseBaselineReleaseReady(report)).toBe(true);
    expect(isShowcaseBaselineReleaseReady(report, { requireApprovedReference: true })).toBe(false);
  });

  it("blocks release readiness when a fixture is missing required scene contract assets", () => {
    const report = createShowcaseBaselineReport(
      [
        {
          id: "projectile_motion",
          domain: "physics",
          packId: "physics-basic",
          rendererKind: "physics_force_scene",
          requiredMarkers: ['data-asset-id="projectile-body-dot"'],
          imageQuality: thresholds,
          contractCoverage: {
            status: "missing",
            contractIds: ["projectile-contract"],
            requiredAssetIds: ["projectile-body-dot", "force-vector-arrow"],
            renderedAssetIds: ["force-vector-arrow"],
            missingAssetIds: ["projectile-body-dot"],
          },
        },
      ],
      [
        {
          id: "projectile_motion",
          frame: 77,
          output: "/tmp/projectile_motion.png",
          imageQuality: thresholds,
          ...passingStats,
        },
      ],
      "2026-07-02T00:00:00.000Z",
      {
        entries: [
          {
            id: "projectile_motion",
            stats: passingStats,
            review: {
              status: "approved",
              reviewer: "visual-reviewer",
              approvedAt: "2026-07-02T00:00:00.000Z",
            },
          },
        ],
      },
    );

    expect(report.ok).toBe(true);
    expect(report.approvedReferenceReady).toBe(true);
    expect(report.contractOk).toBe(false);
    expect(report.contractIssues).toEqual([
      {
        id: "projectile_motion",
        contractIds: ["projectile-contract"],
        missingAssetIds: ["projectile-body-dot"],
      },
    ]);
    expect(isShowcaseBaselineReleaseReady(report, { requireApprovedReference: true })).toBe(false);
  });
});
