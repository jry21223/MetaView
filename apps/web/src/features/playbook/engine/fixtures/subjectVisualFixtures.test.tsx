import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PlaybookComposition } from "../composition/PlaybookComposition";
import { getSubjectVisualFixture } from "./subjectVisualFixtures";

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ fps: 30 }),
  };
});

describe("subject visual fixtures", () => {
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
