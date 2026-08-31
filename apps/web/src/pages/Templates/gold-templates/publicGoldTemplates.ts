import type { GoldTemplateManifest } from "./manifest";
import { CONIC_PUBLIC_GOLD_TEMPLATES } from "./conicGoldTemplates";
import { POLE_POLAR_GOLD_TEMPLATE } from "./polePolarGoldTemplate";
import { CROSS_SUBJECT_PUBLIC_GOLD_TEMPLATES } from "./crossSubjectGoldTemplates";
import { ECOLOGY_PUBLIC_GOLD_TEMPLATES } from "./ecology/ecologyGoldTemplates";
import { DERIVATIVE_TANGENT_GOLD_TEMPLATE } from "./math/derivativeTangentGoldTemplate";
import { INTEGRAL_AREA_GOLD_TEMPLATE } from "./math/integralAreaGoldTemplate";
import { PROJECTILE_MOTION_GOLD_TEMPLATE } from "./physics/projectileMotionGoldTemplate";
import { SPRING_SHM_GOLD_TEMPLATE } from "./physics/springShmGoldTemplate";

export const PUBLIC_GOLD_TEMPLATES: readonly GoldTemplateManifest[] = Object.freeze([
  DERIVATIVE_TANGENT_GOLD_TEMPLATE,
  INTEGRAL_AREA_GOLD_TEMPLATE,
  ...CONIC_PUBLIC_GOLD_TEMPLATES,
  POLE_POLAR_GOLD_TEMPLATE,
  PROJECTILE_MOTION_GOLD_TEMPLATE,
  SPRING_SHM_GOLD_TEMPLATE,
  ...CROSS_SUBJECT_PUBLIC_GOLD_TEMPLATES,
  ...ECOLOGY_PUBLIC_GOLD_TEMPLATES,
]);

export function getPublicGoldTemplate(caseId: string): GoldTemplateManifest | null {
  return PUBLIC_GOLD_TEMPLATES.find((item) => item.caseId === caseId) ?? null;
}
