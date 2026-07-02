import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { MetaStep, Molecule2DSceneSnapshot } from "../types";
import type { RendererProps } from "./types";
import { Molecule2DSceneRenderer } from "./Molecule2DSceneRenderer";

function waterSnapshot(extra: Partial<Molecule2DSceneSnapshot> = {}): Molecule2DSceneSnapshot {
  return {
    kind: "molecule_2d_scene",
    pack_id: "chemistry-basic",
    molecule_id: "water",
    molecule_asset_id: "water-molecule-preset",
    atoms: [
      { id: "o", element: "O", x: 50, y: 42, asset_id: "atom-core" },
      { id: "h1", element: "H", x: 35, y: 62, asset_id: "atom-core" },
      { id: "h2", element: "H", x: 65, y: 62, asset_id: "atom-core" },
    ],
    bonds: [
      { id: "oh1", from: "o", to: "h1", order: 1, asset_id: "bond-line" },
      { id: "oh2", from: "o", to: "h2", order: 1, asset_id: "bond-line" },
    ],
    callouts: [{ id: "polar-callout", target_id: "o", label: "partial negative", side: "top" }],
    formula_latex: "H_2O",
    caption: "Water is a bent polar molecule.",
    ...extra,
  };
}

function step(snapshot: Molecule2DSceneSnapshot): MetaStep<Molecule2DSceneSnapshot> {
  return {
    step_id: "molecule_2d_water",
    end_frame: 90,
    title: "Water molecule",
    voiceover_text: snapshot.caption ?? "",
    snapshot,
    tokens: [],
  };
}

function props(snapshot: Molecule2DSceneSnapshot): RendererProps {
  return {
    step: step(snapshot),
    prevStep: null,
    frame: 90,
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "light",
    domain: "chemistry",
  };
}

describe("Molecule2DSceneRenderer", () => {
  it("statically renders water from structured chemistry assets", () => {
    const markup = renderToStaticMarkup(<Molecule2DSceneRenderer {...props(waterSnapshot())} />);

    expect(markup).toContain("molecule-2d-scene");
    expect(markup).toContain('data-molecule-id="water"');
    expect(markup).toContain('data-asset-id="water-molecule-preset"');
    expect(markup).toContain('data-structured-molecule="true"');
    expect(markup).toContain('data-asset-id="atom-core"');
    expect(markup).toContain('data-asset-id="bond-line"');
    expect(markup).toContain('data-asset-id="core-light-lab-grid"');
    expect(markup).toContain('data-asset-id="core-callout-label"');
    expect(markup).toContain('data-asset-id="core-formula-tag"');
    expect(markup).toContain('data-element="O"');
    expect(markup).toContain('data-element="H"');
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("resolves atom and bond assets by semantic role when asset_id is absent", () => {
    const markup = renderToStaticMarkup(
      <Molecule2DSceneRenderer
        {...props(
          waterSnapshot({
            atoms: [
              { id: "o", element: "O", x: 50, y: 42 },
              { id: "h1", element: "H", x: 35, y: 62 },
            ],
            bonds: [{ id: "oh1", from: "o", to: "h1", order: 1 }],
          }),
        )}
      />,
    );

    expect(markup).toContain('data-asset-id="atom-core"');
    expect(markup).toContain('data-asset-id="bond-line"');
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("does not mark a generic molecule preset when a structured molecule has no molecule asset", () => {
    const markup = renderToStaticMarkup(
      <Molecule2DSceneRenderer
        {...props(
          waterSnapshot({
            molecule_id: "carbon_dioxide",
            molecule_asset_id: undefined,
            smiles: "O=C=O",
            atoms: [
              { id: "o1", element: "O", x: 30, y: 50 },
              { id: "c", element: "C", x: 50, y: 50 },
              { id: "o2", element: "O", x: 70, y: 50 },
            ],
            bonds: [
              { id: "o1-c", from: "o1", to: "c", order: 2 },
              { id: "c-o2", from: "c", to: "o2", order: 2 },
            ],
          }),
        )}
      />,
    );

    expect(markup).toContain('data-molecule-id="carbon_dioxide"');
    expect(markup).toContain('data-structured-molecule="true"');
    expect(markup).toContain('data-asset-id="atom-core"');
    expect(markup).toContain('data-asset-id="bond-line"');
    expect(markup).not.toContain('data-asset-id="water-molecule-preset"');
    expect(markup).not.toContain('data-missing-asset="true"');
  });
});
