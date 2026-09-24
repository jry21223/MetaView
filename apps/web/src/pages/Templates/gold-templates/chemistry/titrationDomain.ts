import type { ChemTint } from "../../../../features/playbook/engine/kits/chemistry/sceneTypes";

/**
 * Strong acid titrated with strong base (HCl with NaOH) at 25 °C.
 *
 * pH comes from the charge balance with water's autoionisation included, so
 * the curve is exact at the equivalence point (pH 7.00) instead of blowing up:
 *   δ = (c_a·V_a − c_b·V_b) / (V_a + V_b),  [H⁺] = (δ + √(δ² + 4K_w)) / 2.
 * Textbook check (人教版选择性必修1 第三章第二节): 0.1000 mol/L each, 20.00 mL
 * acid — 19.98 mL gives pH 4.30, 20.02 mL gives pH 9.70.
 */

export const KW_25C = 1e-14;

export interface TitrationSetup {
  /** Acid concentration, mol/L. */
  acidConc: number;
  /** Acid volume in the flask, mL. */
  acidVolumeMl: number;
  /** Titrant (base) concentration, mol/L. */
  baseConc: number;
}

export function titrationPh(setup: TitrationSetup, baseVolumeMl: number): number {
  const totalL = (setup.acidVolumeMl + baseVolumeMl) / 1000;
  const excessAcidMol = (setup.acidConc * setup.acidVolumeMl - setup.baseConc * baseVolumeMl) / 1000;
  const delta = excessAcidMol / totalL;
  const hydrogen = (delta + Math.sqrt(delta * delta + 4 * KW_25C)) / 2;
  return -Math.log10(hydrogen);
}

export function equivalenceVolumeMl(setup: TitrationSetup): number {
  return (setup.acidConc * setup.acidVolumeMl) / setup.baseConc;
}

/** pH just before and after equivalence, at ±`relative` of the equivalence volume. */
export function jumpRange(setup: TitrationSetup, relative = 0.001): { vLow: number; vHigh: number; phLow: number; phHigh: number } {
  const veq = equivalenceVolumeMl(setup);
  const vLow = veq * (1 - relative);
  const vHigh = veq * (1 + relative);
  return { vLow, vHigh, phLow: titrationPh(setup, vLow), phHigh: titrationPh(setup, vHigh) };
}

/** Base volume at which the flask reaches `targetPh` (bisection on the monotone curve). */
export function volumeAtPh(setup: TitrationSetup, targetPh: number, maxMl = equivalenceVolumeMl(setup) * 2): number {
  let low = 0;
  let high = maxMl;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    if (titrationPh(setup, mid) < targetPh) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export type IndicatorId = "phenolphthalein" | "methyl_orange";

export interface IndicatorDefinition {
  id: IndicatorId;
  name: string;
  /** Colour-change interval (pH). */
  low: number;
  high: number;
  /** pH at which the endpoint colour is judged when base is added to acid. */
  endpointPh: number;
  /** How the endpoint looks, in words. */
  endpointText: string;
}

export const INDICATORS: Readonly<Record<IndicatorId, IndicatorDefinition>> = Object.freeze({
  phenolphthalein: {
    id: "phenolphthalein",
    name: "酚酞",
    low: 8.2,
    high: 10.0,
    endpointPh: 8.2,
    endpointText: "无色变为浅红色，半分钟内不褪色",
  },
  methyl_orange: {
    id: "methyl_orange",
    name: "甲基橙",
    low: 3.1,
    high: 4.4,
    endpointPh: 4.4,
    endpointText: "橙色变为黄色，半分钟内不变",
  },
});

/**
 * Indicator colour in the flask at a pH, as a renderer tint. Ranges follow
 * the textbook table: 酚酞 <8.2 无色、8.2–10.0 浅红色、>10.0 红色；
 * 甲基橙 <3.1 红色、3.1–4.4 橙色、>4.4 黄色.
 */
export function indicatorTint(indicator: IndicatorId, ph: number): ChemTint {
  const definition = INDICATORS[indicator];
  if (indicator === "phenolphthalein") {
    if (ph < definition.low) return { hue: "none", strength: 0 };
    const t = Math.min(1, (ph - definition.low) / (definition.high - definition.low));
    return ph > definition.high ? { hue: "pink", strength: 0.95 } : { hue: "pink", strength: 0.2 + 0.45 * t };
  }
  if (ph < definition.low) return { hue: "red", strength: 0.75 };
  if (ph <= definition.high) return { hue: "orange", strength: 0.7 };
  return { hue: "yellow", strength: 0.7 };
}

/** Colour name for narration, per the same table. */
export function indicatorColorName(indicator: IndicatorId, ph: number): string {
  const definition = INDICATORS[indicator];
  if (indicator === "phenolphthalein") {
    if (ph < definition.low) return "无色";
    return ph > definition.high ? "红色" : "浅红色";
  }
  if (ph < definition.low) return "红色";
  return ph <= definition.high ? "橙色" : "黄色";
}

/** Relative titration error when stopping at the indicator's endpoint colour. */
export function endpointError(setup: TitrationSetup, indicator: IndicatorId): { volumeMl: number; relativeError: number } {
  const volumeMl = volumeAtPh(setup, INDICATORS[indicator].endpointPh);
  const veq = equivalenceVolumeMl(setup);
  return { volumeMl, relativeError: (volumeMl - veq) / veq };
}

/** Sampled curve for the chart: dense near equivalence so the jump is a true vertical. */
export function titrationCurve(setup: TitrationSetup, maxMl: number): Array<[number, number]> {
  const veq = equivalenceVolumeMl(setup);
  const volumes = new Set<number>();
  for (let v = 0; v <= maxMl + 1e-9; v += 0.5) volumes.add(Number(v.toFixed(4)));
  for (const offset of [-1, -0.5, -0.2, -0.1, -0.04, -0.02, -0.01, 0, 0.01, 0.02, 0.04, 0.1, 0.2, 0.5, 1]) {
    const v = veq + offset;
    if (v >= 0 && v <= maxMl) volumes.add(Number(v.toFixed(4)));
  }
  return [...volumes].sort((a, b) => a - b).map((v) => [v, titrationPh(setup, v)]);
}
