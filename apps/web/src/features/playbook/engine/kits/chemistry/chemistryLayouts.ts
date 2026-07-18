import { resolveAssetByRole, resolveAssetForRenderer } from "../../assets/assetResolver";
import type {
  Molecule2DAtom,
  Molecule2DBond,
  Molecule2DCallout,
  Molecule2DSceneSnapshot,
  ReactionArrow,
  ReactionElectronFlow,
  ReactionParticipant,
  ReactionSceneSnapshot,
} from "../../types";
import {
  resolveMoleculePresetBySmilesForRenderer,
  resolveMoleculePresetForRenderer,
} from "./moleculePresetResolver";
import {
  resolveMoleculeContract,
  WATER_SYNTHESIS_REACTION_CONTRACT,
  type ChemistryReactionParticipantContract,
} from "./chemistryContracts";

const DEFAULT_CHEMISTRY_PACK_ID = "chemistry-basic";
const GLUCOSE_CONTRACT = resolveMoleculeContract("glucose")!;

export type Molecule2DLayoutInput = {
  packId?: string;
  sceneType?: string;
  moleculeId?: string;
  smiles?: string;
  moleculeAssetId?: string | null;
  atoms?: Molecule2DAtomInput[];
  bonds?: Molecule2DBondInput[];
  highlights?: string[];
  callouts?: Molecule2DCalloutInput[];
  formulaLatex?: string;
  caption?: string;
};

export type Molecule2DAtomInput = {
  id?: string;
  element: string;
  x?: number;
  y?: number;
  charge?: string | null;
  label?: string | null;
  assetId?: string | null;
  asset_id?: string | null;
};

export type Molecule2DBondInput = {
  id?: string;
  from: string;
  to: string;
  order?: 1 | 2 | 3;
  stereo?: "wedge" | "dash" | null;
  label?: string | null;
  assetId?: string | null;
  asset_id?: string | null;
};

export type Molecule2DCalloutInput = {
  id?: string;
  targetId?: string;
  target_id?: string;
  label?: string;
  side?: Molecule2DCallout["side"];
};

export type ReactionLayoutInput = {
  packId?: string;
  reactionId?: string;
  reactants?: ReactionParticipantInput[];
  products?: ReactionParticipantInput[];
  arrows?: ReactionArrowInput[];
  electronFlows?: ReactionElectronFlowInput[];
  electron_flows?: ReactionElectronFlowInput[];
  callouts?: Molecule2DCalloutInput[];
  formulaLatex?: string;
  caption?: string;
};

export type ReactionParticipantInput = {
  id?: string;
  formulaLatex?: string;
  formula_latex?: string;
  label?: string | null;
  coefficient?: number | null;
  x?: number;
  y?: number;
  assetId?: string | null;
  asset_id?: string | null;
};

export type ReactionArrowInput = {
  id?: string;
  semanticRole?: string;
  semantic_role?: string;
  from?: [number, number];
  to?: [number, number];
  label?: string | null;
  assetId?: string | null;
  asset_id?: string | null;
};

export type ReactionElectronFlowInput = ReactionArrowInput;

function resolveChemistryAssetId(
  rendererKind: "molecule_2d_scene" | "reaction_scene",
  semanticRole: string,
  packId: string,
): string | undefined {
  return (
    resolveAssetForRenderer(rendererKind, semanticRole, packId)?.id ??
    resolveAssetByRole("chemistry", semanticRole, packId)?.id ??
    resolveAssetForRenderer(rendererKind, semanticRole)?.id ??
    resolveAssetByRole("chemistry", semanticRole)?.id
  );
}

function numberOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function moleculeIdFor(input: Molecule2DLayoutInput): string {
  if (input.moleculeId) return input.moleculeId;
  if (input.sceneType === "molecule_2d_methane") return resolveMoleculeContract("methane")?.moleculeId ?? "methane";
  if (input.sceneType === "molecule_2d_glucose") return GLUCOSE_CONTRACT.moleculeId;
  return resolveMoleculeContract("water")?.moleculeId ?? "water";
}

