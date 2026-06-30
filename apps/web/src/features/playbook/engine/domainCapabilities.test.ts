import { describe, expect, it } from "vitest";
import { DOMAIN_CAPABILITIES, domainCapability } from "./domainCapabilities";

describe("domainCapabilities", () => {
  it("marks algorithm and math as fully supported", () => {
    expect(DOMAIN_CAPABILITIES.algorithm.support).toBe("full");
    expect(DOMAIN_CAPABILITIES.math.support).toBe("full");
  });

  it("marks biology/physics/geography as partial and unsupported science domains as fallback", () => {
    expect(DOMAIN_CAPABILITIES.biology.support).toBe("partial");
    expect(DOMAIN_CAPABILITIES.physics.support).toBe("partial");
    expect(DOMAIN_CAPABILITIES.geography.support).toBe("partial");
    expect(DOMAIN_CAPABILITIES.chemistry.support).toBe("fallback");
  });

  it("returns a fallback capability for unknown domains", () => {
    expect(domainCapability("history")).toMatchObject({
      domain: "history",
      support: "fallback",
      primaryRenderer: "domain_cards",
    });
  });
});
