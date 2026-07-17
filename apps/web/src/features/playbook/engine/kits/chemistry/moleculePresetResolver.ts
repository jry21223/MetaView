import methanePreset from "../../../../../../public/assets/metaview-kits/chemistry-basic/molecule-presets/methane.json";
import waterPreset from "../../../../../../public/assets/metaview-kits/chemistry-basic/molecule-presets/water.json";

import { resolveAssetForRenderer } from "../../assets/assetResolver";
import type { Molecule2DAtom, Molecule2DBond, Molecule2DCallout } from "../../types";

interface RawMoleculePresetAtom {
  id: string;
  element: string;
  x: number;
  y: number;
  charge?: string | null;
  label?: string | null;
}

interface RawMoleculePresetBond {
  id: string;
  from: string;
  to: string;
  order: 1 | 2 | 3;
  label?: string | null;
}

interface RawMoleculePreset {
  id: string;
  source: "structured-preset";
  smiles?: string;
  formula: string;
  formulaLatex?: string;
  geometry?: string;
  caption?: string;
  atoms: RawMoleculePresetAtom[];
  bonds: RawMoleculePresetBond[];
  callouts?: Molecule2DCallout[];
}

export interface ResolvedMoleculePreset {
  moleculeId: string;
  moleculeAssetId: string;
  source: RawMoleculePreset["source"];
  smiles?: string;
  formula: string;
  formulaLatex: string;
  geometry?: string;
  caption: string;
  atoms: Array<Omit<Molecule2DAtom, "asset_id">>;
  bonds: Array<Omit<Molecule2DBond, "asset_id">>;
  callouts: Molecule2DCallout[];
}

const PRESETS_BY_ID: Record<string, RawMoleculePreset> = {
  methane: methanePreset as RawMoleculePreset,
  water: waterPreset as RawMoleculePreset,
};

function formulaToLatex(formula: string): string {
  return formula.replace(/(\d+)/g, "_$1");
}

export function resolveMoleculePresetForRenderer(
  packId: string,
  moleculeId: string,
): ResolvedMoleculePreset | undefined {
  const rawPreset = PRESETS_BY_ID[moleculeId];
  if (!rawPreset) return undefined;

  const moleculeAsset = resolveAssetForRenderer("molecule_2d_scene", moleculeId, packId);
  if (!moleculeAsset || moleculeAsset.type !== "json") return undefined;

  return {
    moleculeId: rawPreset.id,
    moleculeAssetId: moleculeAsset.id,
    source: rawPreset.source,
    smiles: rawPreset.smiles,
    formula: rawPreset.formula,
    formulaLatex: rawPreset.formulaLatex ?? formulaToLatex(rawPreset.formula),
    geometry: rawPreset.geometry,
    caption:
      rawPreset.caption ??
      `${rawPreset.id} molecule loaded from the ${packId} structured preset.`,
    atoms: rawPreset.atoms.map((atom) => ({
      id: atom.id,
      element: atom.element,
      x: atom.x,
      y: atom.y,
      charge: atom.charge,
      label: atom.label,
    })),
    bonds: rawPreset.bonds.map((bond) => ({
      id: bond.id,
      from: bond.from,
      to: bond.to,
      order: bond.order,
      label: bond.label,
    })),
    callouts: rawPreset.callouts ?? [],
  };
}

function normalizeSmiles(smiles: string): string {
  return smiles.trim();
}

export function resolveMoleculePresetBySmilesForRenderer(
  packId: string,
  smiles: string | null | undefined,
): ResolvedMoleculePreset | undefined {
  if (!smiles) return undefined;
  const normalizedSmiles = normalizeSmiles(smiles);
  const rawPreset = Object.values(PRESETS_BY_ID).find((preset) => preset.smiles === normalizedSmiles);
  if (!rawPreset) return undefined;
  return resolveMoleculePresetForRenderer(packId, rawPreset.id);
}
