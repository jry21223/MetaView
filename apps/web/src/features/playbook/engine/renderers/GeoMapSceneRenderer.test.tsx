import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { GeoMapSceneSnapshot, MetaStep } from "../types";
import type { RendererProps } from "./types";
import { GeoMapSceneRenderer } from "./GeoMapSceneRenderer";

function eastAsiaMonsoonSnapshot(extra: Partial<GeoMapSceneSnapshot> = {}): GeoMapSceneSnapshot {
  return {
    kind: "geo_map_scene",
    pack_id: "geography-earth-basic",
    map_region: "east_asia",
    layers: [
      { id: "map", semantic_role: "map_layer", label: "东亚底图", asset_id: "east-asia-land-110m" },
      { id: "land", semantic_role: "land", label: "亚洲大陆" },
      { id: "coastline", semantic_role: "coastline", label: "海岸线", asset_id: "east-asia-coastline-110m" },
      { id: "ocean", semantic_role: "ocean", label: "太平洋" },
    ],
    flows: [
      {
        id: "summer-monsoon",
        semantic_role: "monsoon_flow",
        from: [78, 68],
        to: [42, 38],
        label: "夏季风",
        strength: 1.1,
      },
    ],
    pressure_centers: [
      { id: "land-low", kind: "low", x: 38, y: 35, label: "陆地低压" },
      { id: "ocean-high", kind: "high", x: 46, y: 40, label: "海洋高压" },
    ],
    particle_preset: "moisture_particles",
    caption: "海陆热力差异反转风向。",
    ...extra,
  };
}

function step(snapshot: GeoMapSceneSnapshot): MetaStep<GeoMapSceneSnapshot> {
  return {
    step_id: "east_asia_monsoon",
    end_frame: 90,
    title: "东亚季风",
    voiceover_text: snapshot.caption ?? "",
    snapshot,
    tokens: [],
  };
}

function props(snapshot: GeoMapSceneSnapshot): RendererProps {
  return {
    step: step(snapshot),
    prevStep: null,
    frame: 90,
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "light",
    domain: "geography",
  };
}

describe("GeoMapSceneRenderer", () => {
  it("statically renders east_asia_monsoon with the geography map asset", () => {
    const markup = renderToStaticMarkup(<GeoMapSceneRenderer {...props(eastAsiaMonsoonSnapshot())} />);

    expect(markup).toContain("geo-map-scene");
    expect(markup).toContain('data-asset-id="east-asia-land-110m"');
    expect(markup).toContain(
      'data-asset-path="/assets/metaview-kits/geography-earth-basic/natural-earth/east-asia-land-110m.json"',
    );
    expect(markup).toContain('data-natural-earth-layer="admin_0_countries"');
    expect(markup).toContain('data-map-path-class="land"');
    expect(markup).toContain("<path");
    expect(markup).toContain('data-semantic-role="monsoon_flow"');
    expect(markup).toContain('data-asset-id="east-asia-coastline-110m"');
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("resolves the geography map asset by semantic role when layer asset_id is absent", () => {
    const snapshot = eastAsiaMonsoonSnapshot({
      layers: [
        { id: "map", semantic_role: "map_layer", label: "东亚底图" },
        { id: "land", semantic_role: "land", label: "亚洲大陆" },
        { id: "ocean", semantic_role: "ocean", label: "太平洋" },
      ],
      flows: [
        {
          id: "summer-monsoon",
          semantic_role: "monsoon_flow",
          from: [78, 68],
          to: [42, 38],
          label: "夏季风",
          strength: 1.1,
        },
      ],
    });
    const markup = renderToStaticMarkup(<GeoMapSceneRenderer {...props(snapshot)} />);

    expect(markup).toContain('data-asset-id="east-asia-land-110m"');
    expect(markup).toContain('data-semantic-role="monsoon_flow"');
    expect(markup).not.toContain('data-missing-asset="true"');
  });
});
