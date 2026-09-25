/**
 * Zn–Cu (or Fe–Cu) galvanic cell bookkeeping.
 *
 * Standard reduction potentials (25 °C): Zn²⁺/Zn −0.76 V, Fe²⁺/Fe −0.44 V,
 * Cu²⁺/Cu +0.34 V, so E°cell = 1.10 V for Zn–Cu and 0.78 V for Fe–Cu. Molar
 * masses use the rounded values of Chinese high-school problems (Zn 65,
 * Fe 56, Cu 64 g/mol). Iron in a galvanic cell is oxidised to Fe²⁺, not Fe³⁺.
 */

export const FARADAY = 96485;

export type AnodeMetal = "Zn" | "Fe";

export interface MetalData {
  symbol: string;
  name: string;
  ion: string;
  ionMarkup: string;
  ionName: string;
  molarMass: number;
  standardPotential: number;
  sulfate: string;
  solutionTint: { hue: "none" | "green" | "blue"; strength: number };
}

export const METALS: Readonly<Record<"Zn" | "Fe" | "Cu", MetalData>> = Object.freeze({
  Zn: { symbol: "Zn", name: "锌", ion: "Zn2+", ionMarkup: "Zn^{2+}", ionName: "锌离子", molarMass: 65, standardPotential: -0.76, sulfate: "ZnSO_4", solutionTint: { hue: "none", strength: 0 } },
  Fe: { symbol: "Fe", name: "铁", ion: "Fe2+", ionMarkup: "Fe^{2+}", ionName: "亚铁离子", molarMass: 56, standardPotential: -0.44, sulfate: "FeSO_4", solutionTint: { hue: "green", strength: 0.35 } },
  Cu: { symbol: "Cu", name: "铜", ion: "Cu2+", ionMarkup: "Cu^{2+}", ionName: "铜离子", molarMass: 64, standardPotential: 0.34, sulfate: "CuSO_4", solutionTint: { hue: "blue", strength: 0.75 } },
});

export function cellEmf(anode: AnodeMetal): number {
  return Number((METALS.Cu.standardPotential - METALS[anode].standardPotential).toFixed(2));
}

export interface ElectronLedger {
  electronsMol: number;
  anodeLossG: number;
  cathodeGainG: number;
  charge: number;
}

/** Mass change of both electrodes after `electronsMol` of electrons pass. */
export function electrodeMassChange(anode: AnodeMetal, electronsMol: number): ElectronLedger {
  const metalMol = electronsMol / 2;
  return {
    electronsMol,
    anodeLossG: metalMol * METALS[anode].molarMass,
    cathodeGainG: metalMol * METALS.Cu.molarMass,
    charge: electronsMol * FARADAY,
  };
}
