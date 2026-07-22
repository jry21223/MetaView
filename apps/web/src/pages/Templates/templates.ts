/**
 * Template catalog entries. Published entries resolve to deterministic
 * static Playbook cases; the remaining entries stay visible as honest
 * "制作中" placeholders and never submit a pipeline run from this page.
 *
 * Adding a new template is a single object: pick a stable ``id``,
 * categorise it, write a one-line ``desc`` and a working ``prompt``.
 */

import type { TemplatePreviewCaseId } from "./templatePreviewCases";
import { PUBLIC_GOLD_TEMPLATES } from "./gold-templates/publicGoldTemplates";

export type TemplateDomain =
  | "algorithm"
  | "math"
  | "code"
  | "physics"
  | "chemistry"
  | "biology"
  | "geography";

export interface TemplateDef {
  id: string;
  domain: TemplateDomain;
  title: string;
  desc: string;
  prompt: string;
  previewCaseId?: TemplatePreviewCaseId;
}

export const TEMPLATE_DOMAIN_LABEL: Record<TemplateDomain, string> = {
  algorithm: "算法",
  math: "数学",
  code: "代码",
  physics: "物理",
  chemistry: "化学",
  biology: "生物",
  geography: "地理",
};

function publicGoldEntry(caseId: string, domain: TemplateDomain): TemplateDef {
  const manifest = PUBLIC_GOLD_TEMPLATES.find((item) => item.caseId === caseId);
  if (!manifest) throw new Error(`Missing public Gold Template manifest: ${caseId}`);
  return {
    id: manifest.caseId,
    previewCaseId: manifest.caseId,
    domain,
    title: manifest.title,
    desc: manifest.description,
    prompt: manifest.canonicalPrompt,
  };
}

