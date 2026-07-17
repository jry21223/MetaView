import { resolveAssetByRole, resolveAssetForRenderer } from "../../assets/assetResolver";
import type { SubjectVisualKitSubject } from "../../assets/assetRegistry";
import type {
  BioCellCallout,
  BioCellSceneSnapshot,
  BioCellStructure,
  BioProcessConnection,
  BioProcessSceneSnapshot,
  BioProcessStep,
} from "../../types";

const DEFAULT_BIOLOGY_PACK_ID = "biology-basic";
const DEFAULT_CORE_PACK_ID = "core-visual-basic";

type BioCellSceneInput = {
  packId?: string;
  cellType?: BioCellSceneSnapshot["cell_type"];
  structures?: BioCellStructureInput[];
  callouts?: BioCalloutInput[];
  caption?: string;
};

export type BioCellStructureInput = {
  id?: string;
  semanticRole?: string;
  semantic_role?: string;
  label?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  assetId?: string | null;
  asset_id?: string | null;
};

export type BioCalloutInput = {
  id?: string;
  targetId?: string;
  target_id?: string;
  label?: string;
  side?: BioCellCallout["side"];
};

type BioProcessSceneInput = {
  packId?: string;
  processId?: string;
  steps?: BioProcessStepInput[];
  connections?: BioProcessConnectionInput[];
  callouts?: BioCalloutInput[];
  caption?: string;
};

export type BioProcessStepInput = {
  id?: string;
  semanticRole?: string;
  semantic_role?: string;
  label?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  assetId?: string | null;
  asset_id?: string | null;
  description?: string | null;
};

export type BioProcessConnectionInput = {
  id?: string;
  from?: string;
  to?: string;
  semanticRole?: string;
  semantic_role?: string;
  label?: string | null;
  assetId?: string | null;
  asset_id?: string | null;
};

function resolveAssetIdByRole(
  rendererKind: "bio_cell_scene" | "bio_process_scene",
  subject: SubjectVisualKitSubject,
  packId: string,
  semanticRole: string,
  fallbacks: string[] = [],
): string | undefined {
  for (const role of [semanticRole, ...fallbacks]) {
    const asset =
      resolveAssetForRenderer(rendererKind, role, packId) ??
      resolveAssetByRole(subject, role, packId) ??
      resolveAssetForRenderer(rendererKind, role) ??
      resolveAssetByRole(subject, role);
    if (asset) return asset.id;
  }
  return undefined;
}

function numberOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function compileCallout(input: BioCalloutInput, index: number): BioCellCallout {
  const targetId = input.targetId ?? input.target_id ?? "cell";
  return {
    id: input.id ?? `${targetId}-callout-${index + 1}`,
    target_id: targetId,
    label: input.label ?? targetId,
    side: input.side,
  };
}

function compileStructure(input: BioCellStructureInput, packId: string, index: number): BioCellStructure {
  const semanticRole = input.semanticRole ?? input.semantic_role ?? "cell";
  return {
    id: input.id ?? `${semanticRole}-${index + 1}`,
    semantic_role: semanticRole,
    label: input.label ?? semanticRole,
    x: numberOr(input.x, 50),
    y: numberOr(input.y, 50),
    width: numberOr(input.width, 16),
    height: numberOr(input.height, 12),
    asset_id: input.assetId ?? input.asset_id ?? resolveAssetIdByRole("bio_cell_scene", "biology", packId, semanticRole),
  };
}

function defaultCellStructures(packId: string): BioCellStructure[] {
  return [
    {
      id: "cell",
      semantic_role: "cell",
      label: "cell membrane",
      x: 50,
      y: 52,
      width: 66,
      height: 50,
      asset_id: resolveAssetIdByRole("bio_cell_scene", "biology", packId, "cell"),
    },
    {
      id: "nucleus",
      semantic_role: "nucleus",
      label: "nucleus",
      x: 47,
      y: 48,
      width: 20,
      height: 18,
      asset_id: resolveAssetIdByRole("bio_cell_scene", "biology", packId, "nucleus"),
    },
    {
      id: "mitochondrion",
      semantic_role: "mitochondrion",
      label: "mitochondrion",
      x: 67,
      y: 59,
      width: 16,
      height: 10,
      asset_id: resolveAssetIdByRole("bio_cell_scene", "biology", packId, "mitochondrion"),
    },
    {
      id: "ribosome",
      semantic_role: "ribosome",
      label: "ribosome",
      x: 36,
      y: 61,
      width: 8,
      height: 7,
      asset_id: resolveAssetIdByRole("bio_cell_scene", "biology", packId, "ribosome"),
    },
    {
      id: "dna",
      semantic_role: "dna",
      label: "DNA",
      x: 47,
      y: 48,
      width: 8,
      height: 12,
      asset_id: resolveAssetIdByRole("bio_cell_scene", "biology", packId, "dna"),
    },
  ];
}

