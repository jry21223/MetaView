import type { GoldTemplateManifest } from "./manifest";
import { CONIC_PUBLIC_GOLD_TEMPLATES } from "./conicGoldTemplates";
import { POLE_POLAR_GOLD_TEMPLATE } from "./polePolarGoldTemplate";

export const PUBLIC_GOLD_TEMPLATES: readonly GoldTemplateManifest[] = Object.freeze([
  ...CONIC_PUBLIC_GOLD_TEMPLATES,
  POLE_POLAR_GOLD_TEMPLATE,
]);

export function getPublicGoldTemplate(caseId: string): GoldTemplateManifest | null {
  return PUBLIC_GOLD_TEMPLATES.find((item) => item.caseId === caseId) ?? null;
}
