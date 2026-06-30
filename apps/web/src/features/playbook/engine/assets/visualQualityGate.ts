import { findAssetById } from "./assetRegistry";
import type {
  AnySnapshot,
  GeoMapSceneSnapshot,
  MetaStep,
  PhysicsForceSceneSnapshot,
  PlaybookScript,
  SnapshotKind,
} from "../types";

export type VisualQualityWarningCode =
  | "missing_pack_id"
  | "empty_physics_force_scene"
  | "missing_asset"
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
    }
  }

  return warnings;
}
