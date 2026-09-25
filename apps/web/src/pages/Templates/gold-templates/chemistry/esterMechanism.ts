import type {
  ChemAtom,
  ChemBond,
  ChemCurvedArrow,
  ChemGroupLabel,
} from "../../../../features/playbook/engine/kits/chemistry/sceneTypes";

/**
 * Acid-catalysed esterification, CH₃COOH + R–¹⁸OH ⇌ CH₃CO¹⁸OR + H₂O, as six
 * pseudo-3D snapshots of the same 18 (ethanol) or 15 (methanol) atoms.
 *
 * The path is the textbook one (addition–elimination at the carbonyl):
 *   S0 reactants + H⁺ → S1 carbonyl O protonated → S2 alcohol O attacks C,
 *   tetrahedral intermediate → S3 proton moves to the acid's –OH → S4 C–O
 *   breaks, water leaves → S5 H⁺ leaves, catalyst regenerated.
 * Every snapshot keeps every atom and the total charge (+1, the proton), so
 * "酸脱羟基、醇脱氢" is visible atom by atom: the acid's hydroxyl oxygen
 * leaves in the water, the alcohol's ¹⁸O stays in the ester.
 *
 * Coordinates are hand-built in ångström with the reaction centre C2 at the
 * origin; heavy atoms sit near z = 0 and hydrogens take tetrahedral
 * positions, so the projection reads like a wedge/dash drawing in motion.
 */

export type EsterStage = 0 | 1 | 2 | 3 | 4 | 5;
export type Alcohol = "ethanol" | "methanol";

type V = [number, number, number];

const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V): V => mul(a, 1 / (len(a) || 1));
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dir = (degrees: number, z = 0): V => {
  const r = (degrees * Math.PI) / 180;
  return unit([Math.cos(r), Math.sin(r), z]);
};
const at = (origin: V, degrees: number, length: number, z = 0): V => add(origin, mul(dir(degrees, z), length));

const CH = 1.09;
const OH = 0.97;

/** Three tetrahedral H around `center`, opposite its single heavy neighbour. */
function methylHs(center: V, neighbor: V, twist = 0): V[] {
  const u = unit(sub(neighbor, center));
  const helper: V = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const p = unit(cross(u, helper));
  const q = cross(u, p);
  return [0, 120, 240].map((phi) => {
    const r = ((phi + twist) * Math.PI) / 180;
    const d = add(mul(u, -1 / 3), mul(add(mul(p, Math.cos(r)), mul(q, Math.sin(r))), Math.sqrt(8) / 3));
    return add(center, mul(d, CH));
  });
}

/** Two tetrahedral H around `center` given its two heavy neighbours. */
function methyleneHs(center: V, n1: V, n2: V): V[] {
  const a = unit(sub(n1, center));
  const b = unit(sub(n2, center));
  const bisector = unit(mul(add(a, b), -1));
  const normal = unit(cross(a, b));
  const theta = (54.75 * Math.PI) / 180;
  return [1, -1].map((sign) => add(center, mul(add(mul(bisector, Math.cos(theta)), mul(normal, sign * Math.sin(theta))), CH)));
}

interface Skeleton {
  C1: V; C2: V; O1: V; O2: V; H2: V; Hp: V; O3: V; H3: V; C3: V; C4?: V;
  /** Direction the alkyl chain grows from C3. */
  chain: number;
}

