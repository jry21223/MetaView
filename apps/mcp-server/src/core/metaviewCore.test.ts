import { describe, expect, it } from "vitest";

import { createMetaViewCore } from "./metaviewCore";

describe("MetaView MCP core discovery", () => {
  it("lists existing subject capabilities with renderer and asset-pack metadata", () => {
    const core = createMetaViewCore();

    const capabilities = core.listCapabilities();

    expect(capabilities.subjects).toContainEqual(
      expect.objectContaining({
        id: "geography",
        support: "partial",
        renderers: expect.arrayContaining(["geo_map_scene"]),
        assetPacks: ["geography-basic"],
        flagshipCases: ["east_asia_monsoon"],
      }),
    );
    expect(capabilities.subjects).toContainEqual(
      expect.objectContaining({
        id: "physics",
        support: "partial",
        renderers: expect.arrayContaining(["physics_force_scene"]),
        assetPacks: ["physics-basic"],
        flagshipCases: ["projectile_motion"],
      }),
    );
  });

  it("returns asset-pack metadata without embedding raw asset contents", () => {
    const core = createMetaViewCore();

    const result = core.listAssetPacks({ subject: "geography" });

    expect(result.packs).toEqual([
      expect.objectContaining({
        packId: "geography-basic",
        subject: "geography",
        version: "0.1.0",
        semanticRoles: expect.arrayContaining(["land", "ocean", "map_layer", "wind"]),
        resourceUri: "metaview://kits/geography-basic/manifest",
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("<svg");
  });

  it("reads manifests through controlled MCP resource URIs", () => {
    const core = createMetaViewCore();

    const resource = core.readResource("metaview://kits/geography-basic/manifest");

    expect(resource.mimeType).toBe("application/json");
    expect(JSON.parse(resource.text)).toEqual(
      expect.objectContaining({
        packId: "geography-basic",
        subject: "geography",
        assets: expect.arrayContaining([
          expect.objectContaining({
            id: "monsoon-wind-arrow",
            resourceUri: "metaview://assets/geography-basic/monsoon-wind-arrow.svg",
            license: "internal",
          }),
        ]),
      }),
    );
  });

  it("resolves requested semantic roles through the asset registry", () => {
    const core = createMetaViewCore();

    const result = core.resolveAssets({
      subject: "geography",
      sceneType: "east_asia_monsoon",
      semanticRoles: ["land", "wind", "pressure_high"],
    });

    expect(result.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          semanticRole: "wind",
          assetId: "monsoon-wind-arrow",
          packId: "geography-basic",
          resourceUri: "metaview://assets/geography-basic/monsoon-wind-arrow.svg",
          license: "internal",
        }),
      ]),
    );
    expect(result.missing).toEqual(["pressure_high"]);
  });

  it("compiles a controlled scene blueprint without producing a playbook", () => {
    const core = createMetaViewCore();

    const result = core.compileSceneBlueprint({
      topic: "东亚季风：海陆热力差异如何反转风向",
      subject: "geography",
      audience: "middle_school",
      durationSeconds: 45,
      style: "clean_educational",
    });

    expect(result.sceneBlueprint).toEqual(
      expect.objectContaining({
        subject: "geography",
        sceneType: "east_asia_monsoon",
        visualIntent: expect.arrayContaining(["land_ocean_thermal_contrast", "seasonal_wind_reversal"]),
        requiredAssets: expect.arrayContaining(["land", "ocean", "wind", "pressure_high", "pressure_low"]),
      }),
    );
    expect(JSON.stringify(result)).not.toContain("steps");
  });

  it("validates visual quality with pass, score, and warnings", () => {
    const core = createMetaViewCore();

    const report = core.validateVisualQuality({
      playbookScript: {
        fps: 30,
        total_frames: 90,
        domain: "geography",
        title: "东亚季风",
        summary: "海陆热力差异改变风向。",
        parameter_controls: [],
        steps: [
          {
            step_id: "monsoon_intro",
            end_frame: 90,
            title: "季风图层",
            voiceover_text: "先看海陆分布。",
            tokens: [],
            snapshot: {
              kind: "geo_map_scene",
              layers: [],
              flows: [],
            },
          },
        ],
      },
    });

    expect(report.pass).toBe(false);
    expect(report.score).toBeLessThan(1);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "high",
          code: "missing_pack_id",
          message: expect.stringContaining("pack_id"),
        }),
      ]),
    );
  });
});
