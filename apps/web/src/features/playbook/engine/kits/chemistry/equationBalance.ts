/**
 * Balance check for the equations a chemistry scene prints.
 *
 * Equations are written in the kit's formula markup (`SO_4^{2-}`,
 * `CH_3CO^{18}OC_2H_5`, `2HI(g)`), so the same string that is typeset on the
 * stage can be parsed here and checked for atom and charge balance. Isotopes
 * are their own key (`18O`), matching the atom ledger. Anything that is not a
 * clean formula equation — arithmetic, prose, structural fragments like
 * `C=O` — parses to `null` instead of being guessed at.
 */

import type { ElementCounts } from "./atomLedger";

const ELEMENT_SYMBOLS = new Set(
  (
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr " +
    "Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pt Au Hg Pb Bi"
  ).split(" "),
);

const ARROW = /\s+(?:=|→|⇌)\s+/;
const TERM_SEPARATOR = /\s+([+−])\s+/;
const STATE_SUFFIX = /\((?:g|l|s|aq)\)$/;
/** Everything after the equation proper: a full-width gap or a ΔH annotation. */
const TRAILER = /(?:\u3000|\s+ΔH).*$/;

export interface ParsedSpecies {
  counts: ElementCounts;
  charge: number;
}

export interface EquationTerm {
  coefficient: number;
  species: ParsedSpecies;
}

export interface ChemEquation {
  reactants: EquationTerm[];
  products: EquationTerm[];
}

export interface EquationImbalance {
  /** Reactant count minus product count, per element; balanced elements are omitted. */
  atoms: ElementCounts;
  /** Reactant charge minus product charge. */
  charge: number;
}

function addCounts(target: ElementCounts, source: ElementCounts, factor: number): ElementCounts {
  const result = { ...target };
  for (const [key, amount] of Object.entries(source)) {
    const next = (result[key] ?? 0) + amount * factor;
    if (next === 0) delete result[key];
    else result[key] = next;
  }
  return result;
}

/** A `_2` / `_{12}` subscript at `index`, or 1 when there is none. */
function readCount(text: string, index: number): { value: number; next: number } {
  const match = /^_(?:(\d+)|\{(\d+)\})/.exec(text.slice(index));
  if (!match) return { value: 1, next: index };
  return { value: Number(match[1] ?? match[2]), next: index + match[0].length };
}

function readCharge(text: string): number | null {
  const match = /^\^(?:([+-])|\{(\d*)([+-])\})$/.exec(text);
  if (!match) return null;
  const sign = (match[1] ?? match[3]) === "+" ? 1 : -1;
  return sign * (match[2] ? Number(match[2]) : 1);
}

/** Parses a formula body up to a closing bracket or a trailing charge; null on anything unexpected. */
function parseBody(text: string, start: number, nested: boolean): { counts: ElementCounts; next: number } | null {
  let counts: ElementCounts = {};
  let index = start;
  let units = 0;
  while (index < text.length) {
    const rest = text.slice(index);
    if (rest.startsWith(")")) break;
    if (rest.startsWith("(")) {
      const inner = parseBody(text, index + 1, true);
      if (!inner || text[inner.next] !== ")") return null;
      const count = readCount(text, inner.next + 1);
      counts = addCounts(counts, inner.counts, count.value);
      index = count.next;
      units += 1;
      continue;
    }
    const atom = /^(?:\^\{(\d+)\})?([A-Z][a-z]?)/.exec(rest);
    if (!atom) break;
    const symbol = ELEMENT_SYMBOLS.has(atom[2]) ? atom[2] : atom[2][0];
    if (!ELEMENT_SYMBOLS.has(symbol)) return null;
    const consumed = atom[0].length - (atom[2].length - symbol.length);
    const count = readCount(text, index + consumed);
    counts = addCounts(counts, { [atom[1] ? `${atom[1]}${symbol}` : symbol]: 1 }, count.value);
    index = count.next;
    units += 1;
  }
  if (units === 0 || (!nested && text.slice(index).startsWith(")"))) return null;
  return { counts, next: index };
}

/** One species in markup, e.g. `SO_4^{2-}`, `e^-`, `CH_3^{18}OH`; null if it is not a formula. */
export function parseSpecies(markup: string): ParsedSpecies | null {
  const text = markup.replace(STATE_SUFFIX, "");
  if (text === "e^-") return { counts: {}, charge: -1 };
  const body = parseBody(text, 0, false);
  if (!body) return null;
  const rest = text.slice(body.next);
  if (rest === "") return { counts: body.counts, charge: 0 };
  const charge = readCharge(rest);
  return charge === null ? null : { counts: body.counts, charge };
}

function parseTerm(text: string): EquationTerm | null {
  const match = /^([1-9]\d*)?(.+)$/.exec(text.trim());
  if (!match) return null;
  const species = parseSpecies(match[2]);
  return species ? { coefficient: match[1] ? Number(match[1]) : 1, species } : null;
}

/**
 * Splits one side into signed terms. A subtracted term (`Zn − 2e^-`, the
 * textbook way of writing an oxidation half equation) belongs on the other side.
 */
function parseSide(text: string): { own: EquationTerm[]; moved: EquationTerm[] } | null {
  const parts = text.trim().split(TERM_SEPARATOR);
  const own: EquationTerm[] = [];
  const moved: EquationTerm[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const term = parseTerm(parts[index]);
    if (!term) return null;
    (index > 0 && parts[index - 1] === "−" ? moved : own).push(term);
  }
  return { own, moved };
}

/** A formula equation in markup, or null when the text is not one. */
export function parseChemEquation(markup: string): ChemEquation | null {
  const sides = markup.replace(TRAILER, "").trim().split(ARROW);
  if (sides.length !== 2) return null;
  const left = parseSide(sides[0]);
  const right = parseSide(sides[1]);
  if (!left || !right) return null;
  return {
    reactants: [...left.own, ...right.moved],
    products: [...right.own, ...left.moved],
  };
}

function totals(terms: EquationTerm[]): ParsedSpecies {
  return terms.reduce<ParsedSpecies>(
    (sum, term) => ({
      counts: addCounts(sum.counts, term.species.counts, term.coefficient),
      charge: sum.charge + term.species.charge * term.coefficient,
    }),
    { counts: {}, charge: 0 },
  );
}

export function equationImbalance(equation: ChemEquation): EquationImbalance {
  const left = totals(equation.reactants);
  const right = totals(equation.products);
  return { atoms: addCounts(left.counts, right.counts, -1), charge: left.charge - right.charge };
}
