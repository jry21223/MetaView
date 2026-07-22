import { getTemplatePreviewCase } from "../templatePreviewCases";
import type { GoldTemplateManifest } from "./manifest";

const existingPolePolar = getTemplatePreviewCase("pole-polar");
if (!existingPolePolar) throw new Error("The migrated pole-polar public case is missing");

export const PUBLIC_GOLD_TEMPLATES: readonly GoldTemplateManifest[] = Object.freeze([
  {
    caseId: "pole-polar",
    archetypeId: "conic.pole-polar.circle",
    subject: "high_school_math",
    domain: "conic_sections",
    topic: "极点与极线",
    visibility: "public",
    title: "极点与极线",
    description: "从圆外点的两条切线推导接触弦与极线方程",
    canonicalPrompt: "已知圆 x²+y²=25 和圆外点 P=(k,k)，推导接触弦及极线方程。",
    requiredCapabilities: [
      "conic.circle.tangent_points",
      "conic.circle.polar_line",
      "math_scene.parametric_curve",
    ],
    parameterSchema: {
      controls: existingPolePolar.controls,
      defaults: existingPolePolar.defaultParams,
    },
    expectedFacts: [
      { id: "pole-outside-circle", description: "外点到圆心距离严格大于半径" },
      { id: "tangent-points-on-circle", description: "两个切点均满足圆方程", tolerance: 1e-8 },
      { id: "radius-perpendicular-tangent", description: "切点半径与对应切线垂直", tolerance: 1e-8 },
      { id: "polar-equation", description: "P=(k,k) 的极线为 kx+ky=R²", tolerance: 1e-8 },
    ],
    visualInvariants: [{
      id: "pole-polar-core-objects",
      description: "圆、外点、两个切点、两条切线和极线均可辨认",
      requiredSemanticRoles: [
        "conic_curve",
        "moving_point",
        "tangent_point",
        "tangent",
        "polar_line",
      ],
    }],
    pedagogicalRubric: {
      objective: "理解外点、两条切线、接触弦和极线之间的关系",
      requiredPhases: ["观察", "构造", "推导", "验证", "总结"],
      minimumSteps: 6,
    },
    poster: {
      url: existingPolePolar.posterUrl,
      alt: existingPolePolar.posterAlt,
      frame: existingPolePolar.posterFrame,
    },
    buildPublicPlaybook: existingPolePolar.buildScript,
    buildFollowups: existingPolePolar.buildFollowups,
  },
]);

export function getPublicGoldTemplate(caseId: string): GoldTemplateManifest | null {
  return PUBLIC_GOLD_TEMPLATES.find((item) => item.caseId === caseId) ?? null;
}
