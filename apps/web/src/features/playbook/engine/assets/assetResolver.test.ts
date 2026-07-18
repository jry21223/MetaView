import { describe, expect, it } from "vitest";

import {
  resolveAssetById,
  resolveAssetByRole,
  resolveAssetForRenderer,
} from "./assetResolver";

describe("assetResolver", () => {
  it("resolves an asset by pack id and asset id", () => {
    expect(resolveAssetById("physics-basic", "block-body")).toMatchObject({
      id: "block-body",
      path: "/assets/metaview-kits/physics-basic/block-body.svg",
    });
  });

  it("resolves a subject asset by semantic role", () => {
    expect(resolveAssetByRole("geography", "map_layer")).toMatchObject({
      id: "east-asia-land-110m",
    });
    expect(resolveAssetByRole("physics", "block", "physics-basic")).toMatchObject({
      id: "block-body",
    });
  });

  it("resolves assets constrained to rendererKinds", () => {
    expect(resolveAssetForRenderer("code_trace_scene", "binary_search")).toMatchObject({
      id: "binary-search-trace-preset",
    });
    expect(resolveAssetForRenderer("molecule_2d_scene", "molecule")).toMatchObject({
      id: "water-molecule-preset",
    });
    expect(resolveAssetForRenderer("bio_process_scene", "process_step")).toMatchObject({
      id: "replication-fork",
    });
    expect(resolveAssetForRenderer("math_plot", "tangent")).toMatchObject({
      id: "derivative-tangent-preset",
    });
    expect(resolveAssetForRenderer("physics_force_scene", "block")).toMatchObject({
      id: "block-body",
    });
    expect(resolveAssetForRenderer("algorithm_array", "map_layer")).toBeUndefined();
  });
});
