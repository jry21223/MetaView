import type { AssetLicense } from "./assetRegistry";

export interface AssetLicenseRule {
  license: AssetLicense;
  label: string;
  requiresAttribution: boolean;
  commercialUseAllowed: boolean;
  shareAlike: boolean;
  modificationAllowed: boolean;
  mcpExposureAllowed: boolean;
}

export const LICENSE_REGISTRY: Record<AssetLicense, AssetLicenseRule> = {
  "public-domain": {
    license: "public-domain",
    label: "Public domain",
    requiresAttribution: false,
    commercialUseAllowed: true,
    shareAlike: false,
    modificationAllowed: true,
    mcpExposureAllowed: true,
  },
  cc0: {
    license: "cc0",
    label: "Creative Commons Zero",
    requiresAttribution: false,
    commercialUseAllowed: true,
    shareAlike: false,
    modificationAllowed: true,
    mcpExposureAllowed: true,
  },
  "cc-by-3.0": {
    license: "cc-by-3.0",
    label: "Creative Commons Attribution 3.0",
    requiresAttribution: true,
    commercialUseAllowed: true,
    shareAlike: false,
    modificationAllowed: true,
    mcpExposureAllowed: true,
  },
  "cc-by": {
    license: "cc-by",
    label: "Creative Commons Attribution",
    requiresAttribution: true,
    commercialUseAllowed: true,
    shareAlike: false,
    modificationAllowed: true,
    mcpExposureAllowed: true,
  },
  "cc-by-4.0": {
    license: "cc-by-4.0",
    label: "Creative Commons Attribution 4.0",
    requiresAttribution: true,
    commercialUseAllowed: true,
    shareAlike: false,
    modificationAllowed: true,
    mcpExposureAllowed: true,
  },
  "cc-by-sa-4.0": {
    license: "cc-by-sa-4.0",
    label: "Creative Commons Attribution-ShareAlike 4.0",
    requiresAttribution: true,
    commercialUseAllowed: true,
    shareAlike: true,
    modificationAllowed: true,
    mcpExposureAllowed: true,
  },
  mit: {
    license: "mit",
    label: "MIT",
    requiresAttribution: true,
    commercialUseAllowed: true,
    shareAlike: false,
    modificationAllowed: true,
    mcpExposureAllowed: true,
  },
  isc: {
    license: "isc",
    label: "ISC",
    requiresAttribution: true,
    commercialUseAllowed: true,
    shareAlike: false,
    modificationAllowed: true,
    mcpExposureAllowed: true,
  },
  "bsd-3-clause": {
    license: "bsd-3-clause",
    label: "BSD 3-Clause",
    requiresAttribution: true,
    commercialUseAllowed: true,
    shareAlike: false,
    modificationAllowed: true,
    mcpExposureAllowed: true,
  },
  "apache-2.0": {
    license: "apache-2.0",
    label: "Apache 2.0",
    requiresAttribution: true,
    commercialUseAllowed: true,
    shareAlike: false,
    modificationAllowed: true,
    mcpExposureAllowed: true,
  },
  internal: {
    license: "internal",
    label: "MetaView internal",
    requiresAttribution: false,
    commercialUseAllowed: true,
    shareAlike: false,
    modificationAllowed: true,
    mcpExposureAllowed: true,
  },
  unknown: {
    license: "unknown",
    label: "Unknown",
    requiresAttribution: true,
    commercialUseAllowed: false,
    shareAlike: false,
    modificationAllowed: false,
    mcpExposureAllowed: false,
  },
};

export function getLicenseRule(license: AssetLicense): AssetLicenseRule {
  return LICENSE_REGISTRY[license] ?? LICENSE_REGISTRY.unknown;
}

export function isKnownAssetLicense(license: AssetLicense): boolean {
  return license !== "unknown";
}
