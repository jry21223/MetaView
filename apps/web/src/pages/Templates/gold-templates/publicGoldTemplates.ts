import { getTemplatePreviewCase } from "../templatePreviewCases";
import { attachPublicGoldTemplate, type GoldTemplateManifest } from "./manifest";
import { CONIC_PUBLIC_GOLD_TEMPLATES } from "./conicGoldTemplates";

const existingPolePolar = getTemplatePreviewCase("pole-polar");
if (!existingPolePolar) throw new Error("The migrated pole-polar public case is missing");

export const PUBLIC_GOLD_TEMPLATES: readonly GoldTemplateManifest[] = Object.freeze([
  ...CONIC_PUBLIC_GOLD_TEMPLATES,
  attachPublicGoldTemplate({
    caseId: "pole-polar",
    archetypeId: "conic.pole-polar.circle",
    subject: "high_school_math",
    domain: "conic_sections",
    topic: "极点与极线",
    visibility: "public",
    title: "极点与极线",
    description: "从圆外点的两条切线推导接触弦与极线方程",
    canonicalPrompt: "已知圆 x²+y²=25 和圆外点 P=(k,k)，推导接触弦及极线方程。",
    parameterSchema: {
      controls: existingPolePolar.controls,
      defaults: existingPolePolar.defaultParams,
    },
    poster: {
      url: existingPolePolar.posterUrl,
      alt: existingPolePolar.posterAlt,
      frame: existingPolePolar.posterFrame,
    },
    buildPublicPlaybook: existingPolePolar.buildScript,
    buildFollowups: existingPolePolar.buildFollowups,
  }),
]);

export function getPublicGoldTemplate(caseId: string): GoldTemplateManifest | null {
  return PUBLIC_GOLD_TEMPLATES.find((item) => item.caseId === caseId) ?? null;
}
