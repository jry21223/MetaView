/**
 * Species library for particle views: each entry is a small rigid molecule
 * or ion in local ångström coordinates, so a beaker full of `NH3` draws the
 * same pyramidal ball-and-stick glyph the molecule panel would, and the atom
 * ledger can count exactly the atoms that are drawn.
 */

export interface SpeciesAtom {
  element: string;
  x: number;
  y: number;
  z: number;
}

export interface SpeciesDefinition {
  /** Formula markup for legends. */
  label: string;
  atoms: SpeciesAtom[];
  bonds: Array<[number, number, 1 | 2 | 3]>;
  /** Net charge of the particle, drawn as a badge. */
  charge: number;
  /** Electrons carry no atoms and are drawn as a small charged dot. */
  electron?: boolean;
}

const a = (element: string, x: number, y: number, z = 0): SpeciesAtom => ({ element, x, y, z });

const S4 = 0.86; // S–O 1.49 Å along the tetrahedral diagonals

export const CHEM_SPECIES: Readonly<Record<string, SpeciesDefinition>> = Object.freeze({
  H2: { label: "H_2", atoms: [a("H", -0.37, 0), a("H", 0.37, 0)], bonds: [[0, 1, 1]], charge: 0 },
  N2: { label: "N_2", atoms: [a("N", -0.55, 0), a("N", 0.55, 0)], bonds: [[0, 1, 3]], charge: 0 },
  NH3: {
    label: "NH_3",
    atoms: [a("N", 0, 0.1, 0), a("H", 0, -0.28, 0.95), a("H", 0.82, -0.28, -0.47), a("H", -0.82, -0.28, -0.47)],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]],
    charge: 0,
  },
  H2O: { label: "H_2O", atoms: [a("O", 0, 0.12), a("H", -0.76, -0.47), a("H", 0.76, -0.47)], bonds: [[0, 1, 1], [0, 2, 1]], charge: 0 },
  HI: { label: "HI", atoms: [a("H", -0.8, 0), a("I", 0.8, 0)], bonds: [[0, 1, 1]], charge: 0 },
  I2: { label: "I_2", atoms: [a("I", -1.33, 0), a("I", 1.33, 0)], bonds: [[0, 1, 1]], charge: 0 },
  "H+": { label: "H^+", atoms: [a("H", 0, 0)], bonds: [], charge: 1 },
  "OH-": { label: "OH^-", atoms: [a("O", -0.3, 0), a("H", 0.67, 0)], bonds: [[0, 1, 1]], charge: -1 },
  "Na+": { label: "Na^+", atoms: [a("Na", 0, 0)], bonds: [], charge: 1 },
  "Cl-": { label: "Cl^-", atoms: [a("Cl", 0, 0)], bonds: [], charge: -1 },
  "K+": { label: "K^+", atoms: [a("K", 0, 0)], bonds: [], charge: 1 },
  Zn: { label: "Zn", atoms: [a("Zn", 0, 0)], bonds: [], charge: 0 },
  "Zn2+": { label: "Zn^{2+}", atoms: [a("Zn", 0, 0)], bonds: [], charge: 2 },
  Cu: { label: "Cu", atoms: [a("Cu", 0, 0)], bonds: [], charge: 0 },
  "Cu2+": { label: "Cu^{2+}", atoms: [a("Cu", 0, 0)], bonds: [], charge: 2 },
  Fe: { label: "Fe", atoms: [a("Fe", 0, 0)], bonds: [], charge: 0 },
  "Fe2+": { label: "Fe^{2+}", atoms: [a("Fe", 0, 0)], bonds: [], charge: 2 },
  "SO4^2-": {
    label: "SO_4^{2-}",
    atoms: [a("S", 0, 0, 0), a("O", S4, S4, S4), a("O", -S4, -S4, S4), a("O", -S4, S4, -S4), a("O", S4, -S4, -S4)],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]],
    charge: -2,
  },
  "e-": { label: "e^-", atoms: [], bonds: [], charge: -1, electron: true },
});

export function speciesDefinition(species: string): SpeciesDefinition {
  const definition = CHEM_SPECIES[species];
  if (!definition) throw new Error(`Unknown chemistry species: ${species}`);
  return definition;
}

/** Element → count for one particle of `species` (isotopes are not tracked here). */
export function speciesElementCounts(species: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const atom of speciesDefinition(species).atoms) {
    counts[atom.element] = (counts[atom.element] ?? 0) + 1;
  }
  return counts;
}
