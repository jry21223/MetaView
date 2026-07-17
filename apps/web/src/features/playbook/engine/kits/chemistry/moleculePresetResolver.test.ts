import { describe, expect, it } from "vitest";

import {
  resolveMoleculePresetBySmilesForRenderer,
  resolveMoleculePresetForRenderer,
} from "./moleculePresetResolver";

describe("moleculePresetResolver", () => {
  it("hydrates the water molecule preset from chemistry-basic structured JSON", () => {
    const preset = resolveMoleculePresetForRenderer("chemistry-basic", "water");

    expect(preset).toMatchObject({
      moleculeId: "water",
      moleculeAssetId: "water-molecule-preset",
      source: "structured-preset",
      formulaLatex: "H_2O",
      geometry: "bent",
      caption: "Water is a bent polar molecule loaded from the chemistry-basic structured preset.",
    });
    expect(preset?.atoms).toEqual([
      { id: "o", element: "O", x: 50, y: 42, label: "oxygen" },
      { id: "h1", element: "H", x: 35, y: 62, label: "hydrogen" },
      { id: "h2", element: "H", x: 65, y: 62, label: "hydrogen" },
    ]);
    expect(preset?.bonds).toEqual([
      { id: "oh1", from: "o", to: "h1", order: 1, label: "O-H bond" },
      { id: "oh2", from: "o", to: "h2", order: 1, label: "O-H bond" },
    ]);
    expect(preset?.callouts).toEqual([
      { id: "water-bent-geometry", target_id: "o", label: "bent geometry", side: "top" },
      { id: "water-polar-bond", target_id: "h2", label: "polar bonds", side: "right" },
    ]);
  });

  it("hydrates the methane molecule preset from a SMILES-addressable structured JSON asset", () => {
    const byId = resolveMoleculePresetForRenderer("chemistry-basic", "methane");
    const bySmiles = resolveMoleculePresetBySmilesForRenderer("chemistry-basic", "C");

    expect(byId).toMatchObject({
      moleculeId: "methane",
      moleculeAssetId: "methane-molecule-preset",
      source: "structured-preset",
      smiles: "C",
      formulaLatex: "CH_4",
      geometry: "tetrahedral",
      caption: "Methane is a tetrahedral molecule loaded from a SMILES-addressable structured preset.",
    });
    expect(bySmiles).toEqual(byId);
    expect(byId?.atoms).toHaveLength(5);
    expect(byId?.bonds).toHaveLength(4);
  });

  it("does not fabricate a molecule preset when the pack has no exact structured asset", () => {
    expect(resolveMoleculePresetForRenderer("chemistry-basic", "ethane")).toBeUndefined();
    expect(resolveMoleculePresetBySmilesForRenderer("chemistry-basic", "CC")).toBeUndefined();
  });
});
