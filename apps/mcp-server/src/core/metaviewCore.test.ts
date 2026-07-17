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
        assetPacks: expect.arrayContaining(["geography-basic", "geography-earth-basic"]),
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

    expect(result.packs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packId: "geography-basic",
          subject: "geography",
          version: "0.1.0",
          semanticRoles: expect.arrayContaining(["land", "ocean", "map_layer", "wind"]),
          resourceUri: "metaview://kits/geography-basic/manifest",
        }),
        expect.objectContaining({
          packId: "geography-earth-basic",
          subject: "geography",
          version: "0.1.0",
          semanticRoles: expect.arrayContaining(["land", "coastline", "country_boundary", "monsoon_flow"]),
          resourceUri: "metaview://kits/geography-earth-basic/manifest",
        }),
      ]),
    );
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

  it("reads licensed asset resources through controlled MCP URIs", () => {
    const core = createMetaViewCore();

    const resource = core.readResource("metaview://assets/geography-basic/east-asia-map-placeholder.svg");

    expect(resource.mimeType).toBe("image/svg+xml");
    expect(resource.text).toContain('data-source="natural-earth"');
  });
});
