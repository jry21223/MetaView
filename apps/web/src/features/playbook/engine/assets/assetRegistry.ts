import geographyBasicManifest from "../../../../../public/assets/metaview-kits/geography-basic/manifest.json";
import physicsBasicManifest from "../../../../../public/assets/metaview-kits/physics-basic/manifest.json";

export type SubjectVisualKitSubject =
  | "core"
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
  | "cc-by-3.0"
  | "cc-by"
  | "cc-by-4.0"
  | "cc-by-sa-4.0"
  | "mit"
  | "isc"
  | "bsd-3-clause"
  | "apache-2.0"
  | "unknown"
  | "internal";

export type AssetCommercialUseStatus = "allowed" | "allowed-with-attribution" | "restricted" | "unknown";

export interface AssetSource {
  id: string;
  label: string;
  license: AssetLicense;
  sourceUrl: string | null;
  licenseUrl: string | null;
  attribution?: string | null;
}

export interface AssetRendererHints {
  preferredRenderer?: string;
  defaultSize?: [number, number];
  anchor?: "center" | "topLeft" | "baseline";
  colorizable?: boolean;
  strokeControlled?: boolean;
}

export interface AssetManifestEntry {
  id: string;
  type: "svg" | "image" | "geojson" | "json" | "lottie" | "smiles" | "pdb" | "component" | "particle_preset";
  path?: string;
  resourceUri?: string;
  tags: string[];
  semanticRoles: string[];
  sourceId: string;
  attribution?: string | null;
  license: AssetLicense;
  commercialUseStatus: AssetCommercialUseStatus;
  commercialUseAllowed: boolean;
  requiresAttribution: boolean;
  shareAlike: boolean;
  modificationAllowed: boolean;
  sourceUrl: string | null;
  licenseUrl: string | null;
  modifiedFrom: string | null;
  rendererHints?: AssetRendererHints;
}

export interface SubjectVisualKit {
  schemaVersion: "1.0.0";
  packId: string;
  subject: SubjectVisualKitSubject;
  version: string;
  license: AssetLicense;
  licenseMode: "single" | "mixed";
  defaultLicense?: AssetLicense;
  sceneTemplates: string[];
  rendererKinds: string[];
  sources: AssetSource[];
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
