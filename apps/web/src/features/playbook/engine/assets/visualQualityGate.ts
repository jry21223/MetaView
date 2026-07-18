import {
  findAssetById as findRegisteredAssetById,
  findAssetByRole as findRegisteredAssetByRole,
  getAssetPack,
  getAssetTeachingUse,
  type AssetManifestEntry,
  type SubjectVisualKitSubject,
} from "./assetRegistry";
import { getLicenseRule, isKnownAssetLicense } from "./licenseRegistry";
import { resolveSceneAssetContract } from "./sceneContracts";
import type {
  AlgorithmArraySnapshot,
  AlgorithmBarsSnapshot,
  AlgorithmTreeSnapshot,
  AnySnapshot,
  BioCellSceneSnapshot,
  BioProcessSceneSnapshot,
  CallStackFrame,
  CallStackSceneSnapshot,
  CodeTraceSceneSnapshot,
  GeoMapSceneSnapshot,
  GraphSceneSnapshot,
  MathPlotSnapshot,
  MetaStep,
  Molecule2DSceneSnapshot,
  PhysicsForceSceneSnapshot,
  PlaybookScript,
  ReactionSceneSnapshot,
  SnapshotKind,
} from "../types";

export type VisualQualityWarningCode =
  | "missing_pack_id"
  | "empty_physics_force_scene"
  | "missing_asset"
  | "asset_requires_attribution"
  | "asset_commercial_use_restricted"
  | "asset_share_alike"
  | "asset_unknown_license"
  | "asset_not_approved_for_teaching"
  | "low_biology_structure_assets"
  | "low_biology_process_assets"
  | "low_chemistry_structure_data"
  | "low_chemistry_reaction_assets"
  | "low_algorithm_state_visuals"
  | "low_math_visual_richness"
  | "possible_label_overlap"
  | "scene_contract_missing_asset"
  | "unsupported_array_fallback";

export interface VisualQualityWarning {
  code: VisualQualityWarningCode;
  step_id: string;
  snapshot_kind: SnapshotKind;
  message: string;
  domain?: string;
  asset_id?: string;
  pack_id?: string | null;
  license?: AssetManifestEntry["license"];
  commercialUseStatus?: AssetManifestEntry["commercialUseStatus"];
  attribution?: string | null;
  sourceUrl?: string | null;
  licenseUrl?: string | null;
  shareAlike?: boolean;
  label_ids?: [string, string];
  contract_id?: string;
  scene_template?: string;
  rendered_asset_ids?: string[];
  snapshot_path?: string;
}

const ARRAY_FALLBACK_BLOCKED_DOMAINS = new Set(["geography", "biology", "chemistry"]);

export interface VisualQualityGateOptions {
  findAssetById?: typeof findRegisteredAssetById;
  findAssetByRole?: typeof findRegisteredAssetByRole;
}

export interface SceneContractCoverage {
  contractId: string;
  sceneTemplate: string;
  rendererKind: SnapshotKind;
  packId: string;
  stepId: string;
  snapshotPath: string;
  requiredAssetIds: string[];
  renderedAssetIds: string[];
  missingAssetIds: string[];
}

interface AssetLookup {
  findAssetById: typeof findRegisteredAssetById;
  findAssetByRole: typeof findRegisteredAssetByRole;
}

