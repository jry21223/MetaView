import { describe, expect, it } from "vitest";

import { createShowcaseBaselineReport } from "./showcaseBaselineReport";
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
          imageQuality: thresholds,
        },
        {
          id: "projectile_motion",
          domain: "physics",
          packId: "physics-basic",
          rendererKind: "physics_force_scene",
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
    expect(report.missingSummaryIds).toEqual(["east_asia_monsoon"]);
    expect(report.unexpectedSummaryIds).toEqual(["unexpected_fixture"]);
    expect(report.entries.find((entry) => entry.id === "projectile_motion")?.issues).toContain(
      "content_pixel_ratio",
    );
  });
});
