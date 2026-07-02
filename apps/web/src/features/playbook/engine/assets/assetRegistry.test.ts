import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

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
  it("registers the roadmap starter visual kits", () => {
    const packs = listAssetPacks().map((pack) => pack.packId);

    expect(packs).toContain("biology-basic");
    expect(packs).toContain("chemistry-basic");
    expect(packs).toContain("core-visual-basic");
    expect(packs).toContain("algorithm-code-basic");
    expect(packs).toContain("geography-basic");
    expect(packs).toContain("geography-earth-basic");
    expect(packs).toContain("math-basic");
    expect(packs).toContain("physics-basic");
  });

  it("finds subject assets by semantic role", () => {
    expect(getAssetPack("geography-basic")?.subject).toBe("geography");
    expect(findAssetByRole("biology", "nucleus")?.id).toBe("nucleus");
    expect(findAssetByRole("chemistry", "molecule")?.id).toBe("water-molecule-preset");
    expect(findAssetByRole("chemistry", "methane")?.id).toBe("methane-molecule-preset");
    expect(findAssetByRole("chemistry", "glucose")?.id).toBe("rdkit-smiles-glucose");
    expect(findAssetByRole("chemistry", "bond")?.id).toBe("bond-line");
    expect(findAssetByRole("chemistry", "reaction_arrow")?.id).toBe("reaction-arrow");
    expect(findAssetByRole("chemistry", "electron_flow")?.id).toBe("electron-flow");
    expect(findAssetByRole("algorithm", "graph_node")?.id).toBe("graph-node");
    expect(findAssetByRole("algorithm", "queue")?.id).toBe("queue-frame");
    expect(findAssetByRole("algorithm", "call_frame")?.id).toBe("call-frame");
    expect(findAssetByRole("algorithm", "stack_frame")?.id).toBe("stack-frame");
    expect(findAssetByRole("algorithm", "active_line")?.id).toBe("active-line");
    expect(findAssetByRole("algorithm", "binary_search")?.id).toBe("binary-search-trace-preset");
    expect(findAssetByRole("algorithm", "pointer")?.id).toBe("pointer-marker");
    expect(findAssetByRole("core", "flow_arrow")?.id).toBe("core-flow-arrow");
    expect(findAssetByRole("core", "callout")?.id).toBe("core-callout-label");
    expect(findAssetByRole("core", "formula_tag")?.id).toBe("core-formula-tag");
    expect(findAssetByRole("core", "moisture_particles")?.id).toBe("core-moisture-particles");
    expect(findAssetByRole("geography", "wind")?.id).toBe("monsoon-wind-arrow");
    expect(findAssetByRole("biology", "process_step")?.id).toBe("replication-fork");
    expect(findAssetByRole("math", "tangent")?.id).toBe("derivative-tangent-preset");
    expect(findAssetByRole("physics", "force")?.id).toBe("force-vector-arrow");
  });

  it("keeps rendererKinds aligned with the dedicated scene renderers", () => {
    expect(getAssetPack("biology-basic")?.rendererKinds).toEqual(["bio_cell_scene", "bio_process_scene"]);
    expect(getAssetPack("chemistry-basic")?.rendererKinds).toEqual(["molecule_2d_scene", "reaction_scene"]);
    expect(getAssetPack("core-visual-basic")?.rendererKinds).toEqual([
      "geo_map_scene",
      "physics_force_scene",
      "bio_cell_scene",
      "bio_process_scene",
      "molecule_2d_scene",
      "reaction_scene",
      "math_plot",
      "math_formula",
      "math_scene",
      "katex_overlay",
      "graph_scene",
      "algorithm_array",
      "algorithm_tree",
      "motion_scene",
    ]);
    expect(getAssetPack("algorithm-code-basic")?.rendererKinds).toEqual([
      "graph_scene",
      "call_stack_scene",
      "code_trace_scene",
      "algorithm_array",
      "algorithm_tree",
    ]);
    expect(getAssetPack("geography-basic")?.rendererKinds).toEqual(["geo_map_scene"]);
    expect(getAssetPack("geography-earth-basic")?.rendererKinds).toEqual(["geo_map_scene"]);
    expect(getAssetPack("math-basic")?.rendererKinds).toEqual(["math_plot", "math_scene", "math_formula", "katex_overlay"]);
    expect(getAssetPack("physics-basic")?.rendererKinds).toEqual(["physics_force_scene"]);
  });

  it("keeps the public manifest schema aligned with source provenance metadata", () => {
    const schema = readPublicJson<{
      required: string[];
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

    expect(schema.required).toEqual(expect.arrayContaining(["schemaVersion", "licenseMode", "sources"]));
    expect(schema.properties.assets.items.required).toEqual(
      expect.arrayContaining([
        "commercialUseStatus",
        "sourceUrl",
        "licenseUrl",
        "modifiedFrom",
        "sourceId",
        "requiresAttribution",
        "commercialUseAllowed",
        "shareAlike",
        "modificationAllowed",
      ]),
    );
    expect(schema.properties.assets.items.properties.commercialUseStatus.enum).toEqual(
      expect.arrayContaining(["allowed", "allowed-with-attribution", "restricted", "unknown"]),
    );
  });

  it("validates starter manifests against the public schema", () => {
    const schema = readPublicJson<unknown>("/assets/metaview-kits/manifest.schema.json");
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    for (const manifestPath of [
      "/assets/metaview-kits/biology-basic/manifest.json",
      "/assets/metaview-kits/chemistry-basic/manifest.json",
      "/assets/metaview-kits/core-visual-basic/manifest.json",
      "/assets/metaview-kits/algorithm-code-basic/manifest.json",
      "/assets/metaview-kits/geography-basic/manifest.json",
      "/assets/metaview-kits/geography-earth-basic/manifest.json",
      "/assets/metaview-kits/math-basic/manifest.json",
      "/assets/metaview-kits/physics-basic/manifest.json",
    ]) {
      const manifest = readPublicJson<unknown>(manifestPath);
      expect(validate(manifest), ajv.errorsText(validate.errors)).toBe(true);
    }
  });

  it("ships second-pass internal SVG quality markers for subject assets", () => {
    expect(readPublicAsset("/assets/metaview-kits/biology-basic/icons/cell-outline.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/biology-basic/icons/nucleus.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/biology-basic/icons/mitochondrion.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/biology-basic/icons/replication-fork.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/chemistry-basic/symbols/atom-core.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/chemistry-basic/symbols/bond-line.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/chemistry-basic/symbols/reaction-arrow.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/chemistry-basic/symbols/electron-flow.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/chemistry-basic/molecule-presets/water.json")).toContain(
      '"source": "structured-preset"',
    );
    expect(readPublicAsset("/assets/metaview-kits/chemistry-basic/molecule-presets/methane.json")).toContain(
      '"smiles": "C"',
    );
    expect(readPublicAsset("/assets/metaview-kits/chemistry-basic/smiles/glucose.smi")).toContain(
      "OC[C@H]1O",
    );
    expect(readPublicAsset("/assets/metaview-kits/core-visual-basic/arrows/flow-arrow.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/core-visual-basic/labels/callout-label.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/core-visual-basic/particles/moisture-particles.json")).toContain(
      '"source": "structured-preset"',
    );
    expect(readPublicAsset("/assets/metaview-kits/algorithm-code-basic/graph/graph-node.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/algorithm-code-basic/graph/queue-frame.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/math-basic/plot-presets/derivative-tangent.json")).toContain(
      '"source": "structured-preset"',
    );
    expect(readPublicAsset("/assets/metaview-kits/geography-basic/east-asia-map-placeholder.svg")).toContain(
      'data-asset-quality="v2"',
    );
    expect(readPublicAsset("/assets/metaview-kits/physics-basic/projectile-body-dot.svg")).toContain(
      'data-asset-quality="v2"',
    );
    expect(readPublicAsset("/assets/metaview-kits/physics-basic/block-body.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/physics-basic/ramp-surface.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/physics-basic/spring.svg")).toContain(
      'data-asset-quality="v1"',
    );
    expect(readPublicAsset("/assets/metaview-kits/physics-basic/pulley.svg")).toContain(
      'data-asset-quality="v1"',
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
    const asset = getAssetPack("geography-earth-basic")?.assets.find((item) =>
      item.semanticRoles.includes("map_layer"),
    );

    expect(asset).toMatchObject({
      license: "public-domain",
      type: "geojson",
      attribution: "Natural Earth public domain map data; simplified for MetaView East Asia map rendering",
      commercialUseStatus: "allowed",
      sourceUrl: "https://github.com/nvkelso/natural-earth-vector",
      licenseUrl: "https://www.naturalearthdata.com/about/terms-of-use/",
      modifiedFrom: "Natural Earth 1:110m Admin 0 Countries, selected East Asia and Western Pacific features",
    });

    const geojson = readPublicJson<{ type: string; features: unknown[] }>(asset?.path ?? "");
    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features.length).toBeGreaterThan(3);
  });
});
