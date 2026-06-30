import {
  findAssetById,
  findAssetByRole,
  listAssetPacks,
  type AssetManifestEntry,
  type SubjectVisualKitSubject,
} from "./assetRegistry";

export function resolveAssetById(
  packId: string | null | undefined,
  assetId: string | null | undefined,
): AssetManifestEntry | undefined {
  return findAssetById(assetId, packId);
}

export function resolveAssetByRole(
  subject: SubjectVisualKitSubject,
  semanticRole: string | null | undefined,
  packId?: string | null,
): AssetManifestEntry | undefined {
  if (!semanticRole) return undefined;
  return findAssetByRole(subject, semanticRole, packId);
}

export function resolveAssetForRenderer(
  rendererKind: string,
  semanticRole: string | null | undefined,
  packId?: string | null,
): AssetManifestEntry | undefined {
  if (!semanticRole) return undefined;
  const packs = listAssetPacks().filter(
    (pack) => pack.rendererKinds.includes(rendererKind) && (!packId || pack.packId === packId),
  );
  for (const pack of packs) {
    const asset = pack.assets.find((item) => item.semanticRoles.includes(semanticRole));
    if (asset) return asset;
  }
  return undefined;
}
