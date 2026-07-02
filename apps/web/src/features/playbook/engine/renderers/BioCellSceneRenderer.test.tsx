import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { BioCellSceneSnapshot, MetaStep } from "../types";
import type { RendererProps } from "./types";
import { BioCellSceneRenderer } from "./BioCellSceneRenderer";

function cellStructureSnapshot(extra: Partial<BioCellSceneSnapshot> = {}): BioCellSceneSnapshot {
  return {
    kind: "bio_cell_scene",
    pack_id: "biology-basic",
    cell_type: "animal",
    structures: [
      { id: "cell", semantic_role: "cell", label: "cell", x: 50, y: 52, width: 66, height: 50, asset_id: "cell-outline" },
      { id: "nucleus", semantic_role: "nucleus", label: "nucleus", x: 49, y: 50, width: 20, height: 18, asset_id: "nucleus" },
      {
        id: "mitochondrion",
        semantic_role: "mitochondrion",
        label: "mitochondrion",
        x: 67,
        y: 58,
        width: 16,
        height: 10,
        asset_id: "mitochondrion",
      },
    ],
    callouts: [
      { id: "nucleus-callout", target_id: "nucleus", label: "stores DNA", side: "left" },
      { id: "mitochondrion-callout", target_id: "mitochondrion", label: "releases energy", side: "right" },
    ],
    caption: "Animal cells contain specialized organelles with distinct functions.",
    ...extra,
  };
}

function step(snapshot: BioCellSceneSnapshot): MetaStep<BioCellSceneSnapshot> {
  return {
    step_id: "cell_structure",
    end_frame: 90,
    title: "Cell structure",
    voiceover_text: snapshot.caption ?? "",
    snapshot,
    tokens: [],
  };
}

function props(snapshot: BioCellSceneSnapshot): RendererProps {
  return {
    step: step(snapshot),
    prevStep: null,
    frame: 90,
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "light",
    domain: "biology",
  };
}

describe("BioCellSceneRenderer", () => {
  it("statically renders cell_structure with biology assets and callouts", () => {
    const markup = renderToStaticMarkup(<BioCellSceneRenderer {...props(cellStructureSnapshot())} />);

    expect(markup).toContain("bio-cell-scene");
    expect(markup).toContain('data-cell-type="animal"');
    expect(markup).toContain('data-asset-id="cell-outline"');
    expect(markup).toContain('data-asset-id="nucleus"');
    expect(markup).toContain('data-asset-id="mitochondrion"');
    expect(markup).toContain('data-asset-id="core-light-lab-grid"');
    expect(markup).toContain('data-asset-id="core-callout-label"');
    expect(markup).toContain('data-semantic-role="callout"');
    expect(markup).toContain("stores DNA");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("resolves organelle assets by semantic role when asset_id is absent", () => {
    const markup = renderToStaticMarkup(
      <BioCellSceneRenderer
        {...props(
          cellStructureSnapshot({
            structures: [
              { id: "cell", semantic_role: "cell", label: "cell", x: 50, y: 52, width: 66, height: 50 },
              { id: "nucleus", semantic_role: "nucleus", label: "nucleus", x: 49, y: 50, width: 20, height: 18 },
            ],
          }),
        )}
      />,
    );

    expect(markup).toContain('data-asset-id="cell-outline"');
    expect(markup).toContain('data-asset-id="nucleus"');
    expect(markup).not.toContain('data-missing-asset="true"');
  });
});
