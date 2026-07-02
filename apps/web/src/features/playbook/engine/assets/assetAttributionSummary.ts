import type { VisualQualityWarning, VisualQualityWarningCode } from "./visualQualityGate";

const ASSET_POLICY_WARNING_CODES = new Set<VisualQualityWarningCode>([
  "asset_requires_attribution",
  "asset_commercial_use_restricted",
  "asset_share_alike",
  "asset_unknown_license",
]);

export interface AssetAttributionSummaryEntry {
  asset_id: string;
  pack_id: string | null;
  license: VisualQualityWarning["license"];
  commercialUseStatus: VisualQualityWarning["commercialUseStatus"];
  attribution: string | null;
  sourceUrl: string | null;
  licenseUrl: string | null;
  requiresAttribution: boolean;
  commercialUseRestricted: boolean;
  shareAlike: boolean;
  unknownLicense: boolean;
  warningCodes: VisualQualityWarningCode[];
  stepIds: string[];
}

export interface AssetAttributionSummary {
  entries: AssetAttributionSummaryEntry[];
  attributionRequired: AssetAttributionSummaryEntry[];
  commercialUseRestricted: AssetAttributionSummaryEntry[];
  shareAlike: AssetAttributionSummaryEntry[];
  unknownLicense: AssetAttributionSummaryEntry[];
  licenseRisk: AssetAttributionSummaryEntry[];
}

function stableEntryKey(warning: VisualQualityWarning): string | null {
  if (!warning.asset_id) return null;
  return `${warning.pack_id ?? "any"}:${warning.asset_id}`;
}

function entryId(entry: Pick<AssetAttributionSummaryEntry, "pack_id" | "asset_id">): string {
  return `${entry.pack_id ?? "any"}/${entry.asset_id}`;
}

function sortedUnique<T extends string>(items: T[]): T[] {
  return [...new Set(items)].sort();
}

function createEmptyEntry(warning: VisualQualityWarning): AssetAttributionSummaryEntry {
  return {
    asset_id: warning.asset_id!,
    pack_id: warning.pack_id ?? null,
    license: warning.license,
    commercialUseStatus: warning.commercialUseStatus,
    attribution: warning.attribution ?? null,
    sourceUrl: warning.sourceUrl ?? null,
    licenseUrl: warning.licenseUrl ?? null,
    requiresAttribution: false,
    commercialUseRestricted: false,
    shareAlike: false,
    unknownLicense: false,
    warningCodes: [],
    stepIds: [],
  };
}

function mergeWarning(entry: AssetAttributionSummaryEntry, warning: VisualQualityWarning) {
  if (warning.license && !entry.license) entry.license = warning.license;
  if (warning.commercialUseStatus && !entry.commercialUseStatus) {
    entry.commercialUseStatus = warning.commercialUseStatus;
  }
  if (warning.attribution && !entry.attribution) entry.attribution = warning.attribution;
  if (warning.sourceUrl && !entry.sourceUrl) entry.sourceUrl = warning.sourceUrl;
  if (warning.licenseUrl && !entry.licenseUrl) entry.licenseUrl = warning.licenseUrl;

  entry.warningCodes = sortedUnique([...entry.warningCodes, warning.code]);
  entry.stepIds = sortedUnique([...entry.stepIds, warning.step_id]);
  entry.requiresAttribution ||= warning.code === "asset_requires_attribution";
  entry.commercialUseRestricted ||= warning.code === "asset_commercial_use_restricted";
  entry.shareAlike ||= warning.code === "asset_share_alike" || warning.shareAlike === true;
  entry.unknownLicense ||= warning.code === "asset_unknown_license";
}

function sortEntries(entries: AssetAttributionSummaryEntry[]): AssetAttributionSummaryEntry[] {
  return [...entries].sort((first, second) => entryId(first).localeCompare(entryId(second)));
}

export function createAssetAttributionSummary(warnings: readonly VisualQualityWarning[]): AssetAttributionSummary {
  const byAsset = new Map<string, AssetAttributionSummaryEntry>();

  for (const warning of warnings) {
    if (!ASSET_POLICY_WARNING_CODES.has(warning.code)) continue;
    const key = stableEntryKey(warning);
    if (!key) continue;
    const entry = byAsset.get(key) ?? createEmptyEntry(warning);
    mergeWarning(entry, warning);
    byAsset.set(key, entry);
  }

  const entries = sortEntries([...byAsset.values()]);
  const licenseRisk = entries.filter((entry) => entry.commercialUseRestricted || entry.shareAlike || entry.unknownLicense);
  return {
    entries,
    attributionRequired: entries.filter((entry) => entry.requiresAttribution),
    commercialUseRestricted: entries.filter((entry) => entry.commercialUseRestricted),
    shareAlike: entries.filter((entry) => entry.shareAlike),
    unknownLicense: entries.filter((entry) => entry.unknownLicense),
    licenseRisk,
  };
}

export function assetAttributionEntryId(entry: Pick<AssetAttributionSummaryEntry, "pack_id" | "asset_id">): string {
  return entryId(entry);
}
