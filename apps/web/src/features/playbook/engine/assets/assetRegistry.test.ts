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
});
