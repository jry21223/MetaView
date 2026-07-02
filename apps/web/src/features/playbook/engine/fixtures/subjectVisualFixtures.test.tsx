import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { compileSceneBlueprintToPlaybookScript } from "../compiler/sceneBlueprintCompiler";
import { PlaybookComposition } from "../composition/PlaybookComposition";
import { SUBJECT_VISUAL_BLUEPRINT_IDS, getSubjectVisualBlueprint } from "./subjectVisualBlueprints";
import { getSubjectVisualFixture } from "./subjectVisualFixtures";

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ fps: 30 }),
  };
});

const FIXTURE_IDS = [...SUBJECT_VISUAL_BLUEPRINT_IDS];

describe("subject visual fixtures", () => {
  it("keeps flagship fixtures tied to their source SceneBlueprint", () => {
    for (const fixtureId of FIXTURE_IDS) {
      const script = getSubjectVisualFixture(fixtureId);
      const blueprint = getSubjectVisualBlueprint(fixtureId);

      expect(script.algorithm_id, fixtureId).toBe(blueprint.sceneType);
      expect(script.initial_data?.scene_blueprint, fixtureId).toEqual([blueprint.sceneType]);
      expect(script, fixtureId).toEqual(compileSceneBlueprintToPlaybookScript(blueprint));
    }
  });

  it("statically renders bfs_graph through PlaybookComposition with graph and code tracks", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition
        script={getSubjectVisualFixture("bfs_graph")}
        showInlineCode={true}
        showSubtitles={false}
      />,
    );

    expect(markup).toContain("graph-scene-renderer");
    expect(markup).toContain('data-pack-id="algorithm-code-basic"');
    expect(markup).toContain('data-graph-asset-id="bfs-graph-preset"');
    expect(markup).toContain('data-node-state="current"');
    expect(markup).toContain('data-node-state="visited"');
    expect(markup).toContain('data-node-state="queue"');
    expect(markup).toContain('data-edge-state="active"');
    expect(markup).toContain("BFS");
    expect(markup).toContain("queue");
    expect(markup).not.toContain("Unknown snapshot kind");
  });

  it("statically renders recursion_stack through PlaybookComposition with call stack assets", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition
        script={getSubjectVisualFixture("recursion_stack")}
        showInlineCode={true}
        showSubtitles={false}
      />,
    );

    expect(markup).toContain("call-stack-scene");
    expect(markup).toContain('data-pack-id="algorithm-code-basic"');
    expect(markup).toContain('data-stack-asset-id="recursion-stack-preset"');
    expect(markup).toContain('data-asset-id="call-frame"');
    expect(markup).toContain('data-asset-id="stack-frame"');
    expect(markup).toContain('data-asset-id="active-line"');
    expect(markup).toContain('data-asset-id="core-timeline-arrow"');
    expect(markup).toContain('data-frame-state="active"');
    expect(markup).toContain("factorial(4)");
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("statically renders binary_search through PlaybookComposition with code trace assets", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition
        script={getSubjectVisualFixture("binary_search")}
        showInlineCode={true}
        showSubtitles={false}
      />,
    );

    expect(markup).toContain("code-trace-scene");
    expect(markup).toContain('data-pack-id="algorithm-code-basic"');
    expect(markup).toContain('data-trace-asset-id="binary-search-trace-preset"');
    expect(markup).toContain('data-asset-id="core-flow-arrow"');
    expect(markup).toContain('data-asset-id="active-line"');
    expect(markup).toContain('data-asset-id="pointer-marker"');
    expect(markup).toContain('data-pointer-id="mid"');
    expect(markup).toContain('data-array-cell-state="active"');
    expect(markup).toContain("binarySearch");
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("statically renders derivative_tangent through PlaybookComposition", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={getSubjectVisualFixture("derivative_tangent")} showSubtitles={false} />,
    );

    expect(markup).toContain("math-plot-renderer");
    expect(markup).toContain('data-pack-id="math-basic"');
    expect(markup).toContain('data-plot-asset-id="derivative-tangent-preset"');
    expect(markup).toContain('data-semantic-role="tangent"');
    expect(markup).toContain('data-semantic-role="formula"');
    expect(markup).toContain("(1, 1)");
    expect(markup).not.toContain("Unknown snapshot kind");
  });

  it("statically renders molecule_2d_water through PlaybookComposition", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={getSubjectVisualFixture("molecule_2d_water")} showSubtitles={false} />,
    );

    expect(markup).toContain("molecule-2d-scene");
    expect(markup).toContain('data-molecule-id="water"');
    expect(markup).toContain('data-asset-id="water-molecule-preset"');
    expect(markup).toContain('data-structured-molecule="true"');
    expect(markup).toContain('data-element="O"');
    expect(markup).toContain('data-element="H"');
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("statically renders molecule_2d_methane through PlaybookComposition", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={getSubjectVisualFixture("molecule_2d_methane")} showSubtitles={false} />,
    );

    expect(markup).toContain("molecule-2d-scene");
    expect(markup).toContain('data-molecule-id="methane"');
    expect(markup).toContain('data-smiles="C"');
    expect(markup).toContain('data-asset-id="methane-molecule-preset"');
    expect(markup).toContain('data-element="C"');
    expect(markup).toContain('data-element="H"');
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("statically renders reaction_synthesis_water through PlaybookComposition", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={getSubjectVisualFixture("reaction_synthesis_water")} showSubtitles={false} />,
    );

    expect(markup).toContain("reaction-scene");
    expect(markup).toContain('data-reaction-id="reaction_synthesis_water"');
    expect(markup).toContain('data-asset-id="reaction-arrow"');
    expect(markup).toContain('data-asset-id="electron-flow"');
    expect(markup).toContain('data-semantic-role="reactant"');
    expect(markup).toContain('data-semantic-role="product"');
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("statically renders cell_structure through PlaybookComposition", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={getSubjectVisualFixture("cell_structure")} showSubtitles={false} />,
    );

    expect(markup).toContain("bio-cell-scene");
    expect(markup).toContain('data-asset-id="cell-outline"');
    expect(markup).toContain('data-asset-id="nucleus"');
    expect(markup).toContain('data-asset-id="mitochondrion"');
    expect(markup).toContain('data-semantic-role="callout"');
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("statically renders dna_replication through PlaybookComposition", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={getSubjectVisualFixture("dna_replication")} showSubtitles={false} />,
    );

    expect(markup).toContain("bio-process-scene");
    expect(markup).toContain('data-process-id="dna_replication"');
    expect(markup).toContain('data-asset-id="dna-helix"');
    expect(markup).toContain('data-asset-id="replication-fork"');
    expect(markup).toContain('data-asset-id="core-flow-arrow"');
    expect(markup).toContain('data-semantic-role="callout"');
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("statically renders east_asia_monsoon through PlaybookComposition", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={getSubjectVisualFixture("east_asia_monsoon")} showSubtitles={false} />,
    );

    expect(markup).toContain("geo-map-scene");
    expect(markup).toContain('data-asset-id="east-asia-land-110m"');
    expect(markup).toContain('data-natural-earth-layer="admin_0_countries"');
    expect(markup).toContain('data-map-path-class="land"');
    expect(markup).toContain('data-asset-id="monsoon-wind-arrow"');
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("statically renders projectile_motion through PlaybookComposition", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={getSubjectVisualFixture("projectile_motion")} showSubtitles={false} />,
    );

    expect(markup).toContain("physics-force-scene");
    expect(markup).toContain('data-asset-id="projectile-body-dot"');
    expect(markup).toContain('data-asset-id="force-vector-arrow"');
    expect(markup).toContain('data-semantic-role="motion_trail"');
    expect(markup).toContain('data-semantic-role="formula_card"');
    expect(markup).toContain('data-vector-component="vertical"');
    expect(markup).toContain("v_y");
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });
});
