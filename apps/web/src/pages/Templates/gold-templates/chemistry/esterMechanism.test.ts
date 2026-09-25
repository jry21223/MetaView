import { describe, expect, it } from "vitest";

import { esterGroups, esterMass, esterStage, nextArrow, type Alcohol, type EsterStage } from "./esterMechanism";

const STAGES: EsterStage[] = [0, 1, 2, 3, 4, 5];
const ALCOHOLS: Alcohol[] = ["ethanol", "methanol"];

/** Bond-order sum each atom must reach: C 4, O 2 (+1 when O⁺), H 1 (0 when bare H⁺). */
function expectedValence(element: string, charge: number): number {
  if (element === "C") return 4;
  if (element === "O") return 2 + charge;
  return 1 - charge;
}

describe("acid-catalysed esterification mechanism", () => {
  for (const alcohol of ALCOHOLS) {
    it(`${alcohol}: keeps every atom and a total charge of +1 at every stage`, () => {
      const reference = esterStage(0, alcohol).atoms.map((atom) => `${atom.id}:${atom.element}:${atom.isotope ?? ""}`).sort();
      for (const stage of STAGES) {
        const { atoms } = esterStage(stage, alcohol);
        expect(atoms.map((atom) => `${atom.id}:${atom.element}:${atom.isotope ?? ""}`).sort()).toEqual(reference);
        expect(atoms.reduce((sum, atom) => sum + (atom.charge ?? 0), 0)).toBe(1);
      }
    });

    it(`${alcohol}: gives every atom a legal valence at every stage`, () => {
      for (const stage of STAGES) {
        const { atoms, bonds } = esterStage(stage, alcohol);
        for (const atom of atoms) {
          const order = bonds
            .filter((bond) => bond.from === atom.id || bond.to === atom.id)
            .reduce((sum, bond) => sum + bond.order, 0);
          expect(order, `stage ${stage} ${atom.id}`).toBe(expectedValence(atom.element, atom.charge ?? 0));
        }
      }
    });

    it(`${alcohol}: keeps bonded atoms at bond length and unbonded atoms apart`, () => {
      for (const stage of STAGES) {
        const { atoms, bonds } = esterStage(stage, alcohol);
        const byId = new Map(atoms.map((atom) => [atom.id, atom]));
        const distance = (a: string, b: string) => {
          const p = byId.get(a)!;
          const q = byId.get(b)!;
          return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
        };
        for (const bond of bonds) {
          const d = distance(bond.from, bond.to);
          expect(d, `stage ${stage} ${bond.id}`).toBeGreaterThan(0.9);
          expect(d, `stage ${stage} ${bond.id}`).toBeLessThan(1.6);
        }
        const bonded = new Set(bonds.flatMap((bond) => [`${bond.from}|${bond.to}`, `${bond.to}|${bond.from}`]));
        for (let i = 0; i < atoms.length; i += 1) {
          for (let j = i + 1; j < atoms.length; j += 1) {
            if (bonded.has(`${atoms[i].id}|${atoms[j].id}`)) continue;
            expect(distance(atoms[i].id, atoms[j].id), `stage ${stage} ${atoms[i].id}–${atoms[j].id}`).toBeGreaterThan(1.3);
          }
        }
      }
    });
  }

  it("moves the ¹⁸O from the alcohol into the ester and the acid's –OH oxygen into the water", () => {
    const start = esterStage(0, "ethanol");
    const end = esterStage(5, "ethanol");
    const o18 = start.atoms.find((atom) => atom.isotope === 18)!;
    expect(o18.id).toBe("O3");
    expect(start.bonds.some((bond) => bond.id === "O3-H3")).toBe(true);
    expect(end.bonds.some((bond) => bond.id === "C2-O3")).toBe(true);
    expect(end.bonds.some((bond) => bond.id === "C2-O2")).toBe(false);
    const water = esterGroups(5, "ethanol").find((group) => group.id === "water")!;
    expect(water.atom_ids.sort()).toEqual(["H2", "H3", "O2"]);
  });

  it("announces each next event with one curly arrow per moving electron pair and none after the last", () => {
    expect(STAGES.map((stage) => nextArrow(stage).length)).toEqual([1, 2, 2, 2, 1, 0]);
  });

  it("only points arrows at atoms and bonds that exist in the stage they are drawn on", () => {
    for (const stage of STAGES) {
      const { atoms, bonds } = esterStage(stage, "ethanol");
      const atomIds = new Set(atoms.map((atom) => atom.id));
      const bondIds = new Set(bonds.map((bond) => bond.id));
      for (const arrow of nextArrow(stage)) {
        for (const end of [arrow.from, arrow.to]) {
          if ("atom" in end) expect(atomIds.has(end.atom), `${arrow.id} → ${end.atom}`).toBe(true);
          else expect(bondIds.has(end.bond), `${arrow.id} → ${end.bond}`).toBe(true);
        }
      }
    }
  });

  it("weighs ethyl acetate at 88, or 90 with the label", () => {
    expect(esterMass("ethanol", false)).toBe(88);
    expect(esterMass("ethanol", true)).toBe(90);
    expect(esterMass("methanol", true)).toBe(76);
  });
});
