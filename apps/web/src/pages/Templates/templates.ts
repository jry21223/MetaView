/**
 * Template catalog entries. Four published entries resolve to deterministic
 * static Playbook cases; the remaining entries stay visible as honest
 * "制作中" placeholders and never submit a pipeline run from this page.
 *
 * Adding a new template is a single object: pick a stable ``id``,
 * categorise it, write a one-line ``desc`` and a working ``prompt``.
 */

import type { TemplatePreviewCaseId } from "./templatePreviewCases";

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
  {
    id: "two-sum",
    domain: "code",
    title: "两数之和 · 哈希表",
    desc: "Python 实现 + 哈希表查找过程",
    prompt:
      "讲解 LeetCode 两数之和的哈希表解法：```python\ndef two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n    return []\n```\n用 nums=[2,7,11,15], target=9 演示",
  },
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
  {
    id: "projectile",
    previewCaseId: "projectile",
    domain: "physics",
    title: "抛体运动",
    desc: "初速度分解 + 轨迹绘制",
    prompt: "一个物体以 20 m/s 初速度、45° 仰角抛出，画出轨迹并求最大高度和落地距离",
  },
  {
    id: "spring-shm",
    domain: "physics",
    title: "弹簧简谐振动",
    desc: "x(t) = A·cos(ωt) 的能量交换",
    prompt: "讲解质量为 1kg、劲度系数 k=4 N/m 的弹簧振子简谐运动，画出位移、速度、动能随时间的变化",
  },

  // ---- chemistry ----
  {
    id: "redox-electron",
    domain: "chemistry",
    title: "氧化还原 · 电子转移",
    desc: "Zn + CuSO₄ → ZnSO₄ + Cu",
    prompt: "讲解 Zn + CuSO₄ → ZnSO₄ + Cu 的氧化还原反应，标出电子转移方向和氧化态变化",
  },
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
  {
    id: "dna-replication",
    domain: "biology",
    title: "DNA 复制",
    desc: "半保留 + 前导/后随链",
    prompt: "画出 DNA 半保留复制的过程，标出前导链和后随链的合成方向以及冈崎片段",
  },

  // ---- geography ----
  {
    id: "monsoon",
    domain: "geography",
    title: "东亚季风",
    desc: "海陆热力差驱动的季节风向",
    prompt: "解释东亚季风的形成：冬夏季海陆热力差异如何驱动风向反转，对降水的影响",
  },
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
