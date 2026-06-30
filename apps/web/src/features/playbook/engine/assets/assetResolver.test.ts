import { describe, expect, it } from "vitest";

import {
  resolveAssetById,
  resolveAssetByRole,
  resolveAssetForRenderer,
} from "./assetResolver";

describe("assetResolver", () => {
  it("resolves an asset by pack id and asset id", () => {
    expect(resolveAssetById("physics-basic", "projectile-body-dot")).toMatchObject({
      id: "projectile-body-dot",
      path: "/assets/metaview-kits/physics-basic/projectile-body-dot.svg",
    });
  });

  it("resolves a subject asset by semantic role", () => {
    expect(resolveAssetByRole("geography", "map_layer")).toMatchObject({
      id: "east-asia-map-placeholder",
    });
  });

  it("resolves assets constrained to rendererKinds", () => {
    expect(resolveAssetForRenderer("molecule_2d_scene", "molecule")).toMatchObject({
      id: "water-molecule-preset",
    });
    expect(resolveAssetForRenderer("math_plot", "tangent")).toMatchObject({
      id: "derivative-tangent-preset",
    });
    expect(resolveAssetForRenderer("geo_map_scene", "monsoon_flow")).toMatchObject({
      id: "monsoon-wind-arrow",
    });
    expect(resolveAssetForRenderer("physics_force_scene", "object")).toMatchObject({
      id: "projectile-body-dot",
    });
    expect(resolveAssetForRenderer("algorithm_array", "map_layer")).toBeUndefined();
  });
});
