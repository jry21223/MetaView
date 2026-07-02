import bfsGraphContractJson from "../../../../../public/assets/metaview-kits/algorithm-code-basic/contracts/bfs-graph.contract.json";
import binarySearchContractJson from "../../../../../public/assets/metaview-kits/algorithm-code-basic/contracts/binary-search.contract.json";
import recursionStackContractJson from "../../../../../public/assets/metaview-kits/algorithm-code-basic/contracts/recursion-stack.contract.json";
import cellStructureContractJson from "../../../../../public/assets/metaview-kits/biology-basic/contracts/cell-structure.contract.json";
import dnaReplicationContractJson from "../../../../../public/assets/metaview-kits/biology-basic/contracts/dna-replication.contract.json";

import type { AnySnapshot, SnapshotKind } from "../types";

export interface SceneAssetContract {
  id: string;
  sceneTemplate: string;
  rendererKind: SnapshotKind;
  packId: string;
  requiredAssetIds: string[];
}

const SCENE_ASSET_CONTRACTS: readonly SceneAssetContract[] = [
  cellStructureContractJson,
  dnaReplicationContractJson,
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
