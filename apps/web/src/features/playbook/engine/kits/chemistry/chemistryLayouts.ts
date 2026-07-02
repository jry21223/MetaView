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

const DEFAULT_CHEMISTRY_PACK_ID = "chemistry-basic";

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
  if (input.sceneType === "molecule_2d_methane") return "methane";
  if (input.sceneType === "molecule_2d_glucose") return "glucose";
  return "water";
}

function withOptionalAtomFields(atom: Molecule2DAtom, input: Molecule2DAtomInput): Molecule2DAtom {
  const next = { ...atom };
  if (input.charge !== undefined) next.charge = input.charge;
  if (input.label !== undefined) next.label = input.label;
  return next;
}

function compileAtom(input: Molecule2DAtomInput, packId: string, index: number): Molecule2DAtom {
  return withOptionalAtomFields(
    {
      id: input.id ?? `${input.element.toLowerCase()}-${index + 1}`,
      element: input.element,
      x: numberOr(input.x, 50),
      y: numberOr(input.y, 50),
      asset_id: input.assetId ?? input.asset_id ?? resolveChemistryAssetId("molecule_2d_scene", "atom", packId),
    },
    input,
  );
}

function withOptionalBondFields(bond: Molecule2DBond, input: Molecule2DBondInput): Molecule2DBond {
  const next = { ...bond };
  if (input.label !== undefined) next.label = input.label;
  return next;
}

