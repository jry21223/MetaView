import { describe, expect, it } from "vitest";

import { createShowcaseBaselineReport } from "./showcaseBaselineReport";
import { createShowcaseReviewPacket } from "./showcaseReviewPacket";
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

describe("createShowcaseReviewPacket", () => {
  it("builds a deterministic human review packet for ready showcase screenshots", () => {
    const report = createShowcaseBaselineReport(
      [
        {
          id: "projectile_motion",
          domain: "physics",
          packId: "physics-basic",
          rendererKind: "physics_force_scene",
          requiredMarkers: ['data-asset-id="projectile-body-dot"', 'data-semantic-role="motion_trail"'],
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

    const packet = createShowcaseReviewPacket(report, {
      generatedAt: "2026-07-02T01:00:00.000Z",
      referenceCommand: "SHOWCASE_REFERENCE_REVIEWER=visual-reviewer npm --workspace apps/web run showcase:approve-reference",
    });

    expect(packet).toContain("# MetaView Subject Visual Showcase Review Packet");
    expect(packet).toContain("Baseline report generated at: `2026-07-02T00:00:00.000Z`");
    expect(packet).toContain("Packet generated at: `2026-07-02T01:00:00.000Z`");
    expect(packet).toContain("Review readiness: `ready_for_review`");
    expect(packet).toContain("| `projectile_motion` | physics | physics_force_scene | physics-basic | ready_for_review |");
    expect(packet).toContain("[open screenshot](/tmp/projectile_motion.png)");
    expect(packet).toContain("- [ ] `projectile_motion`");
    expect(packet).toContain('Required markers: `data-asset-id="projectile-body-dot"`, `data-semantic-role="motion_trail"`');
    expect(packet).toContain("Image stats: 960x540, 50000 bytes, 100 colors, 12.0% content.");
    expect(packet).toContain("SHOWCASE_REFERENCE_REVIEWER=visual-reviewer npm --workspace apps/web run showcase:approve-reference");
  });

  it("keeps blocked screenshots visible with deterministic blocker metadata", () => {
    const report = createShowcaseBaselineReport(
      [
        {
          id: "east_asia_monsoon",
          domain: "geography",
          packId: "geography-earth-basic",
          rendererKind: "geo_map_scene",
          requiredMarkers: ['data-asset-id="east-asia-map-layer"'],
          imageQuality: thresholds,
        },
      ],
      [],
      "2026-07-02T00:00:00.000Z",
    );

    const packet = createShowcaseReviewPacket(report, {
      generatedAt: "2026-07-02T01:00:00.000Z",
    });

    expect(packet).toContain("Review readiness: `blocked`");
    expect(packet).toContain("## Blocked Fixtures");
    expect(packet).toContain("- `east_asia_monsoon`: missing_summary");
    expect(packet).toContain("| `east_asia_monsoon` | geography | geo_map_scene | geography-earth-basic | blocked | missing screenshot |");
    expect(packet).toContain("- [ ] `east_asia_monsoon`");
    expect(packet).toContain("Screenshot: missing");
  });
});
