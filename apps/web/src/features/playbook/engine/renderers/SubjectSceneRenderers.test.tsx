import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PlaybookComposition } from "../composition/PlaybookComposition";
import type {
  BioCellSceneSnapshot,
  GeoMapSceneSnapshot,
  MetaStep,
  Molecule2DSceneSnapshot,
  PhysicsForceSceneSnapshot,
  PlaybookScript,
  ReactionSceneSnapshot,
} from "../types";
import type { RendererProps } from "./types";
import { BioCellSceneRenderer } from "./BioCellSceneRenderer";
import { GeoMapSceneRenderer } from "./GeoMapSceneRenderer";
import { Molecule2DSceneRenderer } from "./Molecule2DSceneRenderer";
import { PhysicsForceSceneRenderer } from "./PhysicsForceSceneRenderer";
import { ReactionSceneRenderer } from "./ReactionSceneRenderer";
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

function bioSnapshot(extra: Partial<BioCellSceneSnapshot> = {}): BioCellSceneSnapshot {
  return {
    kind: "bio_cell_scene",
    pack_id: "biology-basic",
    cell_type: "animal",
    structures: [
      { id: "cell", semantic_role: "cell", label: "cell", x: 50, y: 52, width: 66, height: 50 },
      { id: "nucleus", semantic_role: "nucleus", label: "nucleus", x: 49, y: 50, width: 20, height: 18 },
      { id: "mitochondrion", semantic_role: "mitochondrion", label: "mitochondrion", x: 67, y: 58, width: 16, height: 10 },
    ],
    callouts: [{ id: "nucleus-callout", target_id: "nucleus", label: "stores DNA", side: "left" }],
    caption: "Animal cells contain specialized organelles.",
    ...extra,
  };
}

function moleculeSnapshot(extra: Partial<Molecule2DSceneSnapshot> = {}): Molecule2DSceneSnapshot {
  return {
    kind: "molecule_2d_scene",
    pack_id: "chemistry-basic",
    molecule_id: "water",
    molecule_asset_id: "water-molecule-preset",
    atoms: [
      { id: "o", element: "O", x: 50, y: 42 },
      { id: "h1", element: "H", x: 35, y: 62 },
      { id: "h2", element: "H", x: 65, y: 62 },
    ],
    bonds: [
      { id: "oh1", from: "o", to: "h1", order: 1 },
      { id: "oh2", from: "o", to: "h2", order: 1 },
    ],
    formula_latex: "H_2O",
    caption: "Water is a bent polar molecule.",
    ...extra,
  };
}

function reactionSnapshot(extra: Partial<ReactionSceneSnapshot> = {}): ReactionSceneSnapshot {
  return {
    kind: "reaction_scene",
    pack_id: "chemistry-basic",
    reaction_id: "reaction_synthesis_water",
    reactants: [
      { id: "h2", formula_latex: "H_2", label: "hydrogen", coefficient: 2, x: 18, y: 48 },
      { id: "o2", formula_latex: "O_2", label: "oxygen", coefficient: 1, x: 38, y: 48 },
    ],
    products: [
      { id: "h2o", formula_latex: "H_2O", label: "water", coefficient: 2, x: 78, y: 48 },
    ],
    arrows: [
      { id: "main-arrow", semantic_role: "reaction_arrow", from: [48, 48], to: [66, 48], asset_id: "reaction-arrow" },
    ],
    electron_flows: [
      { id: "electron-shift", semantic_role: "electron_flow", from: [39, 38], to: [58, 36], asset_id: "electron-flow" },
    ],
    formula_latex: "2H_2 + O_2 \\rightarrow 2H_2O",
    caption: "A balanced reaction conserves atoms.",
    ...extra,
  };
}

type SubjectSnapshot =
  | BioCellSceneSnapshot
  | GeoMapSceneSnapshot
  | Molecule2DSceneSnapshot
  | PhysicsForceSceneSnapshot
  | ReactionSceneSnapshot;

function step(snapshot: SubjectSnapshot): MetaStep {
  return {
    step_id: "s1",
    end_frame: 90,
    title:
      snapshot.kind === "geo_map_scene"
        ? "东亚季风"
        : snapshot.kind === "bio_cell_scene"
          ? "细胞结构"
          : snapshot.kind === "molecule_2d_scene"
            ? "水分子"
            : snapshot.kind === "reaction_scene"
              ? "合成水反应"
              : "平抛运动",
    voiceover_text: snapshot.caption ?? "",
    snapshot,
    tokens: [],
  };
}