interface SnapshotContext {
  domain: string;
  step: MetaStep;
  snapshot: AnySnapshot;
  snapshotPath: string;
  assets: AssetLookup;
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

function resolveAsset(
  context: SnapshotContext,
  assetId: string | null | undefined,
  packId: string | null | undefined,
): AssetManifestEntry | undefined {
  if (!assetId) return undefined;
  return context.assets.findAssetById(assetId, packId);
}

function checkAssetPolicy(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  asset: AssetManifestEntry,
  packId: string | null | undefined,
) {
  const licenseRule = getLicenseRule(asset.license);
  const warningBase = {
    domain: context.domain,
    asset_id: asset.id,
    pack_id: packId,
    license: asset.license,
    commercialUseStatus: asset.commercialUseStatus,
    attribution: asset.attribution,
    sourceUrl: asset.sourceUrl,
    licenseUrl: asset.licenseUrl,
  };

  const registeredPack = packId ? getAssetPack(packId) : undefined;
  if (asset.teachingUse || registeredPack) {
    const teachingUse = getAssetTeachingUse(asset, packId);
    if (teachingUse === "experimental" || teachingUse === "ui") {
      warn(warnings, context, {
        ...warningBase,
        code: "asset_not_approved_for_teaching",
        message: `Asset "${asset.id}" is classified as ${teachingUse} and is not approved for formal teaching scenes.`,
      });
    }
  }

  if (!isKnownAssetLicense(asset.license)) {
    warn(warnings, context, {
      ...warningBase,
      code: "asset_unknown_license",
      message: `Asset "${asset.id}" uses an unknown license and must not enter commercial export or external exposure.`,
    });
  }

  if (!asset.commercialUseAllowed || !licenseRule.commercialUseAllowed || asset.commercialUseStatus === "restricted") {
    warn(warnings, context, {
      ...warningBase,
      code: "asset_commercial_use_restricted",
      message: `Asset "${asset.id}" is not marked safe for commercial use.`,
    });
  }

  if (asset.requiresAttribution || licenseRule.requiresAttribution) {
    warn(warnings, context, {
      ...warningBase,
      code: "asset_requires_attribution",
      message: `Asset "${asset.id}" requires attribution before export.`,
    });
  }

  if (asset.shareAlike || licenseRule.shareAlike) {
    warn(warnings, context, {
      ...warningBase,
      code: "asset_share_alike",
      shareAlike: true,
      message: `Asset "${asset.id}" carries share-alike obligations.`,
    });
  }
}

function checkAssetId(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  assetId: string | null | undefined,
  packId: string | null | undefined,
) {
  if (!assetId) return;
  const asset = resolveAsset(context, assetId, packId);
  if (asset) {
    checkAssetPolicy(warnings, context, asset, packId);
    return;
  }
  warn(warnings, context, {
    code: "missing_asset",
    domain: context.domain,
    asset_id: assetId,
    pack_id: packId,
    message: `Asset "${assetId}" could not be resolved from pack "${packId ?? "any"}".`,
  });
}

function checkAssetIdFromPackOrAny(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  assetId: string | null | undefined,
  preferredPackId: string | null | undefined,
) {
  if (!assetId) return;
  const asset = resolveAsset(context, assetId, preferredPackId) ?? resolveAsset(context, assetId, undefined);
  if (asset) {
    checkAssetPolicy(warnings, context, asset, preferredPackId);
    return;
  }
  warn(warnings, context, {
    code: "missing_asset",
    domain: context.domain,
    asset_id: assetId,
    pack_id: preferredPackId,
    message: `Asset "${assetId}" could not be resolved from pack "${preferredPackId ?? "any"}" or any registered pack.`,
  });
}

interface LabelRect {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function labelRect(
  id: string,
  label: string | null | undefined,
  x: number,
  y: number,
  anchor: "start" | "middle" | "end" = "middle",
): LabelRect | undefined {
  const trimmed = label?.trim();
  if (!trimmed) return undefined;
  const width = Math.max(8, Math.min(34, trimmed.length * 1.35 + 4));
  const height = 5.4;
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  return { id, label: trimmed, x: left, y: y - height, width, height };
}

function rectsOverlap(first: LabelRect, second: LabelRect): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function checkLabelOverlaps(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  rects: Array<LabelRect | undefined>,
) {
  const labels = rects.filter((rect): rect is LabelRect => Boolean(rect));
  for (let firstIndex = 0; firstIndex < labels.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < labels.length; secondIndex += 1) {
      const first = labels[firstIndex];
      const second = labels[secondIndex];
      if (!rectsOverlap(first, second)) continue;
      warn(warnings, context, {
        code: "possible_label_overlap",
        domain: context.domain,
        label_ids: [first.id, second.id],
        message: `Labels "${first.label}" and "${second.label}" may overlap in ${context.snapshot.kind}.`,
      });
      return;
    }
  }
}

function addAssetId(assetIds: Set<string>, assetId: string | null | undefined) {
  if (assetId) assetIds.add(assetId);
}

function addResolvedRoleAssetId(
  assetIds: Set<string>,
  context: SnapshotContext,
  subject: SubjectVisualKitSubject,
  semanticRole: string,
  packId: string | null | undefined,
  fallbacks: string[] = [],
) {
  for (const role of [semanticRole, ...fallbacks]) {
    const asset =
      context.assets.findAssetByRole(subject, role, packId) ?? context.assets.findAssetByRole(subject, role);
    if (asset) {
      assetIds.add(asset.id);
      return;
    }
  }
}

function addBioCellRenderedAssetIds(
  assetIds: Set<string>,
  context: SnapshotContext,
  snapshot: BioCellSceneSnapshot,
) {
  for (const structure of snapshot.structures) {
    if (structure.asset_id) {
      assetIds.add(structure.asset_id);
      continue;
    }
    addResolvedRoleAssetId(assetIds, context, "biology", structure.semantic_role, snapshot.pack_id);
  }
}

function addBioProcessRenderedAssetIds(
  assetIds: Set<string>,
  context: SnapshotContext,
  snapshot: BioProcessSceneSnapshot,
) {
  for (const processStep of snapshot.steps) {
    if (processStep.asset_id) {
      assetIds.add(processStep.asset_id);
      continue;
    }
    addResolvedRoleAssetId(assetIds, context, "biology", processStep.semantic_role, snapshot.pack_id, ["process_step"]);
  }
  for (const connection of snapshot.connections ?? []) {
    if (connection.asset_id) {
      assetIds.add(connection.asset_id);
      continue;
    }
    addResolvedRoleAssetId(assetIds, context, "core", connection.semantic_role, "core-visual-basic", [
      "flow_arrow",
      "causal_arrow",
    ]);
  }
}

type GraphNodeVisualState = "current" | "queue" | "visited" | "default";

function graphNodeVisualState(
  nodeId: string,
  currentNodes: Set<string>,
  visitedNodes: Set<string>,
  queueNodes: Set<string>,
): GraphNodeVisualState {
  if (currentNodes.has(nodeId)) return "current";
  if (queueNodes.has(nodeId)) return "queue";
  if (visitedNodes.has(nodeId)) return "visited";
  return "default";
}

function graphNodeRoleForState(state: GraphNodeVisualState): string {
  if (state === "queue") return "queue";
  if (state === "visited") return "visited";
  return "graph_node";
}

function addGraphRenderedAssetIds(
  assetIds: Set<string>,
  context: SnapshotContext,
  snapshot: GraphSceneSnapshot,
) {
  addAssetId(assetIds, snapshot.asset_id);
  const currentNodes = new Set([
    ...(snapshot.active_node_ids ?? []),
    ...(snapshot.current_node_id ? [snapshot.current_node_id] : []),
  ]);
  const visitedNodes = new Set(snapshot.visited_node_ids ?? []);
  const queueNodes = new Set([...(snapshot.queue_node_ids ?? []), ...(snapshot.frontier_node_ids ?? [])]);
  const activeEdges = new Set(snapshot.active_edge_ids ?? []);

  for (const node of snapshot.nodes ?? []) {
    if (node.asset_id) {
      assetIds.add(node.asset_id);
      continue;
    }
    const state = graphNodeVisualState(node.id, currentNodes, visitedNodes, queueNodes);
    addResolvedRoleAssetId(assetIds, context, "algorithm", graphNodeRoleForState(state), snapshot.pack_id, [
      "graph_node",
    ]);
  }

  for (const edge of snapshot.edges ?? []) {
    if (edge.asset_id) {
      assetIds.add(edge.asset_id);
      continue;
    }
    const edgeId = edge.id ?? `${edge.source}-${edge.target}`;
    const active = edge.emphasis === "accent" || activeEdges.has(edgeId);
    addResolvedRoleAssetId(assetIds, context, "algorithm", active ? "active_edge" : "graph_edge", snapshot.pack_id);
  }
}

function callStackFrameRole(frame: CallStackFrame, currentFrameId: string | null | undefined): string {
  if (frame.asset_id) return frame.asset_id === "call-frame" ? "call_frame" : "stack_frame";
  return frame.state === "active" || frame.id === currentFrameId ? "call_frame" : "stack_frame";
}

function addCallStackRenderedAssetIds(
  assetIds: Set<string>,
  context: SnapshotContext,
  snapshot: CallStackSceneSnapshot,
) {
  addAssetId(assetIds, snapshot.asset_id);
  for (const frame of snapshot.frames ?? []) {
    if (frame.asset_id) {
      assetIds.add(frame.asset_id);
      continue;
    }
    addResolvedRoleAssetId(
      assetIds,
      context,
      "algorithm",
      callStackFrameRole(frame, snapshot.current_frame_id),
      snapshot.pack_id,
    );
  }
  if ((snapshot.code_trace?.active_lines?.length ?? 0) > 0 || snapshot.code_trace?.active_line !== undefined) {
    if (snapshot.code_trace?.asset_id) {
      assetIds.add(snapshot.code_trace.asset_id);
    } else {
      addResolvedRoleAssetId(assetIds, context, "algorithm", "active_line", snapshot.pack_id);
    }
  }
}

function addCodeTraceRenderedAssetIds(
  assetIds: Set<string>,
  context: SnapshotContext,
  snapshot: CodeTraceSceneSnapshot,
) {
  addAssetId(assetIds, snapshot.asset_id);
  if ((snapshot.active_lines?.length ?? 0) > 0 || snapshot.active_line !== undefined) {
    if (snapshot.active_line_asset_id) {
      assetIds.add(snapshot.active_line_asset_id);
    } else {
      addResolvedRoleAssetId(assetIds, context, "algorithm", "active_line", snapshot.pack_id);
    }
  }
  for (const pointer of snapshot.pointers ?? []) {
    if (pointer.asset_id) {
      assetIds.add(pointer.asset_id);
      continue;
    }
    addResolvedRoleAssetId(assetIds, context, "algorithm", "pointer", snapshot.pack_id, [
      "active_pointer",
      "index_pointer",
    ]);
  }
  if ((snapshot.array_values?.length ?? 0) > 0) {
    addResolvedRoleAssetId(assetIds, context, "core", "flow_arrow", "core-visual-basic");
  }
}

function addMoleculeRenderedAssetIds(
  assetIds: Set<string>,
  context: SnapshotContext,
  snapshot: Molecule2DSceneSnapshot,
) {
  if (snapshot.molecule_asset_id) {
    assetIds.add(snapshot.molecule_asset_id);
  } else {
    addResolvedRoleAssetId(assetIds, context, "chemistry", snapshot.molecule_id, snapshot.pack_id);
  }

  for (const atom of snapshot.atoms) {
    if (atom.asset_id) {
      assetIds.add(atom.asset_id);
      continue;
    }
    addResolvedRoleAssetId(assetIds, context, "chemistry", "atom", snapshot.pack_id);
  }
  for (const bond of snapshot.bonds) {
    if (bond.asset_id) {
      assetIds.add(bond.asset_id);
      continue;
    }
    addResolvedRoleAssetId(assetIds, context, "chemistry", "bond", snapshot.pack_id);
  }
}

function addReactionRenderedAssetIds(
  assetIds: Set<string>,
  context: SnapshotContext,
  snapshot: ReactionSceneSnapshot,
) {
  for (const participant of [...snapshot.reactants, ...snapshot.products]) {
    addAssetId(assetIds, participant.asset_id);
  }
  for (const arrow of snapshot.arrows) {
    if (arrow.asset_id) {
      assetIds.add(arrow.asset_id);
      continue;
    }
    addResolvedRoleAssetId(assetIds, context, "chemistry", arrow.semantic_role, snapshot.pack_id);
  }
  for (const electronFlow of snapshot.electron_flows ?? []) {
    if (electronFlow.asset_id) {
      assetIds.add(electronFlow.asset_id);
      continue;
    }
    addResolvedRoleAssetId(assetIds, context, "chemistry", electronFlow.semantic_role, snapshot.pack_id);
  }
}

function addGeoMapRenderedAssetIds(
  assetIds: Set<string>,
  context: SnapshotContext,
  snapshot: GeoMapSceneSnapshot,
) {
  for (const layer of snapshot.layers) {
    if (layer.asset_id) {
      assetIds.add(layer.asset_id);
      continue;
    }
    addResolvedRoleAssetId(assetIds, context, "geography", layer.semantic_role, snapshot.pack_id);
  }
  for (const flow of snapshot.flows) {
    if (flow.asset_id) {
      assetIds.add(flow.asset_id);
      continue;
    }
    addResolvedRoleAssetId(assetIds, context, "geography", flow.semantic_role, snapshot.pack_id, ["wind"]);
  }
}

function addPhysicsRenderedAssetIds(
  assetIds: Set<string>,
  context: SnapshotContext,
  snapshot: PhysicsForceSceneSnapshot,
) {
  for (const object of snapshot.objects) {
    if (object.asset_id) {
      assetIds.add(object.asset_id);
      continue;
    }
    addResolvedRoleAssetId(assetIds, context, "physics", "object", snapshot.pack_id);
  }
  for (const vector of snapshot.vectors) {
    addResolvedRoleAssetId(assetIds, context, "physics", vector.semantic_role, snapshot.pack_id);
  }
}

function addMathPlotRenderedAssetIds(
  assetIds: Set<string>,
  context: SnapshotContext,
  snapshot: MathPlotSnapshot,
) {
  if (snapshot.asset_id) {
    assetIds.add(snapshot.asset_id);
    return;
  }
  for (const curve of snapshot.curves) {
    if (!curve.semantic_role) continue;
    addResolvedRoleAssetId(assetIds, context, "math", curve.semantic_role, snapshot.pack_id);
  }
}

function collectRenderedAssetIds(context: SnapshotContext): Set<string> {
  const assetIds = new Set<string>();
  const { snapshot } = context;
  if (snapshot.kind === "geo_map_scene") addGeoMapRenderedAssetIds(assetIds, context, snapshot);
  if (snapshot.kind === "physics_force_scene") addPhysicsRenderedAssetIds(assetIds, context, snapshot);
  if (snapshot.kind === "math_plot") addMathPlotRenderedAssetIds(assetIds, context, snapshot);
  if (snapshot.kind === "bio_cell_scene") addBioCellRenderedAssetIds(assetIds, context, snapshot);
  if (snapshot.kind === "bio_process_scene") addBioProcessRenderedAssetIds(assetIds, context, snapshot);
  if (snapshot.kind === "molecule_2d_scene") addMoleculeRenderedAssetIds(assetIds, context, snapshot);
  if (snapshot.kind === "reaction_scene") addReactionRenderedAssetIds(assetIds, context, snapshot);
  if (snapshot.kind === "graph_scene") addGraphRenderedAssetIds(assetIds, context, snapshot);
  if (snapshot.kind === "call_stack_scene") addCallStackRenderedAssetIds(assetIds, context, snapshot);
  if (snapshot.kind === "code_trace_scene") addCodeTraceRenderedAssetIds(assetIds, context, snapshot);
  return assetIds;
}

function checkSceneAssetContract(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
) {
  const contract = resolveSceneAssetContract(context.step.step_id, context.snapshot);
  if (!contract) return;

  const renderedAssetIds = collectRenderedAssetIds(context);
  for (const assetId of contract.requiredAssetIds) {
    if (renderedAssetIds.has(assetId)) continue;
    warn(warnings, context, {
      code: "scene_contract_missing_asset",
      domain: context.domain,
      asset_id: assetId,
      pack_id: contract.packId,
      contract_id: contract.id,
      scene_template: contract.sceneTemplate,
      rendered_asset_ids: [...renderedAssetIds].sort(),
      message: `Scene contract "${contract.id}" requires rendered asset "${assetId}".`,
    });
  }
}

function clampPercent(value: number): number {
  return Math.max(4, Math.min(96, value));
}

function geoPressureLabelPosition(
  center: { x: number; y: number },
  centers: Array<{ x: number; y: number }>,
  index: number,
): { x: number; y: number; anchor: "middle" | "start" | "end" } {
  const overlapsEarlier = centers
    .slice(0, index)
    .some((other) => Math.abs(center.x - other.x) < 18 && Math.abs(center.y - other.y) < 14);
  if (!overlapsEarlier) {
    return { x: clampPercent(center.x), y: clampPercent(center.y - 8.2), anchor: "middle" };
  }

  const side = index % 2 === 0 ? -1 : 1;
  return {
    x: clampPercent(center.x + side * 11),
    y: clampPercent(center.y + (center.y < 52 ? 10 : -10)),
    anchor: side > 0 ? "start" : "end",
  };
}

function bioCalloutLabelRect(
  callout: { id: string; target_id: string; label: string; side?: "left" | "right" | "top" | "bottom" },
  target: { x: number; y: number } | undefined,
): LabelRect | undefined {
  if (!target) return undefined;
  const side = callout.side ?? (target.x < 50 ? "left" : "right");
  if (side === "left") {
    return labelRect(`callout:${callout.id}`, callout.label, Math.max(7, target.x - 32) - 2, target.y - 7, "end");
  }
  if (side === "top") {
    return labelRect(`callout:${callout.id}`, callout.label, target.x, Math.max(20, target.y - 24), "middle");
  }
  if (side === "bottom") {
    return labelRect(`callout:${callout.id}`, callout.label, target.x, Math.min(86, target.y + 24), "middle");
  }
  return labelRect(`callout:${callout.id}`, callout.label, Math.min(93, target.x + 32) + 2, target.y - 7, "start");
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

  checkLabelOverlaps(
    warnings,
    context,
    (snapshot.pressure_centers ?? []).map((center, index, centers) => {
      const position = geoPressureLabelPosition(center, centers, index);
      return labelRect(`pressure:${center.id}`, center.label, position.x, position.y, position.anchor);
    }),
  );
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
    if (structure.asset_id) return Boolean(resolveAsset(context, structure.asset_id, snapshot.pack_id));
    return Boolean(context.assets.findAssetByRole("biology", structure.semantic_role, snapshot.pack_id));
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

  checkLabelOverlaps(
    warnings,
    context,
    (snapshot.callouts ?? []).map((callout) =>
      bioCalloutLabelRect(callout, snapshot.structures.find((structure) => structure.id === callout.target_id)),
    ),
  );
}

function checkBioProcessScene(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  snapshot: BioProcessSceneSnapshot,
) {
  const assetBackedSteps = snapshot.steps.filter((processStep) => {
    if (processStep.asset_id) {
      return (
        Boolean(resolveAsset(context, processStep.asset_id, snapshot.pack_id)) ||
        Boolean(resolveAsset(context, processStep.asset_id, undefined))
      );
    }
    return Boolean(context.assets.findAssetByRole("biology", processStep.semantic_role, snapshot.pack_id));
  });

  const hasProcessRelation = (snapshot.connections?.length ?? 0) > 0 || (snapshot.callouts?.length ?? 0) > 0;
  if (assetBackedSteps.length < 2 || !hasProcessRelation) {
    warn(warnings, context, {
      code: "low_biology_process_assets",
      domain: context.domain,
      pack_id: snapshot.pack_id,
      message: "bio_process_scene should include at least two resolvable process assets plus a connection or callout.",
    });
  }

  for (const processStep of snapshot.steps) {
    checkAssetId(warnings, context, processStep.asset_id, snapshot.pack_id);
  }
  for (const connection of snapshot.connections ?? []) {
    checkAssetIdFromPackOrAny(warnings, context, connection.asset_id, snapshot.pack_id);
  }
}

function checkMolecule2DScene(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  snapshot: Molecule2DSceneSnapshot,
) {
  const moleculeAssetResolves = snapshot.molecule_asset_id
    ? Boolean(resolveAsset(context, snapshot.molecule_asset_id, snapshot.pack_id))
    : Boolean(context.assets.findAssetByRole("chemistry", "molecule", snapshot.pack_id));

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

  checkLabelOverlaps(
    warnings,
    context,
    (snapshot.callouts ?? []).map((callout) =>
      bioCalloutLabelRect(callout, snapshot.atoms.find((atom) => atom.id === callout.target_id)),
    ),
  );
}

function checkReactionScene(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  snapshot: ReactionSceneSnapshot,
) {
  const hasParticipants = snapshot.reactants.length > 0 && snapshot.products.length > 0;
  const hasReactionGeometry = snapshot.arrows.length > 0;

  if (!hasParticipants || !hasReactionGeometry) {
    warn(warnings, context, {
      code: "low_chemistry_reaction_assets",
      domain: context.domain,
      pack_id: snapshot.pack_id,
      message: "reaction_scene should include reactants, products, and at least one reaction arrow.",
    });
  }

  for (const participant of [...snapshot.reactants, ...snapshot.products]) {
    checkAssetId(warnings, context, participant.asset_id, snapshot.pack_id);
  }
  for (const arrow of snapshot.arrows) {
    checkAssetId(warnings, context, arrow.asset_id, snapshot.pack_id);
  }
  for (const electronFlow of snapshot.electron_flows ?? []) {
    checkAssetId(warnings, context, electronFlow.asset_id, snapshot.pack_id);
  }
}

function checkAlgorithmLinearScene(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  snapshot: AlgorithmArraySnapshot | AlgorithmBarsSnapshot,
) {
  if (context.domain !== "algorithm") return;

  const hasDataStructure =
    snapshot.kind === "algorithm_bars" ? snapshot.numeric_values.length > 0 : snapshot.array_values.length > 0;
  const hasStateChange = Boolean(
    snapshot.active_indices.length > 0 ||
      snapshot.swap_indices.length > 0 ||
      snapshot.sorted_indices.length > 0 ||
      Object.keys(snapshot.pointers).length > 0,
  );
  if (hasDataStructure && !hasStateChange) {
    warn(warnings, context, {
      code: "low_algorithm_state_visuals",
      domain: context.domain,
      message: `algorithm ${snapshot.kind} should show an active index, pointer, swap, or sorted state.`,
    });
  }
}

function checkAlgorithmTreeScene(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  snapshot: AlgorithmTreeSnapshot,
) {
  if (context.domain !== "algorithm") return;

  const hasTreeStructure = snapshot.nodes.length > 0 && snapshot.edges.length > 0;
  const hasTraversalState = Boolean(
    snapshot.active_node_ids.length > 0 || snapshot.visited_node_ids.length > 0 || snapshot.path_edge_ids.length > 0,
  );
  if (hasTreeStructure && !hasTraversalState) {
    warn(warnings, context, {
      code: "low_algorithm_state_visuals",
      domain: context.domain,
      message: "algorithm algorithm_tree should show an active node, visited node, or highlighted path edge.",
    });
  }
}

function checkGraphScene(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  snapshot: GraphSceneSnapshot,
) {
  if (context.domain !== "algorithm") return;

  checkAssetId(warnings, context, snapshot.asset_id, snapshot.pack_id);
  for (const node of snapshot.nodes ?? []) {
    checkAssetId(warnings, context, node.asset_id, snapshot.pack_id);
  }
  for (const edge of snapshot.edges ?? []) {
    checkAssetId(warnings, context, edge.asset_id, snapshot.pack_id);
  }

  const hasGraphStructure = (snapshot.nodes?.length ?? 0) > 0 && (snapshot.edges?.length ?? 0) > 0;
  const hasStateChange = Boolean(
    snapshot.current_node_id ||
      (snapshot.active_node_ids?.length ?? 0) > 0 ||
      (snapshot.active_edge_ids?.length ?? 0) > 0 ||
      (snapshot.visited_node_ids?.length ?? 0) > 0 ||
      (snapshot.queue_node_ids?.length ?? 0) > 0 ||
      (snapshot.frontier_node_ids?.length ?? 0) > 0,
  );

  if (hasGraphStructure && !hasStateChange) {
    warn(warnings, context, {
      code: "low_algorithm_state_visuals",
      domain: context.domain,
      pack_id: snapshot.pack_id,
      message: "algorithm graph_scene should show an active, visited, queued, or frontier state change.",
    });
  }
}

function checkCallStackScene(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  snapshot: CallStackSceneSnapshot,
) {
  if (context.domain !== "algorithm") return;

  checkAssetId(warnings, context, snapshot.asset_id, snapshot.pack_id);
  for (const frame of snapshot.frames ?? []) {
    checkAssetId(warnings, context, frame.asset_id, snapshot.pack_id);
  }
  checkAssetId(warnings, context, snapshot.code_trace?.asset_id, snapshot.pack_id);

  const hasFrames = (snapshot.frames?.length ?? 0) > 0;
  const hasActiveFrame = Boolean(
    snapshot.current_frame_id || (snapshot.frames ?? []).some((frame) => frame.state === "active"),
  );
  if (hasFrames && !hasActiveFrame) {
    warn(warnings, context, {
      code: "low_algorithm_state_visuals",
      domain: context.domain,
      pack_id: snapshot.pack_id,
      message: "algorithm call_stack_scene should show a current or active stack frame.",
    });
  }
}

function checkCodeTraceScene(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  snapshot: CodeTraceSceneSnapshot,
) {
  if (context.domain !== "algorithm") return;

  checkAssetId(warnings, context, snapshot.asset_id, snapshot.pack_id);
  checkAssetId(warnings, context, snapshot.active_line_asset_id, snapshot.pack_id);
  for (const pointer of snapshot.pointers ?? []) {
    checkAssetId(warnings, context, pointer.asset_id, snapshot.pack_id);
  }

  const hasTraceState = Boolean(
    (snapshot.active_lines?.length ?? 0) > 0 ||
      (snapshot.active_indices?.length ?? 0) > 0 ||
      (snapshot.pointers?.length ?? 0) > 0,
  );
  if ((snapshot.lines?.length ?? 0) > 0 && !hasTraceState) {
    warn(warnings, context, {
      code: "low_algorithm_state_visuals",
      domain: context.domain,
      pack_id: snapshot.pack_id,
      message: "algorithm code_trace_scene should show an active line, active index, or pointer state.",
    });
  }
}

function hasMathFormula(snapshot: AnySnapshot): boolean {
  if (snapshot.kind === "math_formula") return Boolean(snapshot.formula_latex?.trim());
  if (snapshot.kind === "katex_overlay") return Boolean(snapshot.latex?.trim());
  if (snapshot.kind === "math_plot" || snapshot.kind === "math_scene") {
    return Boolean(snapshot.formula_latex?.trim());
  }
  return false;
}

function hasMathVisual(snapshot: AnySnapshot): boolean {
  if (snapshot.kind === "math_plot") return snapshot.curves.length > 0;
  if (snapshot.kind === "math_scene") {
    return Boolean(
      (snapshot.curves?.length ?? 0) > 0 ||
        (snapshot.points?.length ?? 0) > 0 ||
        (snapshot.regions?.length ?? 0) > 0 ||
        (snapshot.segments?.length ?? 0) > 0 ||
        snapshot.vector_field,
    );
  }
  return false;
}

function checkMathStep(
  warnings: VisualQualityWarning[],
  domain: string,
  step: MetaStep,
  snapshots: Array<{ snapshot: AnySnapshot; snapshotPath: string }>,
  assets: AssetLookup,
) {
  if (domain !== "math") return;
  const hasFormula = snapshots.some(({ snapshot }) => hasMathFormula(snapshot));
  const hasVisual = snapshots.some(({ snapshot }) => hasMathVisual(snapshot));
  if (hasFormula && hasVisual) return;

  warn(
    warnings,
    {
      domain,
      step,
      snapshot: step.snapshot,
      snapshotPath: "snapshot",
      assets,
    },
    {
      code: "low_math_visual_richness",
      domain,
      message: "math steps should include both a formula and a plot or math scene.",
    },
  );
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

function buildAssetLookup(options: VisualQualityGateOptions = {}): AssetLookup {
  return {
    findAssetById: options.findAssetById ?? findRegisteredAssetById,
    findAssetByRole: options.findAssetByRole ?? findRegisteredAssetByRole,
  };
}

export function getSceneContractCoverage(
  script: PlaybookScript,
  options: VisualQualityGateOptions = {},
): SceneContractCoverage[] {
  const assets = buildAssetLookup(options);
  const coverage: SceneContractCoverage[] = [];

  for (const step of script.steps) {
    for (const { snapshot, snapshotPath } of collectStepSnapshots(step)) {
      const contract = resolveSceneAssetContract(step.step_id, snapshot);
      if (!contract) continue;

      const context: SnapshotContext = {
        domain: script.domain,
        step,
        snapshot,
        snapshotPath,
        assets,
      };
      const renderedAssetIds = [...collectRenderedAssetIds(context)].sort();
      const renderedAssetIdSet = new Set(renderedAssetIds);
      const requiredAssetIds = [...contract.requiredAssetIds];

      coverage.push({
        contractId: contract.id,
        sceneTemplate: contract.sceneTemplate,
        rendererKind: contract.rendererKind,
        packId: contract.packId,
        stepId: step.step_id,
        snapshotPath,
        requiredAssetIds,
        renderedAssetIds,
        missingAssetIds: requiredAssetIds.filter((assetId) => !renderedAssetIdSet.has(assetId)),
      });
    }
  }

  return coverage;
}

export function visualQualityGate(
  script: PlaybookScript,
  options: VisualQualityGateOptions = {},
): VisualQualityWarning[] {
  const warnings: VisualQualityWarning[] = [];
  const assets = buildAssetLookup(options);

  for (const step of script.steps) {
    const stepSnapshots = collectStepSnapshots(step);
    checkMathStep(warnings, script.domain, step, stepSnapshots, assets);

    for (const { snapshot, snapshotPath } of stepSnapshots) {
      const context: SnapshotContext = {
        domain: script.domain,
        step,
        snapshot,
        snapshotPath,
        assets,
      };

      checkUnsupportedArrayFallback(warnings, context);
      checkSceneAssetContract(warnings, context);
      if (snapshot.kind === "geo_map_scene") {
        checkGeoMapScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "physics_force_scene") {
        checkPhysicsForceScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "bio_cell_scene") {
        checkBioCellScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "bio_process_scene") {
        checkBioProcessScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "molecule_2d_scene") {
        checkMolecule2DScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "reaction_scene") {
        checkReactionScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "algorithm_array" || snapshot.kind === "algorithm_bars") {
        checkAlgorithmLinearScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "algorithm_tree") {
        checkAlgorithmTreeScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "graph_scene") {
        checkGraphScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "call_stack_scene") {
        checkCallStackScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "code_trace_scene") {
        checkCodeTraceScene(warnings, context, snapshot);
      }
    }
  }

  return warnings;
}
