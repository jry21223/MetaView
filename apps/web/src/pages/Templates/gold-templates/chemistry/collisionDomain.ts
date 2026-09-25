/**
 * Collision theory numbers for 2HI(g) → H₂(g) + I₂(g).
 *
 * - Ea(uncatalysed) = 184 kJ/mol and Ea(on Pt) = 59 kJ/mol: the values the
 *   common physical-chemistry tables quote for this reaction (Atkins' table
 *   of catalysed activation energies). Other sources give 186 or 209 kJ/mol
 *   for the uncatalysed value; the lesson only uses ratios that survive that.
 * - ΔH = ΔfH°(I₂,g) − 2·ΔfH°(HI,g) = 62.42 − 2 × 26.48 = 9.46 ≈ +9.5 kJ/mol (298 K data).
 *
 * The fraction of collisions energetic enough to react is the Arrhenius
 * factor e^(−Ea/RT); a catalyst multiplies the rate by
 * e^((Ea₁ − Ea₂)/RT) at the same temperature.
 */

export const GAS_CONSTANT = 8.314;
export const HI_EA_UNCATALYSED_KJ = 184;
export const HI_EA_PLATINUM_KJ = 59;
export const HI_DELTA_H_KJ = 9.5;

export type CatalystId = "none" | "pt";

export function activationEnergy(catalyst: CatalystId): number {
  return catalyst === "pt" ? HI_EA_PLATINUM_KJ : HI_EA_UNCATALYSED_KJ;
}

/** Fraction of collisions with at least Ea: e^(−Ea/RT). */
export function activatedFraction(eaKj: number, temperatureK: number): number {
  return Math.exp((-eaKj * 1000) / (GAS_CONSTANT * temperatureK));
}

/** Rate ratio k(T2)/k(T1) at fixed Ea. */
export function temperatureRateRatio(eaKj: number, t1: number, t2: number): number {
  return Math.exp(((eaKj * 1000) / GAS_CONSTANT) * (1 / t1 - 1 / t2));
}

/** Rate gain from lowering Ea at a fixed temperature. */
export function catalystRateGain(eaFromKj: number, eaToKj: number, temperatureK: number): number {
  return Math.exp(((eaFromKj - eaToKj) * 1000) / (GAS_CONSTANT * temperatureK));
}

/**
 * Schematic Maxwell–Boltzmann energy distribution for the chart.
 * The axis is not to scale: a real 184 kJ/mol threshold sits some 30 RT out,
 * where the tail is invisible. Energies here are in units of RT at 700 K, the
 * threshold is placed at `SCHEMATIC_EA`, and only the ordering (and how the
 * tail grows with T or shrinks with Ea) is meant to be read off the picture.
 */
export const SCHEMATIC_EA_UNCATALYSED = 3.2;
export const SCHEMATIC_EA_PLATINUM = SCHEMATIC_EA_UNCATALYSED * (HI_EA_PLATINUM_KJ / HI_EA_UNCATALYSED_KJ);

export function schematicDistribution(temperatureK: number, maxE = 7, samples = 140): Array<[number, number]> {
  const kt = temperatureK / 700;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= samples; i += 1) {
    const e = (maxE * i) / samples;
    const f = (2 / Math.sqrt(Math.PI)) * kt ** -1.5 * Math.sqrt(e) * Math.exp(-e / kt);
    points.push([e, f]);
  }
  return points;
}
