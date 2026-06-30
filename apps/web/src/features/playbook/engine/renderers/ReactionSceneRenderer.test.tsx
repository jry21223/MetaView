import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { MetaStep, ReactionSceneSnapshot } from "../types";
import type { RendererProps } from "./types";
import { ReactionSceneRenderer } from "./ReactionSceneRenderer";

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
      {
        id: "main-arrow",
        semantic_role: "reaction_arrow",
        from: [48, 48],
        to: [66, 48],
        label: "forms",
        asset_id: "reaction-arrow",
      },
    ],
    electron_flows: [
      {
        id: "electron-shift",
        semantic_role: "electron_flow",
        from: [39, 38],
        to: [58, 36],
        label: "bond rearrangement",
        asset_id: "electron-flow",
      },
    ],
    callouts: [
      { id: "balanced", target_id: "main-arrow", label: "balanced atoms", side: "top" },
    ],
    formula_latex: "2H_2 + O_2 \\rightarrow 2H_2O",
    caption: "A balanced reaction conserves each atom across reactants and products.",
    ...extra,
  };
}

function step(snapshot: ReactionSceneSnapshot): MetaStep<ReactionSceneSnapshot> {
  return {
    step_id: "reaction_synthesis_water",
    end_frame: 90,
    title: "Water synthesis reaction",
    voiceover_text: snapshot.caption ?? "",
    snapshot,
    tokens: [],
  };
}

function props(snapshot: ReactionSceneSnapshot): RendererProps {
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

describe("ReactionSceneRenderer", () => {
  it("statically renders a balanced water synthesis reaction with chemistry assets", () => {
    const markup = renderToStaticMarkup(<ReactionSceneRenderer {...props(reactionSnapshot())} />);

    expect(markup).toContain("reaction-scene");
    expect(markup).toContain('data-reaction-id="reaction_synthesis_water"');
    expect(markup).toContain('data-asset-id="reaction-arrow"');
    expect(markup).toContain('data-asset-id="electron-flow"');
    expect(markup).toContain('data-semantic-role="reactant"');
    expect(markup).toContain('data-semantic-role="product"');
    expect(markup).toContain('data-semantic-role="reaction_arrow"');
    expect(markup).toContain('data-semantic-role="electron_flow"');
    expect(markup).toContain('data-semantic-role="callout"');
    expect(markup).toContain("balanced atoms");
    expect(markup).not.toContain('data-missing-asset="true"');
  });
});