function props(snapshot: SubjectSnapshot): RendererProps {
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

function script(snapshot: SubjectSnapshot): PlaybookScript {
  return {
    fps: 30,
    total_frames: 90,
    domain:
      snapshot.kind === "geo_map_scene"
        ? "geography"
        : snapshot.kind === "bio_cell_scene"
          ? "biology"
          : snapshot.kind === "molecule_2d_scene"
            ? "chemistry"
            : snapshot.kind === "reaction_scene"
              ? "chemistry"
              : "physics",
    title:
      snapshot.kind === "geo_map_scene"
        ? "东亚季风"
        : snapshot.kind === "bio_cell_scene"
          ? "细胞结构"
          : snapshot.kind === "molecule_2d_scene"
            ? "水分子"
            : snapshot.kind === "reaction_scene"
              ? "合成水反应"
              : "平抛运动",
    summary: "subject fixture",
    parameter_controls: [],
    steps: [step(snapshot)],
  };
}

describe("subject scene renderers", () => {
  it("registers dedicated geography and physics scene renderers", () => {
    expect(rendererRegistry.get("bio_cell_scene")).toBe(BioCellSceneRenderer);
    expect(rendererRegistry.get("molecule_2d_scene")).toBe(Molecule2DSceneRenderer);
    expect(rendererRegistry.get("reaction_scene")).toBe(ReactionSceneRenderer);
    expect(rendererRegistry.get("geo_map_scene")).toBe(GeoMapSceneRenderer);
    expect(rendererRegistry.get("physics_force_scene")).toBe(PhysicsForceSceneRenderer);
  });

  it("renders biology cell structures and callouts", () => {
    const markup = renderToStaticMarkup(<BioCellSceneRenderer {...props(bioSnapshot())} />);

    expect(markup).toContain("bio-cell-scene");
    expect(markup).toContain('data-asset-id="cell-outline"');
    expect(markup).toContain('data-asset-id="nucleus"');
    expect(markup).toContain('data-semantic-role="callout"');
  });

  it("renders chemistry molecule assets and structured atom-bond data", () => {
    const markup = renderToStaticMarkup(<Molecule2DSceneRenderer {...props(moleculeSnapshot())} />);

    expect(markup).toContain("molecule-2d-scene");
    expect(markup).toContain('data-molecule-id="water"');
    expect(markup).toContain('data-asset-id="water-molecule-preset"');
    expect(markup).toContain('data-structured-molecule="true"');
    expect(markup).toContain('data-element="O"');
  });

  it("renders chemistry reaction assets and participant roles", () => {
    const markup = renderToStaticMarkup(<ReactionSceneRenderer {...props(reactionSnapshot())} />);

    expect(markup).toContain("reaction-scene");
    expect(markup).toContain('data-reaction-id="reaction_synthesis_water"');
    expect(markup).toContain('data-asset-id="reaction-arrow"');
    expect(markup).toContain('data-asset-id="electron-flow"');
    expect(markup).toContain('data-semantic-role="reactant"');
    expect(markup).toContain('data-semantic-role="product"');
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
    const bioMarkup = renderToStaticMarkup(
      <PlaybookComposition script={script(bioSnapshot())} showSubtitles={false} />,
    );
    const geoMarkup = renderToStaticMarkup(
      <PlaybookComposition script={script(geoSnapshot())} showSubtitles={false} />,
    );
    const physicsMarkup = renderToStaticMarkup(
      <PlaybookComposition script={script(physicsSnapshot())} showSubtitles={false} />,
    );
    const chemistryMarkup = renderToStaticMarkup(
      <PlaybookComposition script={script(moleculeSnapshot())} showSubtitles={false} />,
    );
    const reactionMarkup = renderToStaticMarkup(
      <PlaybookComposition script={script(reactionSnapshot())} showSubtitles={false} />,
    );

    expect(bioMarkup).toContain("bio-cell-scene");
    expect(chemistryMarkup).toContain("molecule-2d-scene");
    expect(reactionMarkup).toContain("reaction-scene");
    expect(geoMarkup).toContain("geo-map-scene");
    expect(physicsMarkup).toContain("physics-force-scene");
    expect(bioMarkup).not.toContain("Unknown snapshot kind");
    expect(chemistryMarkup).not.toContain("Unknown snapshot kind");
    expect(reactionMarkup).not.toContain("Unknown snapshot kind");
    expect(geoMarkup).not.toContain("Unknown snapshot kind");
    expect(physicsMarkup).not.toContain("Unknown snapshot kind");
  });
});
