import { findAssetById, findAssetByRole } from "./assetRegistry";
import type {
  AnySnapshot,
  BioCellSceneSnapshot,
  BioProcessSceneSnapshot,
  CodeTraceSceneSnapshot,
  GeoMapSceneSnapshot,
  GraphSceneSnapshot,
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
  | "low_biology_structure_assets"
  | "low_biology_process_assets"
  | "low_chemistry_structure_data"
  | "low_chemistry_reaction_assets"
  | "low_algorithm_state_visuals"
  | "low_math_visual_richness"
  | "possible_label_overlap"
  | "unsupported_array_fallback";

export interface VisualQualityWarning {
  code: VisualQualityWarningCode;
  step_id: string;
  snapshot_kind: SnapshotKind;
  message: string;
  domain?: string;
  asset_id?: string;
  pack_id?: string | null;
  label_ids?: [string, string];
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

function checkAssetIdFromPackOrAny(
  warnings: VisualQualityWarning[],
  context: SnapshotContext,
  assetId: string | null | undefined,
  preferredPackId: string | null | undefined,
) {
  if (!assetId || assetResolves(assetId, preferredPackId) || assetResolves(assetId, undefined)) return;
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
      return assetResolves(processStep.asset_id, snapshot.pack_id) || assetResolves(processStep.asset_id, undefined);
    }
    return Boolean(findAssetByRole("biology", processStep.semantic_role, snapshot.pack_id));
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
  const hasReactionAsset = [...snapshot.arrows, ...(snapshot.electron_flows ?? [])].some((item) => {
    if (item.asset_id) return assetResolves(item.asset_id, snapshot.pack_id);
    return Boolean(findAssetByRole("chemistry", item.semantic_role, snapshot.pack_id));
  });

  if (!hasParticipants || !hasReactionAsset) {
    warn(warnings, context, {
      code: "low_chemistry_reaction_assets",
      domain: context.domain,
      pack_id: snapshot.pack_id,
      message: "reaction_scene should include reactants, products, and at least one resolvable reaction asset.",
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

export function visualQualityGate(script: PlaybookScript): VisualQualityWarning[] {
  const warnings: VisualQualityWarning[] = [];

  for (const step of script.steps) {
    const stepSnapshots = collectStepSnapshots(step);
    checkMathStep(warnings, script.domain, step, stepSnapshots);

    for (const { snapshot, snapshotPath } of stepSnapshots) {
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
      if (snapshot.kind === "bio_process_scene") {
        checkBioProcessScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "molecule_2d_scene") {
        checkMolecule2DScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "reaction_scene") {
        checkReactionScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "graph_scene") {
        checkGraphScene(warnings, context, snapshot);
      }
      if (snapshot.kind === "code_trace_scene") {
        checkCodeTraceScene(warnings, context, snapshot);
      }
    }
  }

  return warnings;
}