export function compileBioCellLayout(input: BioCellSceneInput): BioCellSceneSnapshot {
  const packId = input.packId ?? DEFAULT_BIOLOGY_PACK_ID;
  return {
    kind: "bio_cell_scene",
    pack_id: packId,
    cell_type: input.cellType ?? "animal",
    structures: input.structures?.length
      ? input.structures.map((structure, index) => compileStructure(structure, packId, index))
      : defaultCellStructures(packId),
    callouts: input.callouts?.length
      ? input.callouts.map(compileCallout)
      : [
          { id: "nucleus-callout", target_id: "nucleus", label: "stores DNA", side: "left" },
          { id: "mitochondrion-callout", target_id: "mitochondrion", label: "releases energy", side: "right" },
        ],
    caption: input.caption ?? "Animal cells contain specialized organelles with distinct functions.",
  };
}

function compileProcessStep(input: BioProcessStepInput, packId: string, index: number): BioProcessStep {
  const semanticRole = input.semanticRole ?? input.semantic_role ?? "process_step";
  return {
    id: input.id ?? `${semanticRole}-${index + 1}`,
    semantic_role: semanticRole,
    label: input.label ?? semanticRole,
    x: numberOr(input.x, 50),
    y: numberOr(input.y, 50),
    width: numberOr(input.width, 18),
    height: numberOr(input.height, 18),
    asset_id:
      input.assetId ??
      input.asset_id ??
      resolveAssetIdByRole("bio_process_scene", "biology", packId, semanticRole, ["process_step"]),
    description: input.description,
  };
}

function compileProcessConnection(input: BioProcessConnectionInput, index: number): BioProcessConnection {
  const semanticRole = input.semanticRole ?? input.semantic_role ?? "flow_arrow";
  const from = input.from ?? "step-1";
  const to = input.to ?? "step-2";
  return {
    id: input.id ?? `${from}-to-${to}-${index + 1}`,
    from,
    to,
    semantic_role: semanticRole,
    label: input.label,
    asset_id:
      input.assetId ??
      input.asset_id ??
      resolveAssetIdByRole("bio_process_scene", "core", DEFAULT_CORE_PACK_ID, semanticRole, ["flow_arrow", "causal_arrow"]),
  };
}

export function compileBioProcessLayout(input: BioProcessSceneInput): BioProcessSceneSnapshot {
  const packId = input.packId ?? DEFAULT_BIOLOGY_PACK_ID;
  const dnaAssetId = resolveAssetIdByRole("bio_process_scene", "biology", packId, "dna");
  const forkAssetId = resolveAssetIdByRole("bio_process_scene", "biology", packId, "process_step");
  const flowArrowAssetId = resolveAssetIdByRole("bio_process_scene", "core", DEFAULT_CORE_PACK_ID, "flow_arrow", [
    "causal_arrow",
  ]);

  return {
    kind: "bio_process_scene",
    pack_id: packId,
    process_id: input.processId ?? "dna_replication",
    steps: input.steps?.length
      ? input.steps.map((step, index) => compileProcessStep(step, packId, index))
      : [
          {
            id: "template",
            semantic_role: "dna",
            label: "template DNA",
            x: 22,
            y: 48,
            width: 18,
            height: 38,
            asset_id: dnaAssetId,
          },
          {
            id: "fork",
            semantic_role: "process_step",
            label: "replication fork",
            x: 50,
            y: 48,
            width: 24,
            height: 24,
            asset_id: forkAssetId,
            description: "strand separation and base pairing",
          },
          {
            id: "copy",
            semantic_role: "dna",
            label: "new strands",
            x: 78,
            y: 48,
            width: 18,
            height: 38,
            asset_id: dnaAssetId,
          },
        ],
    connections: input.connections?.length
      ? input.connections.map(compileProcessConnection)
      : [
          {
            id: "template-to-fork",
            from: "template",
            to: "fork",
            semantic_role: "flow_arrow",
            label: "unzip",
            asset_id: flowArrowAssetId,
          },
          {
            id: "fork-to-copy",
            from: "fork",
            to: "copy",
            semantic_role: "flow_arrow",
            label: "copy",
            asset_id: flowArrowAssetId,
          },
        ],
    callouts: input.callouts?.length
      ? input.callouts.map(compileCallout)
      : [{ id: "base-pairing", target_id: "fork", label: "base pairing", side: "top" }],
    caption: input.caption ?? "DNA replication copies each strand by complementary base pairing.",
  };
}
