export type DomainSupportLevel = "full" | "partial" | "fallback";

export interface DomainCapability {
  domain: string;
  support: DomainSupportLevel;
  primaryRenderer: string;
  message?: string;
}

export const DOMAIN_CAPABILITIES: Record<string, DomainCapability> = {
  algorithm: { domain: "algorithm", support: "full", primaryRenderer: "algorithm" },
  code: { domain: "code", support: "partial", primaryRenderer: "algorithm/code" },
  math: { domain: "math", support: "full", primaryRenderer: "math_scene/math_plot/math_formula" },
  physics: {
    domain: "physics",
    support: "partial",
    primaryRenderer: "math_scene/formula/domain_cards",
    message: "Physics currently uses scene/formula/card renderers; dedicated physics renderer is not implemented yet.",
  },
  chemistry: {
    domain: "chemistry",
    support: "fallback",
    primaryRenderer: "domain_cards",
    message: "Chemistry currently uses fallback concept cards.",
  },
  biology: {
    domain: "biology",
    support: "fallback",
    primaryRenderer: "domain_cards",
    message: "Biology currently uses fallback concept cards.",
  },
  geography: {
    domain: "geography",
    support: "fallback",
    primaryRenderer: "domain_cards",
    message: "Geography currently uses fallback concept cards.",
  },
};

export function domainCapability(domain: string | null | undefined): DomainCapability {
  const key = (domain ?? "").trim().toLowerCase();
  return DOMAIN_CAPABILITIES[key] ?? {
    domain: key || "unknown",
    support: "fallback",
    primaryRenderer: "domain_cards",
    message: "This domain currently uses fallback concept cards.",
  };
}
