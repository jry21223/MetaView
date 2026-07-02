import { existsSync } from "node:fs";
import path from "node:path";

import { listAssetPacks, type AssetManifestEntry, type SubjectVisualKit } from "./assetRegistry";
import { getLicenseRule, isKnownAssetLicense } from "./licenseRegistry";

export type AssetAuditIssueCode =
  | "missing_schema_version"
  | "missing_license_mode"
  | "missing_sources"
  | "unknown_license"
  | "missing_source"
  | "missing_asset_file"
  | "missing_attribution"
  | "license_rule_mismatch"
  | "renderer_kind_mismatch";

export interface AssetAuditIssue {
  code: AssetAuditIssueCode;
  message: string;
  packId: string;
  assetId?: string;
  sourceId?: string;
}

export interface AssetAuditReport {
  ok: boolean;
  errors: AssetAuditIssue[];
}

export interface AssetAuditOptions {
  publicRoot?: string;
  pathExists?: (assetPath: string) => boolean;
}

const REQUIRED_RENDERER_KINDS_BY_PACK: Record<string, string[]> = {
  "algorithm-code-basic": ["graph_scene", "call_stack_scene", "code_trace_scene", "algorithm_array", "algorithm_tree"],
  "biology-basic": ["bio_cell_scene", "bio_process_scene"],
  "chemistry-basic": ["molecule_2d_scene", "reaction_scene"],
  "core-visual-basic": [
    "geo_map_scene",
    "physics_force_scene",
    "bio_cell_scene",
    "bio_process_scene",
    "molecule_2d_scene",
    "reaction_scene",
    "math_plot",
    "math_formula",
    "math_scene",
    "katex_overlay",
    "graph_scene",
    "algorithm_array",
    "algorithm_tree",
    "motion_scene",
  ],
  "geography-basic": ["geo_map_scene"],
  "geography-earth-basic": ["geo_map_scene"],
  "math-basic": ["math_plot", "math_scene", "math_formula", "katex_overlay"],
  "physics-basic": ["physics_force_scene"],
};

function sameStringSet(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false;
  const actualSet = new Set(actual);
  return expected.every((item) => actualSet.has(item));
}

function pushError(errors: AssetAuditIssue[], issue: AssetAuditIssue) {
  errors.push(issue);
}

