import { describe, expect, it } from "vitest";

import { createApprovedShowcaseReference } from "./showcaseApprovedReference";
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

function readyReport() {
  return createShowcaseBaselineReport(
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
  );
}

describe("createApprovedShowcaseReference", () => {
  it("creates an approved reference from a ready baseline report and explicit reviewer", () => {
    const reference = createApprovedShowcaseReference(readyReport(), {
      reviewer: "visual-reviewer",
      approvedAt: "2026-07-02T00:00:00.000Z",
      notes: "Projectile asset, trail, vectors, and formula card reviewed.",
    });

    expect(reference).toMatchObject({
      generated_by: "showcase_baseline_approval",
      approved_at: "2026-07-02T00:00:00.000Z",
      reviewer: "visual-reviewer",
      fixture_count: 1,
      entries: [
        {
          id: "projectile_motion",
          stats: {
            bytes: 50000,
            uniqueColors: 100,
            contentPixelRatio: 0.12,
            contentWidthRatio: 0.625,
            contentHeightRatio: 0.667,
          },
          review: {
            status: "approved",
            reviewer: "visual-reviewer",
            approvedAt: "2026-07-02T00:00:00.000Z",
            notes: "Projectile asset, trail, vectors, and formula card reviewed.",
          },
        },
      ],
    });
  });

  it("requires a reviewer before stamping an approved reference", () => {
    expect(() =>
      createApprovedShowcaseReference(readyReport(), {
        reviewer: " ",
        approvedAt: "2026-07-02T00:00:00.000Z",
      }),
    ).toThrow("reviewer");
  });

  it("rejects reports that are not ready for review", () => {
    const blockedReport = createShowcaseBaselineReport(
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
      [],
    );

    expect(() =>
      createApprovedShowcaseReference(blockedReport, {
        reviewer: "visual-reviewer",
        approvedAt: "2026-07-02T00:00:00.000Z",
      }),
    ).toThrow("not ready");
  });

  it("rejects reports with missing scene contract assets before stamping references", () => {
    const contractBlockedReport = createShowcaseBaselineReport(
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
    );

    expect(contractBlockedReport.reviewReady).toBe(true);
    expect(contractBlockedReport.contractOk).toBe(false);
    expect(() =>
      createApprovedShowcaseReference(contractBlockedReport, {
        reviewer: "visual-reviewer",
        approvedAt: "2026-07-02T00:00:00.000Z",
      }),
    ).toThrow("scene contract assets");
  });
});