function withOptionalAtomFields(atom: Molecule2DAtom, input: Molecule2DAtomInput): Molecule2DAtom {
  const next = { ...atom };
  if (input.charge !== undefined) next.charge = input.charge;
  if (input.label !== undefined) next.label = input.label;
  return next;
}

function compileAtom(input: Molecule2DAtomInput, index: number): Molecule2DAtom {
  return withOptionalAtomFields(
    {
      id: input.id ?? `${input.element.toLowerCase()}-${index + 1}`,
      element: input.element,
      x: numberOr(input.x, 50),
      y: numberOr(input.y, 50),
      asset_id: input.assetId ?? input.asset_id,
    },
    input,
  );
}

function withOptionalBondFields(bond: Molecule2DBond, input: Molecule2DBondInput): Molecule2DBond {
  const next = { ...bond };
  if (input.label !== undefined) next.label = input.label;
  if (input.stereo !== undefined) next.stereo = input.stereo;
  return next;
}

function compileBond(input: Molecule2DBondInput, index: number): Molecule2DBond {
  return withOptionalBondFields(
    {
      id: input.id ?? `${input.from}-${input.to}-${index + 1}`,
      from: input.from,
      to: input.to,
      order: input.order ?? 1,
      asset_id: input.assetId ?? input.asset_id,
    },
    input,
  );
}

function compileGlucoseLayout(input: Molecule2DLayoutInput, packId: string): Molecule2DSceneSnapshot {
  const atom = (id: string, element: string, x: number, y: number, label: string): Molecule2DAtom => ({
    id,
    element,
    x,
    y,
    label,
  });
  const bond = (id: string, from: string, to: string): Molecule2DBond => ({
    id,
    from,
    to,
    order: 1,
  });

  return {
    kind: "molecule_2d_scene",
    pack_id: packId,
    molecule_id: GLUCOSE_CONTRACT.moleculeId,
    smiles: input.smiles ?? GLUCOSE_CONTRACT.smiles,
    molecule_asset_id:
      input.moleculeAssetId ??
      GLUCOSE_CONTRACT.assetId ??
      resolveAssetForRenderer("molecule_2d_scene", "glucose", packId)?.id ??
      resolveChemistryAssetId("molecule_2d_scene", "glucose", packId),
    atoms: [
      atom("c1", "C", 42, 40, "C1"),
      atom("c2", "C", 58, 40, "C2"),
      atom("c3", "C", 68, 52, "C3"),
      atom("c4", "C", 58, 65, "C4"),
      atom("c5", "C", 42, 65, "C5"),
      atom("c6", "C", 31, 75, "C6"),
      atom("o-ring", "O", 32, 52, "ring oxygen"),
      atom("o1", "O", 42, 27, "OH"),
      atom("o2", "O", 75, 41, "OH"),
      atom("o3", "O", 80, 64, "OH"),
      atom("o4", "O", 58, 80, "OH"),
      atom("o5", "O", 22, 84, "OH"),
    ],
    bonds: [
      bond("c1-c2", "c1", "c2"),
      bond("c2-c3", "c2", "c3"),
      bond("c3-c4", "c3", "c4"),
      bond("c4-c5", "c4", "c5"),
      bond("c5-o-ring", "c5", "o-ring"),
      bond("o-ring-c1", "o-ring", "c1"),
      bond("c5-c6", "c5", "c6"),
      bond("c1-o1", "c1", "o1"),
      bond("c2-o2", "c2", "o2"),
      bond("c3-o3", "c3", "o3"),
      bond("c4-o4", "c4", "o4"),
      bond("c6-o5", "c6", "o5"),
    ],
    highlights: input.highlights ?? ["glucose_ring", "hydroxyl_groups"],
    callouts: input.callouts?.map(compileCallout) ?? [
      { id: "glucose-ring", target_id: "o-ring", label: "pyranose ring", side: "left" },
      { id: "glucose-hydroxyls", target_id: "o3", label: "hydroxyl groups", side: "right" },
      { id: "glucose-formula", target_id: "c2", label: "C6H12O6", side: "top" },
    ],
    formula_latex: input.formulaLatex ?? GLUCOSE_CONTRACT.formulaLatex,
    caption:
      input.caption ??
      "glucose is compiled from the chemistry-basic SMILES asset into a structured ring layout.",
  };
}