function assetPathExists(assetPath: string, publicRoot: string) {
  const root = path.resolve(publicRoot);
  const localPath = path.resolve(root, assetPath.replace(/^\/+/, ""));
  const relativePath = path.relative(root, localPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return false;
  return existsSync(localPath);
}

function auditPackShape(errors: AssetAuditIssue[], pack: SubjectVisualKit) {
  if (pack.schemaVersion !== "1.0.0") {
    pushError(errors, {
      code: "missing_schema_version",
      packId: pack.packId,
      message: `Asset pack "${pack.packId}" must declare schemaVersion "1.0.0".`,
    });
  }
  if (pack.licenseMode !== "single" && pack.licenseMode !== "mixed") {
    pushError(errors, {
      code: "missing_license_mode",
      packId: pack.packId,
      message: `Asset pack "${pack.packId}" must declare licenseMode.`,
    });
  }
  if (!Array.isArray(pack.sources) || pack.sources.length === 0) {
    pushError(errors, {
      code: "missing_sources",
      packId: pack.packId,
      message: `Asset pack "${pack.packId}" must declare at least one source.`,
    });
  }
}

function auditRendererKinds(errors: AssetAuditIssue[], pack: SubjectVisualKit) {
  const expected = REQUIRED_RENDERER_KINDS_BY_PACK[pack.packId];
  if (!expected || sameStringSet(pack.rendererKinds, expected)) return;
  pushError(errors, {
    code: "renderer_kind_mismatch",
    packId: pack.packId,
    message: `Asset pack "${pack.packId}" rendererKinds must be ${JSON.stringify(expected)}.`,
  });
}

function auditSource(
  errors: AssetAuditIssue[],
  pack: SubjectVisualKit,
  sourceId: string,
  license: AssetManifestEntry["license"],
  assetId?: string,
) {
  if (!sourceId || !pack.sources.some((source) => source.id === sourceId)) {
    pushError(errors, {
      code: "missing_source",
      packId: pack.packId,
      assetId,
      sourceId,
      message: `Asset pack "${pack.packId}" references missing source "${sourceId}".`,
    });
  }
  if (!isKnownAssetLicense(license)) {
    pushError(errors, {
      code: "unknown_license",
      packId: pack.packId,
      assetId,
      sourceId,
      message: `Asset source "${sourceId}" uses unknown license.`,
    });
  }
}

function auditAsset(errors: AssetAuditIssue[], pack: SubjectVisualKit, asset: AssetManifestEntry) {
  auditSource(errors, pack, asset.sourceId, asset.license, asset.id);

  const licenseRule = getLicenseRule(asset.license);
  if (!isKnownAssetLicense(asset.license)) {
    pushError(errors, {
      code: "unknown_license",
      packId: pack.packId,
      assetId: asset.id,
      message: `Asset "${asset.id}" uses unknown license.`,
    });
  }

  if ((asset.requiresAttribution || licenseRule.requiresAttribution) && !asset.attribution) {
    pushError(errors, {
      code: "missing_attribution",
      packId: pack.packId,
      assetId: asset.id,
      message: `Asset "${asset.id}" requires attribution but none is recorded.`,
    });
  }

  if (asset.commercialUseAllowed !== licenseRule.commercialUseAllowed && asset.license !== "unknown") {
    pushError(errors, {
      code: "license_rule_mismatch",
      packId: pack.packId,
      assetId: asset.id,
      message: `Asset "${asset.id}" commercialUseAllowed does not match ${asset.license} policy.`,
    });
  }
  if (asset.shareAlike !== licenseRule.shareAlike) {
    pushError(errors, {
      code: "license_rule_mismatch",
      packId: pack.packId,
      assetId: asset.id,
      message: `Asset "${asset.id}" shareAlike does not match ${asset.license} policy.`,
    });
  }
  if (asset.modificationAllowed !== licenseRule.modificationAllowed) {
    pushError(errors, {
      code: "license_rule_mismatch",
      packId: pack.packId,
      assetId: asset.id,
      message: `Asset "${asset.id}" modificationAllowed does not match ${asset.license} policy.`,
    });
  }
}

function auditAssetFile(errors: AssetAuditIssue[], pack: SubjectVisualKit, asset: AssetManifestEntry, options: AssetAuditOptions) {
  if (!asset.path) return;

  const publicRoot = options.publicRoot ?? path.resolve(process.cwd(), "public");
  const pathExists = options.pathExists ?? ((assetPath: string) => assetPathExists(assetPath, publicRoot));
  if (pathExists(asset.path)) return;

  pushError(errors, {
    code: "missing_asset_file",
    packId: pack.packId,
    assetId: asset.id,
    message: `Asset "${asset.id}" path "${asset.path}" does not exist under the public asset root.`,
  });
}

export function auditAssetPacks(packs: SubjectVisualKit[], options: AssetAuditOptions = {}): AssetAuditReport {
  const errors: AssetAuditIssue[] = [];
  for (const pack of packs) {
    auditPackShape(errors, pack);
    auditRendererKinds(errors, pack);
    for (const source of pack.sources ?? []) {
      auditSource(errors, pack, source.id, source.license);
    }
    for (const asset of pack.assets) {
      auditAsset(errors, pack, asset);
      auditAssetFile(errors, pack, asset, options);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}

export function auditRegisteredAssetPacks(options: AssetAuditOptions = {}): AssetAuditReport {
  return auditAssetPacks(listAssetPacks(), options);
}
