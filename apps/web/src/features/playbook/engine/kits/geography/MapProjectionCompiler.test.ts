import { describe, expect, it } from "vitest";

import { getAssetPack } from "../../assets/assetRegistry";
import { resolveGeoJsonAssetData } from "../../assets/assetGeoJson";
import { compileGeoJsonToSvgPaths } from "./MapProjectionCompiler";

describe("MapProjectionCompiler", () => {
  it("compiles Natural Earth East Asia GeoJSON into deterministic SVG paths", () => {
    const asset = getAssetPack("geography-earth-basic")?.assets.find((item) => item.id === "east-asia-land-110m");
    const eastAsiaLand = resolveGeoJsonAssetData(asset);

    expect(eastAsiaLand).toBeDefined();
    if (!eastAsiaLand) throw new Error("Expected geography-earth-basic land GeoJSON asset to resolve.");
    const compiled = compileGeoJsonToSvgPaths(eastAsiaLand, {
      viewport: { x: 8, y: 21, width: 84, height: 58 },
      className: "land",
      precision: 3,
    });

    expect(compiled.paths.length).toBeGreaterThan(3);
    expect(compiled.paths[0]).toMatchObject({
      className: "land",
      sourceName: expect.any(String),
    });
    expect(compiled.paths[0].d).toMatch(/^M/);
    expect(compiled.paths.map((path) => path.d).join(" ")).toContain("Z");
  });
});