function compileCallout(input: Molecule2DCalloutInput, index: number): Molecule2DCallout {
  const targetId = input.targetId ?? input.target_id ?? "molecule";
  return {
    id: input.id ?? `${targetId}-callout-${index + 1}`,
    target_id: targetId,
    label: input.label ?? targetId,
    side: input.side,
  };
}

export function compileMolecule2DLayout(input: Molecule2DLayoutInput): Molecule2DSceneSnapshot {
  const packId = input.packId ?? DEFAULT_CHEMISTRY_PACK_ID;
  const moleculeId = moleculeIdFor(input);
  const moleculeContract = resolveMoleculeContract(moleculeId);
  const resolvedSmiles = input.smiles ?? moleculeContract?.smiles;
  const hasStructuredInput = (input.atoms?.length ?? 0) > 0 && (input.bonds?.length ?? 0) > 0;

  if (hasStructuredInput) {
    return {
      kind: "molecule_2d_scene",
      pack_id: packId,
      molecule_id: moleculeId,
      smiles: resolvedSmiles,
      molecule_asset_id:
        input.moleculeAssetId ?? moleculeContract?.assetId ?? resolveAssetForRenderer("molecule_2d_scene", moleculeId, packId)?.id,
      atoms: input.atoms!.map((atom, index) => compileAtom(atom, index)),
      bonds: input.bonds!.map((bond, index) => compileBond(bond, index)),
      highlights: input.highlights,
      callouts: input.callouts?.map(compileCallout),
      formula_latex: input.formulaLatex ?? moleculeContract?.formulaLatex,
      caption: input.caption ?? `${moleculeId} molecule compiled from structured atom and bond input.`,
    };
  }

  if (moleculeId === "glucose") {
    return compileGlucoseLayout(input, packId);
  }

  const moleculePreset =
    resolveMoleculePresetBySmilesForRenderer(packId, resolvedSmiles) ??
    resolveMoleculePresetForRenderer(packId, moleculeId);
  const moleculeAssetId =
    input.moleculeAssetId ??
    moleculeContract?.assetId ??
    moleculePreset?.moleculeAssetId ??
    resolveChemistryAssetId("molecule_2d_scene", moleculeId, packId);
  if (moleculePreset) {
    return {
      kind: "molecule_2d_scene",
      pack_id: packId,
      molecule_id: moleculeContract?.moleculeId ?? moleculePreset.moleculeId,
      smiles: resolvedSmiles ?? moleculePreset.smiles,
      molecule_asset_id: moleculeAssetId,
      atoms: moleculePreset.atoms,
      bonds: moleculePreset.bonds,
      callouts: moleculePreset.callouts,
      formula_latex: input.formulaLatex ?? moleculeContract?.formulaLatex ?? moleculePreset.formulaLatex,
      caption: input.caption ?? moleculePreset.caption,
    };
  }

  return {
    kind: "molecule_2d_scene",
    pack_id: packId,
    molecule_id: moleculeId,
    smiles: resolvedSmiles,
    molecule_asset_id: moleculeAssetId,
    atoms: [
      { id: "o", element: "O", x: 50, y: 42, label: "oxygen" },
      { id: "h1", element: "H", x: 30.2, y: 57.3, label: "hydrogen" },
      { id: "h2", element: "H", x: 69.8, y: 57.3, label: "hydrogen" },
    ],
    bonds: [
      { id: "oh1", from: "o", to: "h1", order: 1 },
      { id: "oh2", from: "o", to: "h2", order: 1 },
    ],
    callouts: [
      { id: "bent-shape", target_id: "o", label: "bent geometry", side: "top" },
      { id: "polar-bond", target_id: "h2", label: "polar bonds", side: "right" },
    ],
    formula_latex: input.formulaLatex ?? moleculeContract?.formulaLatex ?? "H_2O",
    caption: input.caption ?? "Water is a bent polar molecule built from structured atom and bond data.",
  };
}

