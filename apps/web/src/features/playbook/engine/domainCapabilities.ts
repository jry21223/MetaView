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
    primaryRenderer: "physics_force_scene/math_scene/formula/domain_cards",
    message: "Physics has a force-scene renderer for flagship motion cases and falls back to formula/card renderers.",
  },
  chemistry: {
    domain: "chemistry",
    support: "partial",
    primaryRenderer: "molecule_2d_scene/domain_cards",
    message: "Chemistry has a structured 2D molecule renderer for flagship molecule cases and falls back to concept cards.",
  },
  biology: {
    domain: "biology",
    support: "partial",
    primaryRenderer: "bio_cell_scene/domain_cards",
    message: "Biology has a cell-scene renderer for flagship structure cases and falls back to concept cards.",
  },
  geography: {
    domain: "geography",
    support: "partial",
    primaryRenderer: "geo_map_scene/motion_scene/domain_cards",
    message: "Geography has a map-scene renderer for flagship map cases and falls back to motion/card renderers.",
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
