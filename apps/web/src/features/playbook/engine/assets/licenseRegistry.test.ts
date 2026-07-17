import { describe, expect, it } from "vitest";

import { getLicenseRule, isKnownAssetLicense } from "./licenseRegistry";

describe("licenseRegistry", () => {
  it("marks public-domain and internal assets as commercial-use safe without attribution", () => {
    expect(getLicenseRule("public-domain")).toMatchObject({
      license: "public-domain",
      commercialUseAllowed: true,
      requiresAttribution: false,
      shareAlike: false,
      modificationAllowed: true,
    });
    expect(getLicenseRule("internal")).toMatchObject({
      license: "internal",
      commercialUseAllowed: true,
      requiresAttribution: false,
      shareAlike: false,
      modificationAllowed: true,
    });
  });

  it("marks attribution and share-alike licenses with stricter rules", () => {
    expect(getLicenseRule("cc-by-4.0")).toMatchObject({
      commercialUseAllowed: true,
      requiresAttribution: true,
      shareAlike: false,
      modificationAllowed: true,
    });
    expect(getLicenseRule("cc-by-sa-4.0")).toMatchObject({
      commercialUseAllowed: true,
      requiresAttribution: true,
      shareAlike: true,
      modificationAllowed: true,
    });
  });

  it("does not treat unknown as a usable asset license", () => {
    expect(isKnownAssetLicense("unknown")).toBe(false);
    expect(getLicenseRule("unknown")).toMatchObject({
      commercialUseAllowed: false,
      mcpExposureAllowed: false,
    });
  });
});