function skeleton(stage: EsterStage, alcohol: Alcohol): Skeleton {
  const C2: V = [0, 0, 0];
  const C1: V = [-1.5, 0, 0];
  let O1: V; let O2: V; let H2: V; let Hp: V; let O3: V; let H3: V; let C3: V;
  let chain = -30;
  switch (stage) {
    case 0:
    case 1: {
      O1 = at(C2, 60, 1.23);
      O2 = at(C2, -60, 1.34);
      H2 = at(O2, -120, OH);
      Hp = stage === 0 ? [1.6, 2.7, 0.2] : at(O1, 125, OH);
      O3 = stage === 0 ? [3.7, -0.2, 0] : [2.6, -0.1, 0];
      H3 = at(O3, -110, OH);
      C3 = at(O3, 20, 1.43);
      break;
    }
    case 2:
    case 3: {
      O1 = add(C2, mul(unit([0.34, 0.9, 0.27]), 1.43));
      O2 = add(C2, mul(unit([0.34, -0.9, -0.27]), 1.43));
      H2 = at(O2, -120, OH);
      Hp = at(O1, 125, OH);
      O3 = at(C2, 2, 1.45);
      H3 = stage === 2 ? at(O3, -60, OH) : at(O2, -10, OH);
      C3 = at(O3, 25, 1.45);
      chain = -25;
      break;
    }
    default: {
      O1 = at(C2, 72, 1.25);
      O3 = at(C2, -40, 1.34);
      C3 = at(O3, 15, 1.45);
      chain = 30;
      // The water molecule drifts down and away; H⁺ leaves up and right.
      const drift: V = stage === 4 ? [0.4, -0.9, 0] : [0.6, -1.6, 0];
      O2 = add(add(C2, mul(unit([0.34, -0.9, -0.27]), 1.43)), drift);
      H2 = at(O2, -120, OH);
      H3 = at(O2, -10, OH);
      Hp = stage === 4 ? at(O1, 130, OH) : [1.8, 2.8, 0.2];
      break;
    }
  }
  const C4 = alcohol === "ethanol" ? at(C3, chain, 1.52) : undefined;
  return { C1, C2, O1, O2, H2, Hp, O3, H3, C3, C4, chain };
}

export interface EsterSnapshot {
  atoms: ChemAtom[];
  bonds: ChemBond[];
}

const CHARGED_ATOM: Record<EsterStage, string> = { 0: "Hp", 1: "O1", 2: "O3", 3: "O2", 4: "O1", 5: "Hp" };

export function esterStage(stage: EsterStage, alcohol: Alcohol, focus: readonly string[] = []): EsterSnapshot {
  const s = skeleton(stage, alcohol);
  const atoms: ChemAtom[] = [];
  const place = (id: string, element: string, p: V, extra: Partial<ChemAtom> = {}) => {
    atoms.push({ id, element, x: p[0], y: p[1], z: p[2], ...extra });
  };
  place("C1", "C", s.C1);
  methylHs(s.C1, s.C2, 30).forEach((p, index) => place(`H1${"abc"[index]}`, "H", p));
  place("C2", "C", s.C2);
  place("O1", "O", s.O1);
  place("O2", "O", s.O2);
  place("H2", "H", s.H2);
  place("Hp", "H", s.Hp);
  place("O3", "O", s.O3, { isotope: 18 });
  place("H3", "H", s.H3);
  place("C3", "C", s.C3);
  if (s.C4) {
    methyleneHs(s.C3, s.O3, s.C4).forEach((p, index) => place(`H3${"ab"[index]}`, "H", p));
    place("C4", "C", s.C4);
    methylHs(s.C4, s.C3, 60).forEach((p, index) => place(`H4${"abc"[index]}`, "H", p));
  } else {
    methylHs(s.C3, s.O3, 60).forEach((p, index) => place(`H3${"abc"[index]}`, "H", p));
  }
  for (const atom of atoms) {
    if (atom.id === CHARGED_ATOM[stage]) atom.charge = 1;
    if (focus.includes(atom.id)) atom.tone = "focus";
  }

  const bonds: ChemBond[] = [];
  const bond = (from: string, to: string, order: 1 | 2 = 1) => bonds.push({ id: `${from}-${to}`, from, to, order });
  bond("C1", "C2");
  ["H1a", "H1b", "H1c"].forEach((h) => bond("C1", h));
  bond("C2", "O1", stage === 2 || stage === 3 ? 1 : 2);
  if (stage <= 3) bond("C2", "O2");
  bond("O2", "H2");
  if (stage >= 1 && stage <= 4) bond("O1", "Hp");
  if (stage >= 2) bond("C2", "O3");
  if (stage <= 2) bond("O3", "H3");
  else bond("O2", "H3");
  bond("O3", "C3");
  if (s.C4) {
    ["H3a", "H3b"].forEach((h) => bond("C3", h));
    bond("C3", "C4");
    ["H4a", "H4b", "H4c"].forEach((h) => bond("C4", h));
  } else {
    ["H3a", "H3b", "H3c"].forEach((h) => bond("C3", h));
  }
  return { atoms, bonds };
}

