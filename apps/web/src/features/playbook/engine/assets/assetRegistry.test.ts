import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  findAssetByRole,
  getAssetPack,
  listAssetPacks,
} from "./assetRegistry";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPublicAsset(assetPath: string): string {
  return readFileSync(path.resolve(__dirname, "../../../../../public", `.${assetPath}`), "utf8");
}

function readPublicJson<T>(assetPath: string): T {
  return JSON.parse(readPublicAsset(assetPath)) as T;
}

describe("assetRegistry", () => {
  it("registers geography and physics starter visual kits", () => {
    const packs = listAssetPacks().map((pack) => pack.packId);

    expect(packs).toContain("geography-basic");
    expect(packs).toContain("physics-basic");
  });

  it("finds subject assets by semantic role", () => {
    expect(getAssetPack("geography-basic")?.subject).toBe("geography");
    expect(findAssetByRole("geography", "wind")?.id).toBe("monsoon-wind-arrow");
    expect(findAssetByRole("physics", "force")?.id).toBe("force-vector-arrow");
  });

  it("keeps rendererKinds aligned with the dedicated scene renderers", () => {
    expect(getAssetPack("geography-basic")?.rendererKinds).toEqual(["geo_map_scene"]);
    expect(getAssetPack("physics-basic")?.rendererKinds).toEqual(["physics_force_scene"]);
  });

  it("keeps the public manifest schema aligned with source provenance metadata", () => {
    const schema = readPublicJson<{
      properties: {
        assets: {
          items: {
            required: string[];
            properties: {
              commercialUseStatus: { enum: string[] };
            };
          };
        };
      };
    }>("/assets/metaview-kits/manifest.schema.json");

    expect(schema.properties.assets.items.required).toEqual(
      expect.arrayContaining(["commercialUseStatus", "sourceUrl", "licenseUrl", "modifiedFrom"]),
    );
    expect(schema.properties.assets.items.properties.commercialUseStatus.enum).toEqual(
      expect.arrayContaining(["allowed", "allowed-with-attribution", "restricted", "unknown"]),
    );
  });

  it("ships second-pass internal SVG quality markers for subject assets", () => {
    expect(readPublicAsset("/assets/metaview-kits/geography-basic/east-asia-map-placeholder.svg")).toContain(
      'data-asset-quality="v2"',
    );
    expect(readPublicAsset("/assets/metaview-kits/physics-basic/projectile-body-dot.svg")).toContain(
      'data-asset-quality="v2"',
    );
    expect(readPublicAsset("/assets/metaview-kits/physics-basic/force-vector-arrow.svg")).toContain(
      'data-asset-quality="v2"',
    );
  });

  it("records source and commercial-use metadata for every asset", () => {
    for (const pack of listAssetPacks()) {
      for (const asset of pack.assets) {
        expect(asset.commercialUseStatus, asset.id).toBe("allowed");
        expect("sourceUrl" in asset, asset.id).toBe(true);
        expect("licenseUrl" in asset, asset.id).toBe(true);
        expect("modifiedFrom" in asset, asset.id).toBe(true);
        if (asset.license !== "internal") {
          expect(asset.sourceUrl, asset.id).toMatch(/^https:\/\//);
          expect(asset.licenseUrl, asset.id).toMatch(/^https:\/\//);
          expect(asset.attribution, asset.id).toBeTruthy();
        }
      }
    }
  });

  it("uses Natural Earth public-domain data for the geography map asset", () => {
    const asset = getAssetPack("geography-basic")?.assets.find((item) =>
      item.semanticRoles.includes("map_layer"),
    );

    expect(asset).toMatchObject({
      license: "public-domain",
      attribution: "Natural Earth public domain map data; styled by MetaView",
      commercialUseStatus: "allowed",
      sourceUrl: "https://github.com/nvkelso/natural-earth-vector",
      licenseUrl: "https://www.naturalearthdata.com/about/terms-of-use/",
      modifiedFrom: "Natural Earth 1:110m Admin 0 Countries, selected East Asia features",
    });

    const svg = readPublicAsset(asset?.path ?? "");
    expect(svg).toContain('data-source="natural-earth"');
    expect(svg).toContain('data-natural-earth-layer="land"');
  });
});
