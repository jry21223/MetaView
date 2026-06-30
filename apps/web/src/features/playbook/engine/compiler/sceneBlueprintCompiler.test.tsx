import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { visualQualityGate } from "../assets/visualQualityGate";
import { PlaybookComposition } from "../composition/PlaybookComposition";
import {
  compileSceneBlueprint,
  compileSceneBlueprintToPlaybookScript,
  type SceneBlueprint,
} from "./sceneBlueprintCompiler";

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ fps: 30 }),
  };
});

describe("sceneBlueprintCompiler", () => {
  it("compiles a minimal East Asia monsoon blueprint into an asset-backed geo map scene", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      id: "east_asia_monsoon_blueprint",
      subject: "geography",
      sceneType: "east_asia_monsoon",
      title: "East Asia monsoon",
      visualIntent: ["seasonal_wind_reversal", "land_sea_thermal_contrast"],
      emphasisPoints: ["land low", "ocean high", "moisture transport"],
    });

    expect(script.domain).toBe("geography");
    expect(script.steps).toHaveLength(1);
    expect(script.steps[0].snapshot).toMatchObject({
      kind: "geo_map_scene",
      pack_id: "geography-earth-basic",
      map_region: "east_asia",
      particle_preset: "moisture_particles",
    });

    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "geo_map_scene") {
      throw new Error(`Expected geo_map_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.layers.find((layer) => layer.semantic_role === "map_layer")).toMatchObject({
      asset_id: "east-asia-land-110m",
    });
    expect(snapshot.flows[0]).toMatchObject({
      semantic_role: "monsoon_flow",
      asset_id: "monsoon-wind-arrow",
    });
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);
    expect(markup).toContain("geo-map-scene");
    expect(markup).toContain('data-asset-id="east-asia-land-110m"');
    expect(markup).toContain('data-asset-id="monsoon-wind-arrow"');
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("compiles a minimal projectile blueprint into an asset-backed physics force scene", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      id: "projectile_motion_blueprint",
      subject: "physics",
      sceneType: "projectile_motion",
      title: "Projectile motion",
      visualIntent: ["projectile_motion", "velocity_decomposition", "gravity_acceleration"],
      emphasisPoints: ["vx constant", "vy increases", "g downward"],
    });

    expect(script.domain).toBe("physics");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "physics_force_scene") {
      throw new Error(`Expected physics_force_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("physics-basic");
    expect(snapshot.objects[0]).toMatchObject({
      id: "body",
      asset_id: "projectile-body-dot",
    });
    expect(snapshot.trajectory?.length).toBeGreaterThanOrEqual(4);
    expect(snapshot.vectors.map((vector) => vector.semantic_role)).toEqual(
      expect.arrayContaining(["velocity", "acceleration", "force"]),
    );
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);
    expect(markup).toContain("physics-force-scene");
    expect(markup).toContain('data-asset-id="projectile-body-dot"');
    expect(markup).toContain('data-semantic-role="motion_trail"');
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("reports quality warnings when a blueprint pins an unresolved asset id", () => {
    const result = compileSceneBlueprint({
      subject: "physics",
      sceneType: "projectile_motion",
      title: "Projectile missing asset",
      visualIntent: ["projectile_motion"],
      object: {
        semanticRole: "projectile",
        assetId: "missing-projectile-asset",
      },
    });

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_asset",
          asset_id: "missing-projectile-asset",
          snapshot_kind: "physics_force_scene",
        }),
      ]),
    );

    const markup = renderToStaticMarkup(<PlaybookComposition script={result.playbookScript} showSubtitles={false} />);
    expect(markup).toContain('data-missing-asset="true"');
    expect(markup).toContain('data-asset-id="missing-projectile-asset"');
  });

  it("ignores raw SVG path hints so blueprint input stays an intent contract", () => {
    const blueprint = {
      subject: "geography",
      sceneType: "geo_map_scene",
      title: "Raw path should not leak",
      visualIntent: ["seasonal_wind_reversal"],
      rawSvgPath: "M 0 0 L 100 100",
    } satisfies SceneBlueprint & { rawSvgPath: string };

    const script = compileSceneBlueprintToPlaybookScript(blueprint);

    expect(JSON.stringify(script)).not.toContain("M 0 0 L 100 100");
    expect(script.steps[0].snapshot.kind).toBe("geo_map_scene");
  });

  it("compiles a cell structure blueprint into an asset-backed biology scene", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "biology",
      sceneType: "cell_structure",
      title: "Cell structure",
      visualIntent: ["show_cell_structure", "label_core_organelles"],
      emphasisPoints: ["nucleus", "mitochondrion", "cell membrane"],
    });

    expect(script.domain).toBe("biology");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "bio_cell_scene") {
      throw new Error(`Expected bio_cell_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("biology-basic");
    expect(snapshot.structures.map((structure) => structure.asset_id)).toEqual(
      expect.arrayContaining(["cell-outline", "nucleus", "mitochondrion"]),
    );
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);
    expect(markup).toContain("bio-cell-scene");
    expect(markup).toContain('data-asset-id="cell-outline"');
    expect(markup).toContain('data-asset-id="nucleus"');
    expect(markup).toContain('data-semantic-role="callout"');
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("compiles a water molecule blueprint into a structured chemistry scene", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "chemistry",
      sceneType: "molecule_2d_water",
      title: "Water molecule",
      visualIntent: ["render_structured_molecule", "show_polar_bonds"],
      emphasisPoints: ["oxygen", "hydrogen", "bent geometry"],
    });

    expect(script.domain).toBe("chemistry");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "molecule_2d_scene") {
      throw new Error(`Expected molecule_2d_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("chemistry-basic");
    expect(snapshot.molecule_asset_id).toBe("water-molecule-preset");
    expect(snapshot.atoms.map((atom) => atom.asset_id)).toEqual(
      expect.arrayContaining(["atom-core"]),
    );
    expect(snapshot.bonds.map((bond) => bond.asset_id)).toEqual(
      expect.arrayContaining(["bond-line"]),
    );
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);
    expect(markup).toContain("molecule-2d-scene");
    expect(markup).toContain('data-structured-molecule="true"');
    expect(markup).toContain('data-asset-id="water-molecule-preset"');
    expect(markup).toContain('data-element="O"');
    expect(markup).toContain('data-element="H"');
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("compiles a derivative tangent blueprint into a math plot scene", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "math",
      sceneType: "derivative_tangent",
      title: "Derivative tangent",
      visualIntent: ["show_function_curve", "highlight_tangent_slope"],
      emphasisPoints: ["formula", "curve", "tangent"],
    });

    expect(script.domain).toBe("math");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "math_plot") {
      throw new Error(`Expected math_plot, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("math-basic");
    expect(snapshot.asset_id).toBe("derivative-tangent-preset");
    expect(snapshot.curves.map((curve) => curve.semantic_role)).toEqual(
      expect.arrayContaining(["curve", "tangent"]),
    );
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);
    expect(markup).toContain("math-plot-renderer");
    expect(markup).toContain('data-plot-asset-id="derivative-tangent-preset"');
    expect(markup).toContain('data-semantic-role="tangent"');
  });

  it("compiles a BFS blueprint into a graph scene with algorithm state", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "algorithm",
      sceneType: "bfs_graph",
      title: "BFS graph",
      visualIntent: ["show_graph_traversal", "show_queue_state", "highlight_active_edge"],
      emphasisPoints: ["current node", "queue", "visited set"],
    });

    expect(script.domain).toBe("algorithm");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "graph_scene") {
      throw new Error(`Expected graph_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("algorithm-code-basic");
    expect(snapshot.asset_id).toBe("bfs-graph-preset");
    expect(snapshot.current_node_id).toBe("A");
    expect(snapshot.queue_node_ids).toEqual(["B", "C"]);
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showInlineCode={true} showSubtitles={false} />);
    expect(markup).toContain("graph-scene-renderer");
    expect(markup).toContain('data-graph-asset-id="bfs-graph-preset"');
    expect(markup).toContain('data-node-state="current"');
    expect(markup).toContain('data-node-state="queue"');
    expect(markup).toContain('data-edge-state="active"');
  });
});
