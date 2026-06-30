import geographyBasicManifest from "../../../../../public/assets/metaview-kits/geography-basic/manifest.json";
import physicsBasicManifest from "../../../../../public/assets/metaview-kits/physics-basic/manifest.json";

export type SubjectVisualKitSubject =
  | "math"
  | "physics"
  | "chemistry"
  | "biology"
  | "geography"
  | "algorithm"
  | "code";

export type AssetLicense =
  | "public-domain"
  | "cc0"
  | "cc-by"
  | "mit"
  | "internal";

export interface AssetManifestEntry {
  id: string;
  type: "svg" | "image" | "lottie" | "json";
  path: string;
  tags: string[];
  semanticRoles: string[];
  attribution?: string | null;
  license: AssetLicense;
}

export interface SubjectVisualKit {
  packId: string;
  subject: SubjectVisualKitSubject;
  version: string;
  license: AssetLicense;
  sceneTemplates: string[];
  rendererKinds: string[];
  assets: AssetManifestEntry[];
}

const ASSET_PACKS: SubjectVisualKit[] = [
  geographyBasicManifest as SubjectVisualKit,
  physicsBasicManifest as SubjectVisualKit,
];

export function listAssetPacks(): SubjectVisualKit[] {
  return ASSET_PACKS;
}

export function getAssetPack(packId: string): SubjectVisualKit | undefined {
  return ASSET_PACKS.find((pack) => pack.packId === packId);
}

export function findAssetById(
  assetId: string | null | undefined,
  packId?: string | null,
): AssetManifestEntry | undefined {
  if (!assetId) return undefined;
  const packs = packId ? ASSET_PACKS.filter((pack) => pack.packId === packId) : ASSET_PACKS;
  for (const pack of packs) {
    const asset = pack.assets.find((item) => item.id === assetId);
    if (asset) return asset;
  }
  return undefined;
}

export function findAssetInPackByRole(
  pack: SubjectVisualKit | undefined,
  semanticRole: string | null | undefined,
): AssetManifestEntry | undefined {
  if (!pack || !semanticRole) return undefined;
  return pack.assets.find((asset) => asset.semanticRoles.includes(semanticRole));
}

export function findAssetByRole(
  subject: SubjectVisualKitSubject,
  semanticRole: string,
  packId?: string | null,
): AssetManifestEntry | undefined {
  const packs = ASSET_PACKS.filter((pack) => pack.subject === subject && (!packId || pack.packId === packId));
  for (const pack of packs) {
    const asset = findAssetInPackByRole(pack, semanticRole);
    if (asset) return asset;
  }
  return undefined;
}
