import { describe, expect, it } from "vitest";

import { listAssetPacks, type SubjectVisualKit } from "./assetRegistry";
import { auditAssetPacks } from "./assetAudit";

function basePack(overrides: Partial<SubjectVisualKit> = {}): SubjectVisualKit {
  return {
    schemaVersion: "1.0.0",
    packId: "test-basic",
    subject: "physics",
    version: "0.1.0",
    license: "internal",
    licenseMode: "single",
    defaultLicense: "internal",
    sceneTemplates: ["physics_force_scene"],
    rendererKinds: ["physics_force_scene"],
    sources: [
      {
        id: "internal",
        label: "MetaView internal",
        license: "internal",
        sourceUrl: null,
        licenseUrl: null,
        attribution: null,
      },
    ],
    assets: [
      {
        id: "projectile",
        type: "svg",
        path: "/assets/test/projectile.svg",
        tags: ["projectile"],
        semanticRoles: ["object", "projectile"],
        sourceId: "internal",
        sourceUrl: null,
        licenseUrl: null,
        attribution: null,
        license: "internal",
        commercialUseStatus: "allowed",
        commercialUseAllowed: true,
        requiresAttribution: false,
        shareAlike: false,
        modificationAllowed: true,
        modifiedFrom: null,
      },
    ],
    ...overrides,
  };
}

describe("assetAudit", () => {
  it("passes current registered starter packs", () => {
    expect(auditAssetPacks(listAssetPacks())).toMatchObject({
      ok: true,
      errors: [],
    });
  });

  it("fails unknown licenses before assets can enter the registry", () => {
    const report = auditAssetPacks([
      basePack({
        assets: [
          {
            ...basePack().assets[0],
            id: "unknown-license",
            license: "unknown",
            commercialUseAllowed: false,
          },
        ],
      }),
    ]);

    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: "unknown_license",
        packId: "test-basic",
        assetId: "unknown-license",
      }),
    );
  });

  it("fails assets that require attribution but omit it", () => {
    const report = auditAssetPacks([
      basePack({
        licenseMode: "mixed",
        sources: [
          ...basePack().sources,
          {
            id: "cc-by-source",
            label: "CC BY source",
            license: "cc-by-4.0",
            sourceUrl: "https://example.com/source",
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
            attribution: null,
          },
        ],
        assets: [
          {
            ...basePack().assets[0],
            id: "cc-by-asset",
            sourceId: "cc-by-source",
            license: "cc-by-4.0",
            sourceUrl: "https://example.com/source",
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
            attribution: null,
            commercialUseAllowed: true,
            requiresAttribution: true,
          },
        ],
      }),
    ]);

    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: "missing_attribution",
        assetId: "cc-by-asset",
      }),
    );
  });

  it("fails starter packs whose rendererKinds drift from the dedicated renderer", () => {
    const report = auditAssetPacks([
      basePack({
        packId: "geography-basic",
        subject: "geography",
        sceneTemplates: ["geo_map_scene"],
        rendererKinds: ["algorithm_array"],
      }),
    ]);

    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: "renderer_kind_mismatch",
        packId: "geography-basic",
      }),
    );
  });
});