function contractParticipant(input: ChemistryReactionParticipantContract): ReactionParticipant {
  return {
    id: input.id,
    formula_latex: input.formulaLatex,
    label: input.label,
    coefficient: input.coefficient,
    x: input.x,
    y: input.y,
  };
}

function compileParticipant(input: ReactionParticipantInput, index: number): ReactionParticipant {
  return {
    id: input.id ?? `participant-${index + 1}`,
    formula_latex: input.formulaLatex ?? input.formula_latex ?? "",
    label: input.label,
    coefficient: input.coefficient,
    x: numberOr(input.x, 20 + index * 18),
    y: numberOr(input.y, 48),
    asset_id: input.assetId ?? input.asset_id,
  };
}

function compileArrow(input: ReactionArrowInput, index: number): ReactionArrow {
  const semanticRole = input.semanticRole ?? input.semantic_role ?? "reaction_arrow";
  return {
    id: input.id ?? `reaction-arrow-${index + 1}`,
    semantic_role: semanticRole,
    from: input.from ?? [48, 48],
    to: input.to ?? [66, 48],
    label: input.label,
    asset_id: input.assetId ?? input.asset_id,
  };
}

function compileElectronFlow(input: ReactionElectronFlowInput, index: number): ReactionElectronFlow {
  const semanticRole = input.semanticRole ?? input.semantic_role ?? "electron_flow";
  return {
    id: input.id ?? `electron-flow-${index + 1}`,
    semantic_role: semanticRole,
    from: input.from ?? [39, 38],
    to: input.to ?? [58, 36],
    label: input.label,
    asset_id: input.assetId ?? input.asset_id,
  };
}

export function compileReactionLayout(input: ReactionLayoutInput): ReactionSceneSnapshot {
  const packId = input.packId ?? DEFAULT_CHEMISTRY_PACK_ID;
  const electronFlows = input.electronFlows ?? input.electron_flows;
  const reactionContract = WATER_SYNTHESIS_REACTION_CONTRACT;
  return {
    kind: "reaction_scene",
    pack_id: packId,
    reaction_id: input.reactionId ?? reactionContract.reactionId,
    reactants: input.reactants?.length
      ? input.reactants.map(compileParticipant)
      : reactionContract.reactants.map(contractParticipant),
    products: input.products?.length
      ? input.products.map(compileParticipant)
      : reactionContract.products.map(contractParticipant),
    arrows: input.arrows?.length
      ? input.arrows.map((arrow, index) => compileArrow(arrow, index))
      : [
          {
            id: reactionContract.arrow.id,
            semantic_role: reactionContract.arrow.semanticRole,
            from: reactionContract.arrow.from,
            to: reactionContract.arrow.to,
            label: reactionContract.arrow.label,
          },
        ],
    electron_flows: electronFlows?.length
      ? electronFlows.map((flow, index) => compileElectronFlow(flow, index))
      : [],
    callouts: input.callouts?.length
      ? input.callouts.map(compileCallout)
      : [{ id: "balanced", target_id: "main-arrow", label: "balanced atoms", side: "top" }],
    formula_latex: input.formulaLatex ?? reactionContract.formulaLatex,
    caption: input.caption ?? reactionContract.caption,
  };
}
