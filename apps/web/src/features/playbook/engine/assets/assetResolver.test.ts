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
    expect(resolveAssetByRole("physics", "projectile", "physics-basic")).toMatchObject({
      id: "projectile-body-dot",
    });
  });

  it("resolves assets constrained to rendererKinds", () => {
    expect(resolveAssetForRenderer("geo_map_scene", "flow_arrow", "core-visual-basic")).toMatchObject({
      id: "core-flow-arrow",
    });
    expect(resolveAssetForRenderer("physics_force_scene", "callout", "core-visual-basic")).toMatchObject({
      id: "core-callout-label",
    });
    expect(resolveAssetForRenderer("physics_force_scene", "light_lab_grid", "core-visual-basic")).toMatchObject({
      id: "core-light-lab-grid",
    });
    expect(resolveAssetForRenderer("graph_scene", "graph_node")).toMatchObject({
      id: "graph-node",
    });
    expect(resolveAssetForRenderer("call_stack_scene", "call_frame")).toMatchObject({
      id: "call-frame",
    });
    expect(resolveAssetForRenderer("code_trace_scene", "active_line")).toMatchObject({
      id: "active-line",
    });
    expect(resolveAssetForRenderer("code_trace_scene", "binary_search")).toMatchObject({
      id: "binary-search-trace-preset",
    });
    expect(resolveAssetForRenderer("code_trace_scene", "pointer")).toMatchObject({
      id: "pointer-marker",
    });
    expect(resolveAssetForRenderer("molecule_2d_scene", "molecule")).toMatchObject({
      id: "water-molecule-preset",
    });
    expect(resolveAssetForRenderer("reaction_scene", "reaction_arrow", "chemistry-basic")).toMatchObject({
      id: "reaction-arrow",
    });
    expect(resolveAssetForRenderer("reaction_scene", "electron_flow", "chemistry-basic")).toMatchObject({
      id: "electron-flow",
    });
    expect(resolveAssetForRenderer("reaction_scene", "formula_tag", "core-visual-basic")).toMatchObject({
      id: "core-formula-tag",
    });
    expect(resolveAssetForRenderer("bio_process_scene", "process_step")).toMatchObject({
      id: "replication-fork",
    });
    expect(resolveAssetForRenderer("bio_process_scene", "flow_arrow", "core-visual-basic")).toMatchObject({
      id: "core-flow-arrow",
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