export const TEMPLATES: ReadonlyArray<TemplateDef> = [
  // ---- algorithm ----
  {
    id: "merge-sort",
    domain: "algorithm",
    title: "归并排序",
    desc: "数组分治 → 合并的全过程可视化",
    prompt: "把归并排序的过程画出来，数组是 [5,2,8,1,9,3,7,4]，每一步展示分治和合并",
  },
  {
    id: "quick-sort",
    domain: "algorithm",
    title: "快速排序",
    desc: "选 pivot、分区、递归的对比演示",
    prompt: "演示快速排序对 [3,6,1,8,2,5,4,7] 的执行过程，标出每一步的 pivot 和分区",
  },
  {
    id: "binary-search",
    previewCaseId: "binary-search",
    domain: "algorithm",
    title: "二分查找",
    desc: "有序数组中收敛区间的步骤可视化",
    prompt: "对有序数组 [2,4,7,11,15,19,22,28,33,40] 二分查找 22，展示每一步的左右指针和中点",
  },
  {
    id: "bfs-tree",
    previewCaseId: "bfs-tree",
    domain: "algorithm",
    title: "二叉树 BFS",
    desc: "队列驱动的层序遍历",
    prompt: "演示对一棵二叉树做 BFS（层序遍历），节点是 1,2,3,4,5,6,7，画出每一步队列的变化",
  },

  // ---- math ----
  {
    id: "integral-area",
    domain: "math",
    title: "定积分的几何意义",
    desc: "黎曼和逐步逼近曲线下面积",
    prompt: "讲解定积分 ∫₀² x² dx 的几何意义：用黎曼和逐步逼近曲线下面积，最终给出 8/3",
  },
  {
    id: "derivative-tangent",
    previewCaseId: "derivative-tangent",
    domain: "math",
    title: "导数与切线",
    desc: "可拖动 marker_x 看切线如何变化",
    prompt: "画出 f(x) = x² 在不同点的切线，导数 f'(x) = 2x，用滑杆控制切点 x 的位置",
  },
  ...PUBLIC_GOLD_TEMPLATES.filter((item) => item.subject === "high_school_math").map((item) => ({
    id: item.caseId,
    previewCaseId: item.caseId,
    domain: "math" as const,
    title: item.title,
    desc: item.description,
    prompt: item.canonicalPrompt,
  })),
  {
    id: "fourier-two-tone",
    domain: "math",
    title: "傅里叶分解 · 双频合成",
    desc: "两个正弦波叠加成合成波，每个分量独立滑杆",
    prompt: "演示两个正弦分量 A1·sin(ω1·x) + A2·sin(ω2·x) 如何合成一个复合波，让 A1、ω1、A2、ω2 都是可拖动的参数",
  },
  {
    id: "green-theorem",
    domain: "math",
    title: "格林公式",
    desc: "边界线积分与区域旋度积分的对应",
    prompt: "用动画讲解格林公式，说明边界线积分与区域旋度积分为什么相等，并用 F=(-y/2,x/2) 在单位正方形上验证",
  },
  {
    id: "vector-field-curl",
    domain: "math",
    title: "向量场与旋度",
    desc: "F=(-y,x) 的环路积分几何含义",
    prompt: "可视化二维向量场 F = (-y, x) 在单位圆上的环路积分，解释旋度的几何含义",
  },

  // ---- code ----
  publicGoldEntry("two-sum", "code"),
  {
    id: "fib-memo",
    domain: "code",
    title: "斐波那契 · 记忆化",
    desc: "递归 → 备忘录的步骤推进",
    prompt: "讲解带备忘录的斐波那契数列 fib(6) 的计算过程，展示哪些子问题被缓存复用",
  },

  // ---- physics ----
  {
    id: "incline-friction",
    domain: "physics",
    title: "斜面摩擦受力分析",
    desc: "重力分解、摩擦力、加速度",
    prompt: "质量 2kg 物体在 30° 斜面上，摩擦系数 0.2，重力加速度 10m/s²，分析受力并求沿斜面方向的加速度",
  },
  publicGoldEntry("projectile", "physics"),
  {
    id: "spring-shm",
    domain: "physics",
    title: "弹簧简谐振动",
    desc: "x(t) = A·cos(ωt) 的能量交换",
    prompt: "讲解质量为 1kg、劲度系数 k=4 N/m 的弹簧振子简谐运动，画出位移、速度、动能随时间的变化",
  },

  // ---- chemistry ----
  publicGoldEntry("redox-electron", "chemistry"),
  {
    id: "neutralization",
    domain: "chemistry",
    title: "强酸强碱中和",
    desc: "HCl + NaOH 的滴定与 pH 变化",
    prompt: "讲解 HCl 与 NaOH 的中和反应：写出化学方程式，分别在反应前/中/后展示离子分布和 pH",
  },

  // ---- biology ----
  {
    id: "atp-synthesis",
    domain: "biology",
    title: "细胞呼吸 · ATP 合成",
    desc: "糖酵解 → 三羧酸 → 电子传递链",
    prompt: "讲解细胞有氧呼吸的三个阶段：糖酵解、三羧酸循环、电子传递链，每个阶段产生多少 ATP",
  },
  publicGoldEntry("dna-replication", "biology"),

  // ---- geography ----
  publicGoldEntry("monsoon", "geography"),
  {
    id: "plate-tectonics",
    domain: "geography",
    title: "板块运动 · 海岭俯冲",
    desc: "三种边界类型与对应地貌",
    prompt: "讲解板块构造的三种边界（生长 / 消亡 / 转换），每种对应的典型地貌和地震分布",
  },
];

export function templatesByDomain(): Array<{ domain: TemplateDomain; items: TemplateDef[] }> {
  const map = new Map<TemplateDomain, TemplateDef[]>();
  for (const tpl of TEMPLATES) {
    const arr = map.get(tpl.domain);
    if (arr) arr.push(tpl);
    else map.set(tpl.domain, [tpl]);
  }
  return Array.from(map.entries()).map(([domain, items]) => ({ domain, items }));
}
