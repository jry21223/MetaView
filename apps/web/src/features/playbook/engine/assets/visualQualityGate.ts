import { findAssetById, findAssetByRole } from "./assetRegistry";
import type {
  AnySnapshot,
  BioCellSceneSnapshot,
  GeoMapSceneSnapshot,
  MetaStep,
  Molecule2DSceneSnapshot,
  PhysicsForceSceneSnapshot,
  PlaybookScript,
  SnapshotKind,
} from "../types";

export type VisualQualityWarningCode =
  | "missing_pack_id"
  | "empty_physics_force_scene"
  | "missing_asset"
  | "low_biology_structure_assets"
  | "low_chemistry_structure_data"
  | "unsupported_array_fallback";

export interface VisualQualityWarning {
  code: VisualQualityWarningCode;
  step_id: string;
  snapshot_kind: SnapshotKind;
  message: string;
  domain?: string;
  asset_id?: string;
  pack_id?: string | null;
  snapshot_path?: string;
}

const ARRAY_FALLBACK_BLOCKED_DOMAINS = new Set(["geography", "biology", "chemistry"]);

interface SnapshotContext {
  domain: string;
  step: MetaStep;
  snapshot: AnySnapshot;
  snapshotPath: string;
}

function warn(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  warning: Omit<VisualQualityWarning, "step_id" | "snapshot_kind" | "snapshot_path">,
) {
  warnings.push({
    step_id: context.step.step_id,
    snapshot_kind: context.snapshot.kind,
    snapshot_path: context.snapshotPath,
    ...warning,
  });
}

function collectStepSnapshots(step: MetaStep): Array<{ snapshot: AnySnapshot; snapshotPath: string }> {
  const snapshots = [{ snapshot: step.snapshot, snapshotPath: "snapshot" }];
  for (const [index, layer] of step.layers?.entries() ?? []) {
    snapshots.push({ snapshot: layer.body, snapshotPath: `layers[${index}].body` });
  }
  return snapshots;
}

function assetResolves(assetId: string | null | undefined, packId: string | null | undefined): boolean {
  if (!assetId) return true;
  return Boolean(findAssetById(assetId, packId));
}

function checkAssetId(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  assetId: string | null | undefined,
  packId: string | null | undefined,
) {
  if (!assetId || assetResolves(assetId, packId)) return;
  warn(warnings, context, {
    code: "missing_asset",
    domain: context.domain,
    asset_id: assetId,
    pack_id: packId,
    message: `Asset "${assetId}" could not be resolved from pack "${packId ?? "any"}".`,
  });
}

function checkGeoMapScene(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  snapshot: GeoMapSceneSnapshot,
) {
  if (!snapshot.pack_id) {
    warn(warnings, context, {
      code: "missing_pack_id",
      domain: context.domain,
      pack_id: snapshot.pack_id,
      message: "geography geo_map_scene should declare pack_id so visual assets resolve deterministically.",
    });
  }

  for (const layer of snapshot.layers) {
    checkAssetId(warnings, context, layer.asset_id, snapshot.pack_id);
  }
  for (const flow of snapshot.flows) {
    checkAssetId(warnings, context, flow.asset_id, snapshot.pack_id);
  }
}

function checkPhysicsForceScene(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  snapshot: PhysicsForceSceneSnapshot,
) {
  const hasObject = snapshot.objects.length > 0;
  const hasVector = snapshot.vectors.length > 0;
  const hasTrajectory = (snapshot.trajectory?.length ?? 0) > 0;
  if (!hasObject && !hasVector && !hasTrajectory) {
    warn(warnings, context, {
      code: "empty_physics_force_scene",
      domain: context.domain,
      pack_id: snapshot.pack_id,
      message: "physics_force_scene should include at least one object, vector, or trajectory.",
    });
  }

  for (const object of snapshot.objects) {
    checkAssetId(warnings, context, object.asset_id, snapshot.pack_id);
  }
}

function checkBioCellScene(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  snapshot: BioCellSceneSnapshot,
) {
  const assetBackedStructures = snapshot.structures.filter((structure) => {
    if (structure.asset_id) return assetResolves(structure.asset_id, snapshot.pack_id);
    return Boolean(findAssetByRole("biology", structure.semantic_role, snapshot.pack_id));
  });

  if (assetBackedStructures.length < 2) {
    warn(warnings, context, {
      code: "low_biology_structure_assets",
      domain: context.domain,
      pack_id: snapshot.pack_id,
      message: "bio_cell_scene should include at least two resolvable biology structure assets.",
    });
  }

  for (const structure of snapshot.structures) {
    checkAssetId(warnings, context, structure.asset_id, snapshot.pack_id);
  }
}

function checkMolecule2DScene(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  snapshot: Molecule2DSceneSnapshot,
) {
  const moleculeAssetResolves = snapshot.molecule_asset_id
    ? assetResolves(snapshot.molecule_asset_id, snapshot.pack_id)
    : Boolean(findAssetByRole("chemistry", "molecule", snapshot.pack_id));

  if (snapshot.atoms.length < 2 || snapshot.bonds.length < 1 || !moleculeAssetResolves) {
    warn(warnings, context, {
      code: "low_chemistry_structure_data",
      domain: context.domain,
      pack_id: snapshot.pack_id,
      message: "molecule_2d_scene should include structured atoms, bonds, and a resolvable molecule preset asset.",
    });
  }

  checkAssetId(warnings, context, snapshot.molecule_asset_id, snapshot.pack_id);
  for (const atom of snapshot.atoms) {
    checkAssetId(warnings, context, atom.asset_id, snapshot.pack_id);
  }
  for (const bond of snapshot.bonds) {
    checkAssetId(warnings, context, bond.asset_id, snapshot.pack_id);
  }
}

function checkUnsupportedArrayFallback(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
) {
  if (context.snapshot.kind !== "algorithm_array") return;
  if (!ARRAY_FALLBACK_BLOCKED_DOMAINS.has(context.domain)) return;

  warn(warnings, context, {
    code: "unsupported_array_fallback",
    domain: context.domain,
    message: `${context.domain} scenes should not fall back to algorithm_array.`,
  });
}

export function visualQualityGate(script: PlaybookScript): VisualQualityWarning[] {
  const warnings: VisualQualityWarning[] = [];

  for (const step of script.steps) {
    for (const { snapshot, snapshotPath } of collectStepSnapshots(step)) {
      const context: SnapshotContext = {
        domain: script.domain,
        step,
        snapshot,
        snapshotPath,
      };

      checkUnsupportedArrayFallback(warnings, context);
      if (snapshot.kind === "geo_map_scene") {
        checkGeoMapScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "physics_force_scene") {
        checkPhysicsForceScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "bio_cell_scene") {
        checkBioCellScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "molecule_2d_scene") {
        checkMolecule2DScene(warnings, context, snapshot);
      }
    }
  }

  return warnings;
}
