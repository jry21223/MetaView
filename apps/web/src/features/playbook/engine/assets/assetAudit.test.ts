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
    defaultTeachingUse: "formal",
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
        packId: "geography-earth-basic",
        subject: "geography",
        sceneTemplates: ["geo_map_scene"],
        rendererKinds: ["algorithm_array"],
      }),
    ]);

    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: "renderer_kind_mismatch",
        packId: "geography-earth-basic",
      }),
    );
  });

  it("fails asset paths that do not exist under the public asset root", () => {
    const missingPath = "/assets/metaview-kits/test-basic/missing.svg";
    const report = auditAssetPacks(
      [
        basePack({
          assets: [
            {
              ...basePack().assets[0],
              path: missingPath,
            },
          ],
        }),
      ],
      {
        pathExists: (assetPath) => assetPath !== missingPath,
      },
    );

    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: "missing_asset_file",
        packId: "test-basic",
        assetId: "projectile",
      }),
    );
  });

  it("fails chemistry scene templates without matching compiler contract assets", () => {
    const chemistryPack = basePack({
      packId: "chemistry-basic",
      subject: "chemistry",
      sceneTemplates: ["molecule_2d_water"],
      rendererKinds: ["molecule_2d_scene", "reaction_scene"],
      assets: [
        {
          ...basePack().assets[0],
          id: "water-molecule-preset",
          type: "json",
          path: "/assets/metaview-kits/chemistry-basic/molecule-presets/water.json",
          semanticRoles: ["molecule", "water", "molecule_preset"],
        },
      ],
    });

    const report = auditAssetPacks([chemistryPack], {
      pathExists: () => true,
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: "missing_scene_template_contract",
        packId: "chemistry-basic",
        assetId: "water-molecule-contract",
      }),
    );
  });

  it("fails biology scene templates without matching compiler contract assets", () => {
    const biologyPack = basePack({
      packId: "biology-basic",
      subject: "biology",
      sceneTemplates: ["cell_structure"],
      rendererKinds: ["bio_cell_scene", "bio_process_scene"],
      assets: [
        {
          ...basePack().assets[0],
          id: "cell-outline",
          path: "/assets/metaview-kits/biology-basic/icons/cell-outline.svg",
          semanticRoles: ["cell"],
        },
      ],
    });

    const report = auditAssetPacks([biologyPack], {
      pathExists: () => true,
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: "missing_scene_template_contract",
        packId: "biology-basic",
        assetId: "cell-structure-contract",
      }),
    );
  });

  it("fails algorithm scene templates without matching compiler contract assets", () => {
    const algorithmPack = basePack({
      packId: "algorithm-code-basic",
      subject: "algorithm",
      sceneTemplates: ["bfs_graph"],
      rendererKinds: [
        "graph_scene",
        "call_stack_scene",
        "code_trace_scene",
        "algorithm_array",
        "algorithm_tree",
      ],
      assets: [
        {
          ...basePack().assets[0],
          id: "bfs-graph-preset",
          type: "json",
          path: "/assets/metaview-kits/algorithm-code-basic/graph/bfs-graph-preset.json",
          semanticRoles: ["bfs", "graph", "graph_scene"],
        },
      ],
    });

    const report = auditAssetPacks([algorithmPack], {
      pathExists: () => true,
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: "missing_scene_template_contract",
        packId: "algorithm-code-basic",
        assetId: "bfs-graph-contract",
      }),
    );
  });
});
