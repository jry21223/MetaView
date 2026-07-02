import bfsGraphContractJson from "../../../../../public/assets/metaview-kits/algorithm-code-basic/contracts/bfs-graph.contract.json";
import binarySearchContractJson from "../../../../../public/assets/metaview-kits/algorithm-code-basic/contracts/binary-search.contract.json";
import recursionStackContractJson from "../../../../../public/assets/metaview-kits/algorithm-code-basic/contracts/recursion-stack.contract.json";
import cellStructureContractJson from "../../../../../public/assets/metaview-kits/biology-basic/contracts/cell-structure.contract.json";
import dnaReplicationContractJson from "../../../../../public/assets/metaview-kits/biology-basic/contracts/dna-replication.contract.json";
import glucoseContractJson from "../../../../../public/assets/metaview-kits/chemistry-basic/contracts/glucose.contract.json";
import methaneContractJson from "../../../../../public/assets/metaview-kits/chemistry-basic/contracts/methane.contract.json";
import reactionSynthesisWaterContractJson from "../../../../../public/assets/metaview-kits/chemistry-basic/contracts/reaction-synthesis-water.contract.json";
import waterContractJson from "../../../../../public/assets/metaview-kits/chemistry-basic/contracts/water.contract.json";
import eastAsiaMonsoonContractJson from "../../../../../public/assets/metaview-kits/geography-earth-basic/contracts/east-asia-monsoon.contract.json";
import derivativeTangentContractJson from "../../../../../public/assets/metaview-kits/math-basic/contracts/derivative-tangent.contract.json";
import projectileMotionContractJson from "../../../../../public/assets/metaview-kits/physics-basic/contracts/projectile-motion.contract.json";

import type { AnySnapshot, SnapshotKind } from "../types";

export interface SceneAssetContract {
  id: string;
  sceneTemplate: string;
  rendererKind: SnapshotKind;
  packId: string;
  requiredAssetIds: string[];
}

interface ChemistryMoleculeContractJson {
  id: string;
  moleculeId: string;
  assetId: string;
}

interface ChemistryReactionContractJson {
  id: string;
  reactionId: string;
  arrowAssetId: string;
  electronFlowAssetId: string;
}

function chemistryMoleculeContract(contract: ChemistryMoleculeContractJson): SceneAssetContract {
  return {
    id: contract.id,
    sceneTemplate: `molecule_2d_${contract.moleculeId}`,
    rendererKind: "molecule_2d_scene",
    packId: "chemistry-basic",
    requiredAssetIds: [contract.assetId],
  };
}

function chemistryReactionContract(contract: ChemistryReactionContractJson): SceneAssetContract {
  return {
    id: contract.id,
    sceneTemplate: contract.reactionId,
    rendererKind: "reaction_scene",
    packId: "chemistry-basic",
    requiredAssetIds: [contract.arrowAssetId, contract.electronFlowAssetId],
  };
}

const SCENE_ASSET_CONTRACTS: readonly SceneAssetContract[] = [
  eastAsiaMonsoonContractJson,
  projectileMotionContractJson,
  cellStructureContractJson,
  dnaReplicationContractJson,
  chemistryMoleculeContract(waterContractJson),
  chemistryMoleculeContract(methaneContractJson),
  chemistryMoleculeContract(glucoseContractJson),
  chemistryReactionContract(reactionSynthesisWaterContractJson),
  derivativeTangentContractJson,
  bfsGraphContractJson,
  recursionStackContractJson,
  binarySearchContractJson,
] as readonly SceneAssetContract[];

function snapshotPackId(snapshot: AnySnapshot): string | null | undefined {
  return "pack_id" in snapshot ? snapshot.pack_id : undefined;
}

function sceneTemplateCandidates(stepId: string, snapshot: AnySnapshot): Set<string> {
  const candidates = new Set([stepId]);
  if (snapshot.kind === "bio_process_scene") candidates.add(snapshot.process_id);
  if (snapshot.kind === "molecule_2d_scene") {
    candidates.add(snapshot.molecule_id);
    candidates.add(`molecule_2d_${snapshot.molecule_id}`);
  }
  if (snapshot.kind === "reaction_scene") candidates.add(snapshot.reaction_id);
  if (snapshot.kind === "math_plot") {
    candidates.add("math_plot");
    if (snapshot.asset_id === "derivative-tangent-preset") candidates.add("derivative_tangent");
  }
  return candidates;
}

export function resolveSceneAssetContract(
  stepId: string,
  snapshot: AnySnapshot,
): SceneAssetContract | undefined {
  const packId = snapshotPackId(snapshot);
  const templates = sceneTemplateCandidates(stepId, snapshot);
  return SCENE_ASSET_CONTRACTS.find(
    (contract) =>
      contract.rendererKind === snapshot.kind &&
      (!packId || contract.packId === packId) &&
      templates.has(contract.sceneTemplate),
  );
}