/**
 * The curly arrows that announce the next event, drawn on the current stage.
 * Every electron pair that moves gets its own arrow: a nucleophile attacking
 * C=O pushes the π pair onto O, a proton moving between oxygens is one pair
 * in and one pair out, and water leaving is pushed by the O–H lone pair
 * reforming C=O.
 */
export function nextArrow(stage: EsterStage): ChemCurvedArrow[] {
  switch (stage) {
    case 0:
      return [{ id: "protonate", from: { atom: "O1" }, to: { atom: "Hp" }, bend: -0.5 }];
    case 1:
      return [
        { id: "attack", from: { atom: "O3" }, to: { atom: "C2" }, bend: 0.5 },
        { id: "pi-to-o", from: { bond: "C2-O1" }, to: { atom: "O1" }, bend: -0.6 },
      ];
    case 2:
      return [
        { id: "shuttle", from: { atom: "O2" }, to: { atom: "H3" }, bend: 0.6 },
        { id: "oh-to-o", from: { bond: "O3-H3" }, to: { atom: "O3" }, bend: -0.6 },
      ];
    case 3:
      return [
        { id: "reform", from: { atom: "O1" }, to: { bond: "C2-O1" }, bend: 0.6 },
        { id: "leave", from: { bond: "C2-O2" }, to: { atom: "O2" }, bend: -0.8 },
      ];
    case 4:
      return [{ id: "release", from: { bond: "O1-Hp" }, to: { atom: "O1" }, bend: 0.8 }];
    default:
      return [];
  }
}

export function alcoholAtomIds(alcohol: Alcohol): string[] {
  return alcohol === "ethanol"
    ? ["O3", "H3", "C3", "H3a", "H3b", "C4", "H4a", "H4b", "H4c"]
    : ["O3", "H3", "C3", "H3a", "H3b", "H3c"];
}

export const ACID_ATOM_IDS = ["C1", "H1a", "H1b", "H1c", "C2", "O1", "O2", "H2"];

/** Name labels for the fragments present at a stage. */
export function esterGroups(stage: EsterStage, alcohol: Alcohol): ChemGroupLabel[] {
  const alcoholName = alcohol === "ethanol" ? "乙醇" : "甲醇";
  const alkyl = alcoholAtomIds(alcohol).filter((id) => id !== "H3");
  if (stage <= 1) {
    return [
      { id: "acid", atom_ids: ACID_ATOM_IDS, label: stage === 0 ? "乙酸" : "质子化的乙酸" },
      { id: "alcohol", atom_ids: alcoholAtomIds(alcohol), label: alcoholName },
      { id: "proton", atom_ids: stage === 0 ? ["Hp"] : [], label: "H^+", placement: "above" as const },
    ].filter((group) => group.atom_ids.length > 0);
  }
  if (stage <= 3) {
    return [{ id: "intermediate", atom_ids: [...ACID_ATOM_IDS, "Hp", ...alcoholAtomIds(alcohol)], label: "四面体中间体" }];
  }
  const ester = alcohol === "ethanol" ? "乙酸乙酯" : "乙酸甲酯";
  return [
    { id: "ester", atom_ids: ["C1", "H1a", "H1b", "H1c", "C2", "O1", ...alkyl, ...(stage === 4 ? ["Hp"] : [])], label: stage === 4 ? `质子化的${ester}` : ester },
    { id: "water", atom_ids: ["O2", "H2", "H3"], label: "H_2O" },
    ...(stage === 5 ? [{ id: "proton", atom_ids: ["Hp"], label: "H^+（再生）", placement: "above" as const }] : []),
  ];
}

/** Relative molecular masses with and without the ¹⁸O label. */
export function esterMass(alcohol: Alcohol, labelled: boolean): number {
  return (alcohol === "ethanol" ? 88 : 74) + (labelled ? 2 : 0);
}
