import { describe, expect, it } from "vitest";

import { atomConservationBreaches } from "./atomLedger";
import type { ChemistrySceneSnapshot, ChemParticle } from "./sceneTypes";

const RECT = { x: 0, y: 0, w: 200, h: 200 };

function flask(particles: ChemParticle[], inflow?: Record<string, number>): ChemistrySceneSnapshot {
  return {
    kind: "chemistry_scene",
    scene_id: "ledger",
    panels: [{ type: "particles", id: "flask", rect: RECT, system_id: "flask", particles, inflow }],
  };
}

const p = (id: string, species: string): ChemParticle => ({ id, species, x: 0.5, y: 0.5 });

describe("atom ledger", () => {
  it("accepts H⁺ + OH⁻ → H₂O once the added hydroxide is declared", () => {
    const steps = [
      { step_id: "acid", snapshot: flask([p("h1", "H+"), p("cl1", "Cl-")]) },
      {
        step_id: "neutral",
        snapshot: flask([{ ...p("w1", "H2O"), from: ["h1", "oh1"] }, p("cl1", "Cl-"), p("na1", "Na+")], { Na: 1, O: 1, H: 1 }),
      },
    ];
    expect(atomConservationBreaches(steps)).toEqual([]);
  });

  it("reports an atom that vanished without a declared outflow", () => {
    const steps = [
      { step_id: "before", snapshot: flask([p("h1", "H2"), p("h2", "H2")]) },
      { step_id: "after", snapshot: flask([p("h1", "H2")]) },
    ];
    expect(atomConservationBreaches(steps)).toEqual([
      { stepId: "after", systemId: "flask", element: "H", expected: 4, actual: 2 },
    ]);
  });

  it("tracks an isotope label as its own element", () => {
    const molecule = (isotope: number | null): ChemistrySceneSnapshot => ({
      kind: "chemistry_scene",
      scene_id: "ester",
      panels: [{
        type: "molecules",
        id: "mech",
        rect: RECT,
        system_id: "mech",
        scale: 40,
        atoms: [{ id: "o", element: "O", isotope, x: 0, y: 0, z: 0 }],
        bonds: [],
      }],
    });
    const breaches = atomConservationBreaches([
      { step_id: "labelled", snapshot: molecule(18) },
      { step_id: "lost", snapshot: molecule(null) },
    ]);
    expect(breaches.map((breach) => breach.element).sort()).toEqual(["18O", "O"]);
  });
});
