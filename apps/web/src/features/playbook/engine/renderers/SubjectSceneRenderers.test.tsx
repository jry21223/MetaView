import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PlaybookComposition } from "../composition/PlaybookComposition";
import type {
  GeoMapSceneSnapshot,
  MetaStep,
  PhysicsForceSceneSnapshot,
  PlaybookScript,
} from "../types";
import type { RendererProps } from "./types";
import { GeoMapSceneRenderer } from "./GeoMapSceneRenderer";
import { PhysicsForceSceneRenderer } from "./PhysicsForceSceneRenderer";
import { rendererRegistry } from "./registry";

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ fps: 30 }),
  };
});

function geoSnapshot(extra: Partial<GeoMapSceneSnapshot> = {}): GeoMapSceneSnapshot {
  return {
    kind: "geo_map_scene",
    pack_id: "geography-basic",
    map_region: "east_asia",
    layers: [
      { id: "land", semantic_role: "land", label: "亚洲大陆", asset_id: "east-asia-map-placeholder" },
      { id: "ocean", semantic_role: "ocean", label: "太平洋" },
    ],
    flows: [
      {
        id: "summer-monsoon",
        semantic_role: "wind",
        from: [78, 68],
        to: [42, 38],
        label: "夏季风",
        asset_id: "monsoon-wind-arrow",
      },
    ],
    pressure_centers: [
      { id: "land-low", kind: "low", x: 38, y: 35, label: "陆地低压" },
      { id: "ocean-high", kind: "high", x: 76, y: 64, label: "海洋高压" },
    ],
    particle_preset: "moisture_particles",
    caption: "海陆热力差异反转风向。",
    ...extra,
  };
}

function physicsSnapshot(extra: Partial<PhysicsForceSceneSnapshot> = {}): PhysicsForceSceneSnapshot {
  return {
    kind: "physics_force_scene",
    pack_id: "physics-basic",
    objects: [
      { id: "body", label: "小球", x: 30, y: 42, asset_id: "projectile-body-dot" },
    ],
    vectors: [
      { id: "vx", target: "body", semantic_role: "velocity", dx: 28, dy: 0, label: "v_x" },
      { id: "g", target: "body", semantic_role: "acceleration", dx: 0, dy: 24, label: "g" },
    ],
    trajectory: [[18, 34], [32, 42], [50, 57], [72, 78]],
    formula_latex: "x=v_0t,\\quad y=\\frac12gt^2",
    caption: "水平方向匀速，竖直方向匀加速。",
    ...extra,
  };
}

function step(snapshot: GeoMapSceneSnapshot | PhysicsForceSceneSnapshot): MetaStep {
  return {
    step_id: "s1",
    end_frame: 90,
    title: snapshot.kind === "geo_map_scene" ? "东亚季风" : "平抛运动",
    voiceover_text: snapshot.caption ?? "",
    snapshot,
    tokens: [],
  };
}

function props(snapshot: GeoMapSceneSnapshot | PhysicsForceSceneSnapshot): RendererProps {
  return {
    step: step(snapshot),
    prevStep: null,
    frame: 90,
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "light",
  };
}

function script(snapshot: GeoMapSceneSnapshot | PhysicsForceSceneSnapshot): PlaybookScript {
  return {
    fps: 30,
    total_frames: 90,
    domain: snapshot.kind === "geo_map_scene" ? "geography" : "physics",
    title: snapshot.kind === "geo_map_scene" ? "东亚季风" : "平抛运动",
    summary: "subject fixture",
    parameter_controls: [],
    steps: [step(snapshot)],
  };
}

describe("subject scene renderers", () => {
  it("registers dedicated geography and physics scene renderers", () => {
    expect(rendererRegistry.get("geo_map_scene")).toBe(GeoMapSceneRenderer);
    expect(rendererRegistry.get("physics_force_scene")).toBe(PhysicsForceSceneRenderer);
  });

  it("renders geography map layers, wind flow, pressure centers, and particles", () => {
    const markup = renderToStaticMarkup(<GeoMapSceneRenderer {...props(geoSnapshot())} />);

    expect(markup).toContain("geo-map-scene");
    expect(markup).toContain('data-map-region="east_asia"');
    expect(markup).toContain('data-semantic-role="wind"');
    expect(markup).toContain("夏季风");
    expect(markup).toContain("陆地低压");
    expect(markup).toContain("moisture_particles");
  });

  it("renders physics object, vectors, trajectory, and formula overlay", () => {
    const markup = renderToStaticMarkup(<PhysicsForceSceneRenderer {...props(physicsSnapshot())} />);

    expect(markup).toContain("physics-force-scene");
    expect(markup).toContain('data-semantic-role="velocity"');
    expect(markup).toContain('data-semantic-role="acceleration"');
    expect(markup).toContain('data-object-id="body"');
    expect(markup).toContain("v_x");
    expect(markup).toContain("水平方向匀速");
  });

  it("renders both scene kinds through PlaybookComposition", () => {
    const geoMarkup = renderToStaticMarkup(
      <PlaybookComposition script={script(geoSnapshot())} showSubtitles={false} />,
    );
    const physicsMarkup = renderToStaticMarkup(
      <PlaybookComposition script={script(physicsSnapshot())} showSubtitles={false} />,
    );

    expect(geoMarkup).toContain("geo-map-scene");
    expect(physicsMarkup).toContain("physics-force-scene");
    expect(geoMarkup).not.toContain("Unknown snapshot kind");
    expect(physicsMarkup).not.toContain("Unknown snapshot kind");
  });
});
