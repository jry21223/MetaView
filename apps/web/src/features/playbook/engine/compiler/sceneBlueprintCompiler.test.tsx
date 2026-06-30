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
});
