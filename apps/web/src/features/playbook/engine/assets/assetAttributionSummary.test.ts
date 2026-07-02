import { describe, expect, it } from "vitest";

import type { VisualQualityWarning } from "./visualQualityGate";
import { createAssetAttributionReport, createAssetAttributionSummary } from "./assetAttributionSummary";

describe("createAssetAttributionSummary", () => {
  it("deduplicates asset policy warnings into exportable attribution entries", () => {
    const warnings: VisualQualityWarning[] = [
      {
        code: "asset_requires_attribution",
        step_id: "s1",
        snapshot_kind: "physics_force_scene",
        snapshot_path: "snapshot",
        domain: "physics",
        asset_id: "cc-by-diagram",
        pack_id: "physics-basic",
        license: "cc-by-4.0",
        commercialUseStatus: "allowed-with-attribution",
        attribution: "Example Creator",
        sourceUrl: "https://example.test/asset",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        message: "requires attribution",
      },
      {
        code: "asset_share_alike",
        step_id: "s2",
        snapshot_kind: "physics_force_scene",
        snapshot_path: "snapshot",
        domain: "physics",
        asset_id: "cc-by-diagram",
        pack_id: "physics-basic",
        license: "cc-by-4.0",
        commercialUseStatus: "allowed-with-attribution",
        attribution: "Example Creator",
        shareAlike: true,
        message: "share alike",
      },
      {
        code: "asset_commercial_use_restricted",
        step_id: "s3",
        snapshot_kind: "geo_map_scene",
        snapshot_path: "snapshot",
        domain: "geography",
        asset_id: "restricted-map",
        pack_id: "geography-basic",
        license: "unknown",
        commercialUseStatus: "restricted",
        attribution: "Unknown map source",
        message: "commercial restricted",
      },
      {
        code: "missing_asset",
        step_id: "s4",
        snapshot_kind: "physics_force_scene",
        snapshot_path: "snapshot",
        domain: "physics",
        asset_id: "missing-projectile",
        pack_id: "physics-basic",
        message: "missing",
      },
    ];

    const summary = createAssetAttributionSummary(warnings);

    expect(summary.entries).toEqual([
      expect.objectContaining({
        asset_id: "restricted-map",
        pack_id: "geography-basic",
        license: "unknown",
        attribution: "Unknown map source",
        commercialUseRestricted: true,
        warningCodes: ["asset_commercial_use_restricted"],
        stepIds: ["s3"],
      }),
      expect.objectContaining({
        asset_id: "cc-by-diagram",
        pack_id: "physics-basic",
        license: "cc-by-4.0",
        attribution: "Example Creator",
        requiresAttribution: true,
        shareAlike: true,
        warningCodes: ["asset_requires_attribution", "asset_share_alike"],
        stepIds: ["s1", "s2"],
      }),
    ]);
    expect(summary.attributionRequired.map((entry) => entry.asset_id)).toEqual(["cc-by-diagram"]);
    expect(summary.commercialUseRestricted.map((entry) => entry.asset_id)).toEqual(["restricted-map"]);
    expect(summary.shareAlike.map((entry) => entry.asset_id)).toEqual(["cc-by-diagram"]);
    expect(summary.unknownLicense.map((entry) => entry.asset_id)).toEqual([]);
  });

  it("serializes asset policy warnings into a snake_case export report", () => {
    const report = createAssetAttributionReport([
      {
        code: "asset_requires_attribution",
        step_id: "s1",
        snapshot_kind: "physics_force_scene",
        snapshot_path: "snapshot",
        domain: "physics",
        asset_id: "cc-by-diagram",
        pack_id: "physics-basic",
        license: "cc-by-4.0",
        commercialUseStatus: "allowed-with-attribution",
        attribution: "Example Creator",
        sourceUrl: "https://example.test/asset",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        message: "requires attribution",
      },
      {
        code: "missing_asset",
        step_id: "s2",
        snapshot_kind: "physics_force_scene",
        snapshot_path: "snapshot",
        domain: "physics",
        asset_id: "missing",
        pack_id: "physics-basic",
        message: "missing",
      },
    ]);

    expect(report).toEqual({
      generated_by: "visual_quality_gate",
      entries: [
        {
          asset_id: "cc-by-diagram",
          pack_id: "physics-basic",
          license: "cc-by-4.0",
          commercial_use_status: "allowed-with-attribution",
          attribution: "Example Creator",
          source_url: "https://example.test/asset",
          license_url: "https://creativecommons.org/licenses/by/4.0/",
          requires_attribution: true,
          commercial_use_restricted: false,
          share_alike: false,
          unknown_license: false,
          warning_codes: ["asset_requires_attribution"],
          step_ids: ["s1"],
        },
      ],
      attribution_required: ["physics-basic/cc-by-diagram"],
      license_risk: [],
    });
  });

  it("returns an empty export report when the visual gate found no asset policy warnings", () => {
    const report = createAssetAttributionReport([
      {
        code: "missing_asset",
        step_id: "s1",
        snapshot_kind: "physics_force_scene",
        snapshot_path: "snapshot",
        domain: "physics",
        asset_id: "missing",
        pack_id: "physics-basic",
        message: "missing",
      },
    ]);

    expect(report).toEqual({
      generated_by: "visual_quality_gate",
      entries: [],
      attribution_required: [],
      license_risk: [],
    });
  });
});