function compileBond(input: Molecule2DBondInput, packId: string, index: number): Molecule2DBond {
  return withOptionalBondFields(
    {
      id: input.id ?? `${input.from}-${input.to}-${index + 1}`,
      from: input.from,
      to: input.to,
      order: input.order ?? 1,
      asset_id: input.assetId ?? input.asset_id ?? resolveChemistryAssetId("molecule_2d_scene", "bond", packId),
    },
    input,
  );
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
  const atomAssetId = resolveChemistryAssetId("molecule_2d_scene", "atom", packId);
  const bondAssetId = resolveChemistryAssetId("molecule_2d_scene", "bond", packId);
  const hasStructuredInput = (input.atoms?.length ?? 0) > 0 && (input.bonds?.length ?? 0) > 0;

  if (hasStructuredInput) {
    return {
      kind: "molecule_2d_scene",
      pack_id: packId,
      molecule_id: moleculeId,
      smiles: input.smiles,
      molecule_asset_id:
        input.moleculeAssetId ?? resolveAssetForRenderer("molecule_2d_scene", moleculeId, packId)?.id,
      atoms: input.atoms!.map((atom, index) => compileAtom(atom, packId, index)),
      bonds: input.bonds!.map((bond, index) => compileBond(bond, packId, index)),
      highlights: input.highlights,
      callouts: input.callouts?.map(compileCallout),
      formula_latex: input.formulaLatex,
      caption: input.caption ?? `${moleculeId} molecule compiled from structured atom and bond input.`,
    };
  }

  const moleculePreset =
    resolveMoleculePresetBySmilesForRenderer(packId, input.smiles) ??
    resolveMoleculePresetForRenderer(packId, moleculeId);
  const moleculeAssetId =
    moleculePreset?.moleculeAssetId ??
    resolveChemistryAssetId("molecule_2d_scene", moleculeId, packId);
  if (moleculePreset) {
    return {
      kind: "molecule_2d_scene",
      pack_id: packId,
      molecule_id: moleculePreset.moleculeId,
      smiles: moleculePreset.smiles ?? input.smiles,
      molecule_asset_id: moleculeAssetId,
      atoms: moleculePreset.atoms.map((atom) => ({ ...atom, asset_id: atomAssetId })),
      bonds: moleculePreset.bonds.map((bond) => ({ ...bond, asset_id: bondAssetId })),
      callouts: moleculePreset.callouts,
      formula_latex: moleculePreset.formulaLatex,
      caption: input.caption ?? moleculePreset.caption,
    };
  }

  return {
    kind: "molecule_2d_scene",
    pack_id: packId,
    molecule_id: moleculeId,
    smiles: input.smiles,
    molecule_asset_id: moleculeAssetId,
    atoms: [
      { id: "o", element: "O", x: 50, y: 42, asset_id: atomAssetId, label: "oxygen" },
      { id: "h1", element: "H", x: 35, y: 62, asset_id: atomAssetId, label: "hydrogen" },
      { id: "h2", element: "H", x: 65, y: 62, asset_id: atomAssetId, label: "hydrogen" },
    ],
    bonds: [
      { id: "oh1", from: "o", to: "h1", order: 1, asset_id: bondAssetId },
      { id: "oh2", from: "o", to: "h2", order: 1, asset_id: bondAssetId },
    ],
    callouts: [
      { id: "bent-shape", target_id: "o", label: "bent geometry", side: "top" },
      { id: "polar-bond", target_id: "h2", label: "polar bonds", side: "right" },
    ],
    formula_latex: "H_2O",
    caption: input.caption ?? "Water is a bent polar molecule built from structured atom and bond data.",
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

function compileArrow(input: ReactionArrowInput, packId: string, index: number): ReactionArrow {
  const semanticRole = input.semanticRole ?? input.semantic_role ?? "reaction_arrow";
  return {
    id: input.id ?? `reaction-arrow-${index + 1}`,
    semantic_role: semanticRole,
    from: input.from ?? [48, 48],
    to: input.to ?? [66, 48],
    label: input.label,
    asset_id: input.assetId ?? input.asset_id ?? resolveChemistryAssetId("reaction_scene", semanticRole, packId),
  };
}

function compileElectronFlow(input: ReactionElectronFlowInput, packId: string, index: number): ReactionElectronFlow {
  const semanticRole = input.semanticRole ?? input.semantic_role ?? "electron_flow";
  return {
    id: input.id ?? `electron-flow-${index + 1}`,
    semantic_role: semanticRole,
    from: input.from ?? [39, 38],
    to: input.to ?? [58, 36],
    label: input.label,
    asset_id: input.assetId ?? input.asset_id ?? resolveChemistryAssetId("reaction_scene", semanticRole, packId),
  };
}

export function compileReactionLayout(input: ReactionLayoutInput): ReactionSceneSnapshot {
  const packId = input.packId ?? DEFAULT_CHEMISTRY_PACK_ID;
  const electronFlows = input.electronFlows ?? input.electron_flows;
  return {
    kind: "reaction_scene",
    pack_id: packId,
    reaction_id: input.reactionId ?? "reaction_synthesis_water",
    reactants: input.reactants?.length
      ? input.reactants.map(compileParticipant)
      : [
          { id: "h2", formula_latex: "H_2", label: "hydrogen", coefficient: 2, x: 18, y: 48 },
          { id: "o2", formula_latex: "O_2", label: "oxygen", coefficient: 1, x: 38, y: 48 },
        ],
    products: input.products?.length
      ? input.products.map(compileParticipant)
      : [{ id: "h2o", formula_latex: "H_2O", label: "water", coefficient: 2, x: 78, y: 48 }],
    arrows: input.arrows?.length
      ? input.arrows.map((arrow, index) => compileArrow(arrow, packId, index))
      : [
          {
            id: "main-arrow",
            semantic_role: "reaction_arrow",
            from: [48, 48],
            to: [66, 48],
            label: "forms",
            asset_id: resolveChemistryAssetId("reaction_scene", "reaction_arrow", packId),
          },
        ],
    electron_flows: electronFlows?.length
      ? electronFlows.map((flow, index) => compileElectronFlow(flow, packId, index))
      : [
          {
            id: "electron-shift",
            semantic_role: "electron_flow",
            from: [39, 38],
            to: [58, 36],
            label: "bond rearrangement",
            asset_id: resolveChemistryAssetId("reaction_scene", "electron_flow", packId),
          },
        ],
    callouts: input.callouts?.length
      ? input.callouts.map(compileCallout)
      : [{ id: "balanced", target_id: "main-arrow", label: "balanced atoms", side: "top" }],
    formula_latex: input.formulaLatex ?? "2H_2 + O_2 \\rightarrow 2H_2O",
    caption: input.caption ?? "A balanced reaction conserves each atom across reactants and products.",
  };
}
