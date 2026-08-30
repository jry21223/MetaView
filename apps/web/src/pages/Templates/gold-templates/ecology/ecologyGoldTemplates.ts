import type {
  MathPlotSnapshot,
  PlaybookScript,
} from "../../../../features/playbook/engine/types";
import type { TemplatePreviewParams } from "../../templatePreviewCases";
import type { GoldTemplateManifest } from "../manifest";
import {
  boundedNumber,
  fixed,
  playbook,
  sceneStep,
  standaloneCase,
} from "../standaloneCaseHelpers";

/**
 * 生态学课程包 · 种间与群落三案例（高校试点）。
 *
 * 与 logistic-growth / rabbit-chaos 组成完整弧线：单种群（连续、离散）→
 * 捕食耦合 → 竞争排斥 → 岛屿群落。三案例延续同一标准：真实数据或真实
 * 实验开场、逐步机制推理、参数分步生效、模型边界收尾。
 *
 * - predator-prey：哈德逊湾公司毛皮记录（1900–1920）+ Lotka-Volterra，
 *   相平面、中性环、Volterra 捕捞原理（一战亚得里亚海渔市）。
 * - competition-exclusion：Gause (1934) 双草履虫实验 + L-V 竞争，
 *   零增长等倾线的四种排布与生态位分化。
 * - island-biogeography：喀拉喀托 1883 后留鸟普查 + MacArthur-Wilson
 *   均衡理论，面积/距离效应与种-面积规律。
 *
 * 所有轨迹由文件内的 RK4 积分器确定性算出；每个旁白数字都由当前参数
 * 现算，测试锁定其与理论值的一致性。
 */

// ---------------------------------------------------------------------------
// 案例一 · 猞猁与雪兔：Lotka-Volterra 捕食循环

/**
 * Hudson's Bay Company pelt purchases, 1900–1920, thousands of pelts
 * (snowshoe hare / Canada lynx). The classic pairing compiled by
 * MacLulich (1937) and Elton & Nicholson (1942).
 */
const HARE_PELTS: readonly number[] = [
  30, 47.2, 70.2, 77.4, 36.3, 20.6, 18.1, 21.4, 22, 25.4, 27.1,
  40.3, 57, 76.6, 52.3, 19.5, 11.2, 7.6, 14.6, 16.2, 24.7,
];
const LYNX_PELTS: readonly number[] = [
  4, 6.1, 9.8, 35.2, 59.4, 41.7, 19, 13, 8.3, 9.1, 7.4,
  8, 12.3, 19.5, 45.7, 51.1, 29.7, 15.8, 9.7, 10.1, 8.6,
];
/** Fixed model constants: conversion efficiency and predator mortality. */
const LV_E = 0.75;
const LV_M = 0.72;
const LV_P0 = 4; // 1900 lynx record, thousands

interface LvOptions {
  /** Prey carrying capacity; null = pure Lotka-Volterra (no self-limit). */
  preyCapacity?: number | null;
  /** Uniform harvest effort applied to both species (Volterra's war term). */
  harvest?: number;
}

/** RK4 for dN/dt = rN(1−N/K?) − aNP − qN, dP/dt = eaNP − mP − qP. */
function lvTrajectory(
  r: number,
  a: number,
  n0: number,
  p0: number,
  years: number,
  options: LvOptions = {},
): Array<[number, number, number]> {
  const capacity = options.preyCapacity ?? null;
  const q = options.harvest ?? 0;
  const dt = 0.02;
  const deriv = (n: number, p: number): [number, number] => [
    r * n * (capacity ? 1 - n / capacity : 1) - a * n * p - q * n,
    LV_E * a * n * p - LV_M * p - q * p,
  ];
  let n = n0;
  let p = p0;
  const path: Array<[number, number, number]> = [[0, n, p]];
  const steps = Math.round(years / dt);
  for (let i = 1; i <= steps; i += 1) {
    const k1 = deriv(n, p);
    const k2 = deriv(n + (dt / 2) * k1[0], p + (dt / 2) * k1[1]);
    const k3 = deriv(n + (dt / 2) * k2[0], p + (dt / 2) * k2[1]);
    const k4 = deriv(n + dt * k3[0], p + dt * k3[1]);
    n = Math.max(0, n + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]));
    p = Math.max(0, p + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]));
    path.push([i * dt, n, p]);
  }
  return path;
}

/** Thin a trajectory to every nth sample so polylines stay light. */
function every<T>(items: readonly T[], nth: number): T[] {
  return items.filter((_, index) => index % nth === 0 || index === items.length - 1);
}

const timeSeries = (
  path: Array<[number, number, number]>,
  component: 1 | 2,
): Array<[number, number]> => every(path, 5).map((s) => [s[0], s[component]] as [number, number]);

const phaseLine = (path: Array<[number, number, number]>): Array<[number, number]> =>
  every(path, 5).map((s) => [s[1], s[2]] as [number, number]);

export function buildPredatorPreyGoldPlaybook(params: TemplatePreviewParams): PlaybookScript {
  const r = boundedNumber(params, "r", 0.55, 0.3, 0.9);
  const a = boundedNumber(params, "a", 0.028, 0.015, 0.05);
  const harvest = boundedNumber(params, "q", 0, 0, 0.35);
  const n0 = boundedNumber(params, "N0", 30, 5, 80);
  const nStar = LV_M / (LV_E * a);
  const pStar = r / a;

  const peltYears = { xMax: 20, xLabel: "年份（1900 年起算）", yLabel: "毛皮数（千张）" };
  const plot = (args: {
    curves?: MathPlotSnapshot["curves"];
    lines?: MathPlotSnapshot["polylines"];
    points?: MathPlotSnapshot["points"];
    marker?: number;
    caption: string;
    formula: string;
    window?: { xMax?: number; yMax?: number; xLabel?: string; yLabel?: string };
  }): MathPlotSnapshot => ({
    kind: "math_plot",
    pack_id: "math-basic",
    curves: args.curves ?? [],
    points: args.points,
    polylines: args.lines,
    x_min: 0,
    x_max: args.window?.xMax ?? peltYears.xMax,
    y_min: 0,
    y_max: args.window?.yMax ?? 90,
    marker_x: args.marker ?? null,
    x_label: args.window?.xLabel ?? peltYears.xLabel,
    y_label: args.window?.yLabel ?? peltYears.yLabel,
    formula_latex: args.formula,
    caption: args.caption,
  });
  const phaseWindow = { xMax: 100, yMax: 65, xLabel: "雪兔 N（千）", yLabel: "猞猁 P（千）" };

  const hareLine = {
    points: HARE_PELTS.map((value, year) => [year, value] as [number, number]),
    label: "雪兔",
    emphasis: "primary" as const,
    semantic_role: "pelt_record",
  };
  const lynxLine = {
    points: LYNX_PELTS.map((value, year) => [year, value] as [number, number]),
    label: "猞猁",
    emphasis: "accent" as const,
    semantic_role: "pelt_record_predator",
  };
  const peakDots = [
    { x: 3, y: HARE_PELTS[3], label: "1903", semantic_role: "cycle_peak" },
    { x: 4, y: LYNX_PELTS[4], label: "1904", emphasis: "accent", semantic_role: "cycle_peak" },
    { x: 13, y: HARE_PELTS[13], label: "1913", semantic_role: "cycle_peak" },
    { x: 15, y: LYNX_PELTS[15], label: "1915", emphasis: "accent", semantic_role: "cycle_peak" },
  ];

  // Steps 1–2 retell the historical fit against the pelt record, so they pin
  // the fitted defaults; the sliders drive the phase-plane steps.
  const fitPath = lvTrajectory(0.55, 0.028, 30, LV_P0, 21);
  const orbitPath = lvTrajectory(r, a, n0, LV_P0, 46);
  const equilibriumDot = {
    x: nStar,
    y: pStar,
    label: `(${fixed(nStar, 0)}, ${fixed(pStar, 0)})`,
    emphasis: "accent",
    semantic_role: "equilibrium_point",
  };
  const preyIsocline = {
    expression: `${fixed(pStar, 3)}`,
    label: "P=r/a",
    emphasis: "secondary" as const,
    semantic_role: "zero_growth_isocline",
  };
  const predatorIsocline = {
    points: [[nStar, 0], [nStar, phaseWindow.yMax]] as Array<[number, number]>,
    label: "N=m/(ea)",
    emphasis: "secondary" as const,
    semantic_role: "zero_growth_isocline",
  };

  const shiftedN = (LV_M + harvest) / (LV_E * a);
  const shiftedP = (r - harvest) / a;
  const harvestPath = lvTrajectory(r, a, n0, LV_P0, 46, { harvest });
  const dampedPath = lvTrajectory(r, a, n0, LV_P0, 80, { preyCapacity: 150 });
  const dampedFocusP = pStar * (1 - nStar / 150);

  const steps = [
    sceneStep(0, "lv-data-pelts", "毛皮账本里的双波", "换一本账本：哈德逊湾公司收购毛皮的记录，1900 到 1920 年。雪兔大约十年一个峰，猞猁跟着起落，但它的峰总是晚一到两年。两条曲线互相追了二十年，谁也没甩开谁，谁也没吃光谁。是谁在驱动谁？", plot({
      lines: [hareLine, lynxLine],
      points: peakDots,
      caption: "哈德逊湾公司毛皮收购量（MacLulich 1937；Elton & Nicholson 1942 整理）。",
      formula: String.raw`T\approx 10\ \text{年},\ \text{猞猁滞后 }1\text{–}2\ \text{年}`,
    })),
    sceneStep(1, "lv-equations", "两个咬合的方程", "Lotka 和 Volterra 各自写下同一对方程：雪兔没有天敌时按 rN 指数增长，被捕食拖走 aNP；猞猁吃到雪兔才增长 eaNP，否则以速率 m 饿死。四个参数，没有一个是随机数。取 r=0.55、a=0.028，从 1900 年的起点出发积分：峰的间隔约 11 年，猞猁晚约一年半——和账本对上了。", plot({
      lines: [
        { points: timeSeries(fitPath, 1), label: "N(t)", emphasis: "primary", semantic_role: "model_prey" },
        { points: timeSeries(fitPath, 2), label: "P(t)", emphasis: "accent", semantic_role: "model_predator" },
      ],
      points: HARE_PELTS.map((value, year) => ({ x: year, y: value, emphasis: "secondary", semantic_role: "pelt_record" })),
      caption: "实线：模型；灰点：雪兔实录。e=0.75、m=0.72 固定，r、a 归你。",
      formula: String.raw`\frac{dN}{dt}=rN-aNP,\quad \frac{dP}{dt}=eaNP-mP`,
    })),
    sceneStep(2, "lv-four-beats", "循环的四拍", "为什么会绕圈？把一个周期拆成四拍：兔多，猞猁吃饱、数量上来；猞猁多，兔被压下去；兔少，猞猁挨饿、跟着下来；猞猁少，兔喘过气再起。每一拍都是上一拍的结果——因果连成环，滞后就不是巧合，而是必然：捕食者永远在追赶猎物的上一幕。", plot({
      lines: [
        { points: timeSeries(fitPath, 1), label: "雪兔", emphasis: "primary", semantic_role: "model_prey" },
        { points: timeSeries(fitPath, 2), label: "猞猁", emphasis: "accent", semantic_role: "model_predator" },
      ],
      caption: "四拍：兔涨→猁涨→兔跌→猁跌，然后从头再来。",
      formula: String.raw`N\uparrow\ \Rightarrow\ P\uparrow\ \Rightarrow\ N\downarrow\ \Rightarrow\ P\downarrow\ \Rightarrow\ \cdots`,
    })),
    sceneStep(3, "lv-phase-plane", "相平面：把时间折成一个环", `换一种画法：横轴雪兔，纵轴猞猁，时间藏进轨迹的走向。两条零增长线把平面切成四个象限——横线 P=r/a=${fixed(pStar, 0)} 上雪兔不增不减，竖线 N=m/(ea)=${fixed(nStar, 0)} 上猞猁不增不减。刚才的四拍就是逆时针绕这两条线的交点转圈，交点 (${fixed(nStar, 0)}, ${fixed(pStar, 0)}) 恰好落在账本二十一年的平均值旁边。`, plot({
      lines: [
        { points: phaseLine(orbitPath), label: "轨道", emphasis: "primary", semantic_role: "model_orbit" },
        predatorIsocline,
      ],
      curves: [preyIsocline],
      points: [equilibriumDot],
      window: phaseWindow,
      caption: "逆时针一圈 = 时间序列里的一个周期。",
      formula: String.raw`N^*=\frac{m}{ea}=${fixed(nStar, 0)},\quad P^*=\frac{r}{a}=${fixed(pStar, 0)}`,
    })),
    sceneStep(4, "lv-neutral-cycles", "中性环：振幅由起点决定", `同样的参数，换三个起点：每个起点画出自己的环，既不收敛到中心，也不互相靠拢。这叫中性稳定——扰动不会被遗忘，一场瘟疫、一个暖冬，都会让种群换一条轨道绕。把右侧 N₀ 从 ${fixed(n0, 0)} 拖开，最外圈会当场换一条环给你看。`, plot({
      lines: [
        { points: phaseLine(orbitPath), label: `N₀=${fixed(n0, 0)}`, emphasis: "primary", semantic_role: "model_orbit" },
        { points: phaseLine(lvTrajectory(r, a, 45, 15, 16)), label: "N₀=45, P₀=15", emphasis: "secondary", semantic_role: "model_orbit" },
        { points: phaseLine(lvTrajectory(r, a, 38, 18, 14)), label: "N₀=38, P₀=18", emphasis: "secondary", semantic_role: "model_orbit" },
      ],
      points: [equilibriumDot],
      window: phaseWindow,
      caption: "嵌套的环：每个初值一条，谁也不吸引谁。",
      formula: String.raw`H=eaN-m\ln N+aP-r\ln P=\text{常数}`,
    })),
    sceneStep(5, "lv-data-loop", "验证：账本画进相平面", "把二十一年的真实记录按年份连起来，放进同一张相平面：它也在逆时针绕圈，绕的中心就在模型的均衡点附近；圈会漂、会变形——真实世界的 r 和 a 年年在变——但方向、中心、圈过的位置都是模型预言的样子。一张 1937 年整理的账本，绕着 1926 年写下的方程转。", plot({
      lines: [
        { points: HARE_PELTS.map((value, year) => [value, LYNX_PELTS[year]] as [number, number]), label: "1900→1920", emphasis: "primary", semantic_role: "pelt_loop" },
        { points: phaseLine(orbitPath), label: "模型轨道", emphasis: "secondary", semantic_role: "model_orbit" },
      ],
      points: [
        equilibriumDot,
        { x: HARE_PELTS[0], y: LYNX_PELTS[0], label: "1900", semantic_role: "loop_start" },
        { x: HARE_PELTS[4], y: LYNX_PELTS[4], label: "1904", semantic_role: "loop_mark" },
        { x: HARE_PELTS[13], y: LYNX_PELTS[13], label: "1913", semantic_role: "loop_mark" },
      ],
      window: phaseWindow,
      caption: "数据的圈绕着模型的交点转——不完美，但同一个方向、同一个中心。",
      formula: String.raw`\bar N_{\text{数据}}\approx 34,\ \bar P_{\text{数据}}\approx 20`,
    })),
    sceneStep(6, "lv-volterra", "战争、渔市与鲨鱼", harvest < 1e-9
      ? "1920 年代，生物学家 d'Ancona 在亚得里亚海的渔市账目里发现怪事：一战期间捕捞几乎停摆，市面上鲨鱼等捕食者的占比反而从约 12% 涨到 36%。他把问题交给数学家 Volterra。答案就藏在方程里：均匀捕捞对两个物种各减去一项 qN、qP。把右侧捕捞强度 q 拖起来，看均衡点往哪边搬家。"
      : shiftedP > 1e-9
        ? `捕捞强度 q=${fixed(harvest, 2)}：均衡点从 (${fixed(nStar, 0)}, ${fixed(pStar, 0)}) 搬到 (${fixed(shiftedN, 0)}, ${fixed(shiftedP, 0)})——猎物的平均数反而更高，捕食者更低。这就是 Volterra 原理：均匀捕捞帮猎物、伤捕食者；战时停捕则反过来，鲨鱼占比上升。农药同杀害虫与天敌时，抬高的往往也是害虫。`
        : `q=${fixed(harvest, 2)} 已不低于 r=${fixed(r, 2)}：猞猁被清零，而这个模型里雪兔没有 K，失去天敌后将指数逃逸——荒谬的结局提醒你：缺一块骨架的模型，外推要小心。下一步就补这块骨架。`, plot({
      lines: [
        { points: phaseLine(harvest < 1e-9 ? orbitPath : harvestPath), label: harvest < 1e-9 ? "q=0" : `q=${fixed(harvest, 2)}`, emphasis: "primary", semantic_role: "harvested_orbit" },
        predatorIsocline,
      ],
      curves: [preyIsocline],
      points: harvest > 1e-9 && shiftedP > 1e-9
        ? [
          { ...equilibriumDot, emphasis: "secondary", label: "无捕捞" },
          { x: shiftedN, y: shiftedP, label: `(${fixed(shiftedN, 0)}, ${fixed(shiftedP, 0)})`, emphasis: "accent", semantic_role: "shifted_equilibrium" },
        ]
        : [equilibriumDot],
      window: phaseWindow,
      caption: "Volterra 原理：捕捞把均衡点沿「猎物多、捕食者少」的方向平移。",
      formula: String.raw`N^*_q=\frac{m+q}{ea},\quad P^*_q=\frac{r-q}{a}`,
    })),
    sceneStep(7, "lv-boundary", "模型的边界：环为什么不散？", `给雪兔补上它自己的 K：增长项换成 rN(1−N/150)。只加这一项，中性环立刻变成向内的螺旋，收进焦点 (${fixed(nStar, 0)}, ${fixed(dampedFocusP, 0)})——环是靠“猎物无自限”这个假设撑着的。可账本里的循环持续了两百年不衰减，谜题反转：真实世界靠什么维持振荡？时滞、雪兔与食物的另一层耦合、行为反应——都在候选名单上。没有猞猁的安蒂科斯蒂岛上，雪兔照样十年一轮。`, plot({
      lines: [
        { points: phaseLine(dampedPath), emphasis: "primary", semantic_role: "damped_spiral" },
        { points: phaseLine(orbitPath), label: "纯 L-V", emphasis: "secondary", semantic_role: "model_orbit" },
      ],
      points: [{ x: nStar, y: dampedFocusP, label: "焦点", emphasis: "accent", semantic_role: "equilibrium_point" }],
      window: phaseWindow,
      caption: "一项密度制约，环就收拢：持续的振荡反而成了更深的问题。",
      formula: String.raw`\frac{dN}{dt}=rN\left(1-\frac{N}{150}\right)-aNP`,
    })),
    sceneStep(8, "lv-sandbox", "沙盘：四个旋钮归你", `旁白到此为止。r 抬高猎物等倾线，a 同时压低两条线，q 沿对角搬均衡点，N₀ 换轨道。读图口诀：横竖两条线定中心，起点定环的大小，逆时针是铁律。试试把 a 拖到 0.05 再把 q 推过 r=${fixed(r, 2)}，两种崩法长得完全不一样。下一课：不靠牙齿的战争——竞争。`, plot({
      lines: [
        { points: phaseLine(harvest > 1e-9 ? harvestPath : orbitPath), label: "当前参数", emphasis: "primary", semantic_role: "model_orbit" },
        predatorIsocline,
      ],
      curves: [preyIsocline],
      points: [harvest > 1e-9 && shiftedP > 1e-9
        ? { x: shiftedN, y: shiftedP, label: "均衡", emphasis: "accent", semantic_role: "shifted_equilibrium" }
        : equilibriumDot],
      window: phaseWindow,
      caption: "自由沙盘：等倾线、均衡点与环都会跟着参数重算。",
      formula: String.raw`\frac{dN}{dt}=rN-aNP-qN,\quad \frac{dP}{dt}=eaNP-mP-qP`,
    })),
  ];
  return playbook(
    "biology",
    "猞猁与雪兔 · 捕食循环",
    "哈德逊湾毛皮数据到 Lotka-Volterra：相平面、中性环、Volterra 原理与模型边界。",
    "ecology_predator_prey",
    steps,
    [
      { id: "r", label: "雪兔增长率 r", value: fixed(r, 2), description: "0.3 到 0.9；默认 0.55" },
      { id: "a", label: "捕食效率 a", value: fixed(a, 3), description: "0.015 到 0.05；默认 0.028" },
      { id: "q", label: "捕捞强度 q", value: fixed(harvest, 2), description: "0 到 0.35；q≥r 时猞猁清零" },
      { id: "N0", label: "初始雪兔 N₀", value: fixed(n0, 0), description: "5 到 80；换一条环" },
    ],
  );
}

// ---------------------------------------------------------------------------
// 案例二 · 草履虫之争：竞争排斥原理

/** Gause (1934) anchors: carrying capacities in his 0.5 mL counting units. */
const COMP_K1 = 105; // P. aurelia
const COMP_K2 = 64; // P. caudatum
const COMP_R1 = 0.8;
const COMP_R2 = 0.65;

/** RK4 for the Lotka-Volterra competition pair. */
function competitionTrajectory(
  alpha: number,
  beta: number,
  n10: number,
  n20: number,
  days: number,
): Array<[number, number, number]> {
  const dt = 0.02;
  const deriv = (n1: number, n2: number): [number, number] => [
    (COMP_R1 * n1 * (COMP_K1 - n1 - alpha * n2)) / COMP_K1,
    (COMP_R2 * n2 * (COMP_K2 - n2 - beta * n1)) / COMP_K2,
  ];
  let n1 = n10;
  let n2 = n20;
  const path: Array<[number, number, number]> = [[0, n1, n2]];
  const steps = Math.round(days / dt);
  for (let i = 1; i <= steps; i += 1) {
    const k1 = deriv(n1, n2);
    const k2 = deriv(n1 + (dt / 2) * k1[0], n2 + (dt / 2) * k1[1]);
    const k3 = deriv(n1 + (dt / 2) * k2[0], n2 + (dt / 2) * k2[1]);
    const k4 = deriv(n1 + dt * k3[0], n2 + dt * k3[1]);
    n1 = Math.max(0, n1 + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]));
    n2 = Math.max(0, n2 + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]));
    path.push([i * dt, n1, n2]);
  }
  return path;
}

/** Interior equilibrium of the competition pair (may be negative = absent). */
export function competitionInterior(alpha: number, beta: number): { n1: number; n2: number } {
  return {
    n1: (COMP_K1 - alpha * COMP_K2) / (1 - alpha * beta),
    n2: (COMP_K2 - beta * COMP_K1) / (1 - alpha * beta),
  };
}

/** Which of the four textbook regimes the coefficient pair lands in. */
export function competitionRegime(alpha: number, beta: number): string {
  const sp1Safe = COMP_K1 / alpha > COMP_K2; // sp2 cannot cap sp1's isocline
  const sp2Safe = COMP_K2 / beta > COMP_K1;
  if (sp1Safe && !sp2Safe) return "双小核草履虫稳赢";
  if (!sp1Safe && sp2Safe) return "大草履虫稳赢";
  if (sp1Safe && sp2Safe) return "稳定共存";
  return "先到者赢";
}

export function buildCompetitionGoldPlaybook(params: TemplatePreviewParams): PlaybookScript {
  const alpha = boundedNumber(params, "alpha", 1.5, 0.3, 2);
  const beta = boundedNumber(params, "beta", 0.7, 0.3, 1.2);
  const n10 = boundedNumber(params, "N10", 2, 2, 60);
  const n20 = boundedNumber(params, "N20", 2, 2, 60);

  const days = { xMax: 24, xLabel: "天数", yLabel: "个体数（每 0.5 mL）" };
  const phase = { xMax: 130, yMax: 80, xLabel: "双小核草履虫 N₁", yLabel: "大草履虫 N₂" };
  const plot = (args: {
    curves?: MathPlotSnapshot["curves"];
    lines?: MathPlotSnapshot["polylines"];
    points?: MathPlotSnapshot["points"];
    caption: string;
    formula: string;
    window?: { xMax?: number; yMax?: number; xLabel?: string; yLabel?: string };
  }): MathPlotSnapshot => ({
    kind: "math_plot",
    pack_id: "math-basic",
    curves: args.curves ?? [],
    points: args.points,
    polylines: args.lines,
    x_min: 0,
    x_max: args.window?.xMax ?? days.xMax,
    y_min: 0,
    y_max: args.window?.yMax ?? 120,
    x_label: args.window?.xLabel ?? days.xLabel,
    y_label: args.window?.yLabel ?? days.yLabel,
    formula_latex: args.formula,
    caption: args.caption,
  });

  /**
   * Zero-growth isoclines as segments, clipped to the phase window so their
   * end-of-line labels always land on visible, furniture-free spots.
   */
  const isoclines = (a: number, b: number) => {
    const yCap = 66;
    const xCap = 125;
    const n1Top: [number, number] =
      COMP_K1 / a > yCap ? [COMP_K1 - a * yCap, yCap] : [0, COMP_K1 / a];
    const n2Start: [number, number] =
      COMP_K2 / b > xCap ? [xCap, COMP_K2 - b * xCap] : [COMP_K2 / b, 0];
    return [
      {
        points: [[COMP_K1, 0], n1Top] as Array<[number, number]>,
        label: "N₁ 停线",
        emphasis: "primary" as const,
        semantic_role: "zero_growth_isocline",
      },
      {
        points: [n2Start, [0, COMP_K2]] as Array<[number, number]>,
        label: "N₂ 停线",
        emphasis: "accent" as const,
        semantic_role: "zero_growth_isocline",
      },
    ];
  };
  /** Start-of-trajectory dot: labels live here, away from converging ends. */
  const startDot = (x: number, y: number) => ({
    x,
    y,
    label: `(${fixed(x, 0)}, ${fixed(y, 0)})`,
    emphasis: "secondary",
    semantic_role: "trajectory_start",
  });
  const logisticCurve = (r: number, k: number, label: string, emphasis: "primary" | "accent") => ({
    expression: `${k}/(1+${fixed((k - 2) / 2, 2)}*exp(-${r}*x))`,
    label,
    emphasis,
    semantic_role: "alone_growth",
  });

  // Steps 0–2 and 4 retell Gause's actual experiment, so they pin his fitted
  // coefficients; the sliders drive the isocline step and the sandbox.
  const gauseMixed = competitionTrajectory(1.5, 0.7, 2, 2, 40);
  const mixedAt = (day: number) => gauseMixed[Math.round(day / 0.02)];
  const mixedPeak = gauseMixed.reduce((best, s) => (s[2] > best[2] ? s : best), gauseMixed[0]);
  const coexist = competitionInterior(0.6, 0.4);
  const founderInterior = competitionInterior(1.8, 0.9);
  const interior = competitionInterior(alpha, beta);
  const regime = competitionRegime(alpha, beta);
  const sandbox = competitionTrajectory(alpha, beta, n10, n20, 60);

  const steps = [
    sceneStep(0, "comp-alone", "分开养，各自安好", "1934 年，Gause 把两种草履虫分别放进 0.5 毫升培养液，每天投喂定量细菌、每天计数。双小核草履虫稳稳爬到约 105 的平台，大草履虫爬到约 64——各是一条标准的 logistic 曲线，各有各的 K。上一课的方程，在显微镜下活着。", plot({
      curves: [
        logisticCurve(COMP_R1, COMP_K1, "双小核草履虫", "primary"),
        logisticCurve(COMP_R2, COMP_K2, "大草履虫", "accent"),
        { expression: `${COMP_K1}`, label: "K₁=105", emphasis: "secondary", semantic_role: "carrying_capacity" },
        { expression: `${COMP_K2}`, label: "K₂=64", emphasis: "secondary", semantic_role: "carrying_capacity" },
      ],
      caption: "按 Gause (1934) 实验重建：单独培养，各自到达各自的 K。",
      formula: String.raw`K_1=105,\quad K_2=64`,
    })),
    sceneStep(1, "comp-together", "同一瓶的结局", `再把它们放进同一瓶，食物不变。前一周相安无事——大草履虫第 ${fixed(mixedPeak[0], 0)} 天冲到约 ${fixed(mixedPeak[2], 0)}，好像也要起飞。然后曲线调头：第 16 天跌回 ${fixed(mixedAt(16)[2], 0)}，第 24 天只剩约 ${fixed(mixedAt(24)[2], 0)}，一路滑向清零。它单独活得好好的，没有谁吃谁，为什么一起养就消失？`, plot({
      lines: [
        { points: every(gauseMixed, 5).map((s) => [s[0], s[1]] as [number, number]), label: "双小核", emphasis: "primary", semantic_role: "competition_trajectory" },
        { points: every(gauseMixed, 5).map((s) => [s[0], s[2]] as [number, number]), label: "大草履虫", emphasis: "accent", semantic_role: "competition_trajectory" },
      ],
      curves: [{ expression: `${COMP_K2}`, label: "它独居的 K₂", emphasis: "secondary", semantic_role: "carrying_capacity" }],
      caption: "混养：一条继续上行，另一条先起后落。没有捕食，只有共享的食物。",
      formula: String.raw`\text{混养 24 天：}N_1\to ${fixed(mixedAt(24)[1], 0)},\ N_2\to ${fixed(mixedAt(24)[2], 0)}`,
    })),
    sceneStep(2, "comp-equations", "把「挤」写进方程", "武器不是牙齿，是同一碗饭。在各自的 logistic 里，给对方留一个位置：α 表示一个大草履虫吃掉的资源折合多少个双小核，β 反过来。α、β 是竞争的汇率。这里 α=1.5——大草履虫个头大、吃得多，每一个都顶一个半对手；β=0.7。方程写完，结局就已经写完，只是我们还没看出来。", plot({
      lines: [
        { points: every(gauseMixed, 5).map((s) => [s[0], s[1]] as [number, number]), label: "双小核", emphasis: "primary", semantic_role: "competition_trajectory" },
        { points: every(gauseMixed, 5).map((s) => [s[0], s[2]] as [number, number]), label: "大草履虫", emphasis: "accent", semantic_role: "competition_trajectory" },
      ],
      caption: "同一组数据，现在带着方程再看一遍。",
      formula: String.raw`\frac{dN_1}{dt}=r_1N_1\frac{K_1-N_1-\alpha N_2}{K_1},\quad \frac{dN_2}{dt}=r_2N_2\frac{K_2-N_2-\beta N_1}{K_2}`,
    })),
    sceneStep(3, "comp-isoclines", "停线：平面上的两条直线", `想看清结局，去相平面：横轴 N₁，纵轴 N₂。令 dN₁/dt=0，得到一条直线 N₁+αN₂=K₁——线内 N₁ 还能涨，线外必须跌；大草履虫也有自己的停线 βN₁+N₂=K₂。两条线的相对位置决定一切。当前 α=${fixed(alpha, 2)}、β=${fixed(beta, 2)}：${regime}。拖动右侧的 α、β，亲手把两条线摆出别的位置。`, plot({
      lines: [
        ...isoclines(alpha, beta),
        { points: phaseLine(competitionTrajectory(alpha, beta, 2, 2, 60)), emphasis: "secondary", semantic_role: "competition_trajectory" },
      ],
      points: [startDot(2, 2)],
      window: phase,
      caption: "各自的刹车线：线内加速，线外减速，压线停住。",
      formula: String.raw`N_1+\alpha N_2=K_1,\qquad \beta N_1+N_2=K_2`,
    })),
    sceneStep(4, "comp-exclusion", "排斥：一条线罩住另一条", `Gause 场景里（α=1.5、β=0.7），双小核的停线整个罩在大草履虫的停线外面：平面上存在一条走廊，那里双小核还能涨、大草履虫已经必须跌。轨迹被推着沿对手的停线滑向 (105, 0)——大草履虫的清零不是意外，是几何。这就是竞争排斥原理：需求完全重叠的两个物种，不能长期共存。`, plot({
      lines: [
        ...isoclines(1.5, 0.7),
        { points: phaseLine(competitionTrajectory(1.5, 0.7, 2, 2, 60)), emphasis: "secondary", semantic_role: "competition_trajectory" },
      ],
      points: [
        startDot(2, 2),
        { x: COMP_K1, y: 0, label: "(105, 0)", emphasis: "accent", semantic_role: "boundary_equilibrium" },
      ],
      window: phase,
      caption: "外侧的停线赢：轨迹被夹进走廊，一路送到对方灭绝。",
      formula: String.raw`\frac{K_1}{\alpha}=70>K_2=64,\quad \frac{K_2}{\beta}\approx 91<K_1=105`,
    })),
    sceneStep(5, "comp-coexist", "共存：各自压自己更狠", `把竞争调弱：α=0.6、β=0.7 换成 β=0.4——每个物种压自己都比压对方狠。两条停线交叉，交点 (${fixed(coexist.n1, 0)}, ${fixed(coexist.n2, 0)}) 变成所有轨迹的归宿：从哪个角落出发都收进去。共存的判据由此而来：种内竞争强于种间竞争。写成代数就是 α<K₁/K₂=1.64 且 β<K₂/K₁=0.61，两条同时成立。`, plot({
      lines: [
        ...isoclines(0.6, 0.4),
        { points: phaseLine(competitionTrajectory(0.6, 0.4, 2, 2, 60)), emphasis: "secondary", semantic_role: "competition_trajectory" },
        { points: phaseLine(competitionTrajectory(0.6, 0.4, 120, 70, 60)), emphasis: "secondary", semantic_role: "competition_trajectory" },
      ],
      points: [
        startDot(2, 2),
        startDot(120, 70),
        { x: coexist.n1, y: coexist.n2, label: `(${fixed(coexist.n1, 0)}, ${fixed(coexist.n2, 0)})`, emphasis: "accent", semantic_role: "interior_equilibrium" },
      ],
      window: phase,
      caption: "交叉且各自让内：交点变成稳定的家，条条轨迹通向它。",
      formula: String.raw`\alpha<\frac{K_1}{K_2}\ \text{且}\ \beta<\frac{K_2}{K_1}\ \Rightarrow\ \text{稳定共存}`,
    })),
    sceneStep(6, "comp-founder", "第三种结局：先到者赢", `还有一种排布：α=1.8、β=0.9，双方压对方都比压自己狠。停线仍然交叉，但交点 (${fixed(founderInterior.n1, 0)}, ${fixed(founderInterior.n2, 0)}) 是个鞍点——理论上能停住，任何风吹草动都会滑落。从 (40,10) 出发，双小核赢；从 (10,40) 出发，大草履虫赢。同样的规则，不同的开局，相反的结局：历史也被写进了方程。`, plot({
      lines: [
        ...isoclines(1.8, 0.9),
        { points: phaseLine(competitionTrajectory(1.8, 0.9, 40, 10, 60)), emphasis: "secondary", semantic_role: "competition_trajectory" },
        { points: phaseLine(competitionTrajectory(1.8, 0.9, 10, 40, 60)), emphasis: "secondary", semantic_role: "competition_trajectory" },
      ],
      points: [
        startDot(40, 10),
        startDot(10, 40),
        { x: founderInterior.n1, y: founderInterior.n2, label: "鞍点", emphasis: "accent", semantic_role: "interior_equilibrium" },
      ],
      window: phase,
      caption: "双方都欺负对方更狠：交点是分水岭，起点决定谁活下来。",
      formula: String.raw`\alpha>\frac{K_1}{K_2}\ \text{且}\ \beta>\frac{K_2}{K_1}\ \Rightarrow\ \text{先到者赢}`,
    })),
    sceneStep(7, "comp-bursaria", "Gause 的另一半实验", "Gause 还做了一组常被忽略的对照：把大草履虫换成绿草履虫，再混养。这次没有清零——双小核占据上层水体吃悬浮细菌，绿草履虫沉到瓶底吃酵母，两条曲线都停在了正数上。同一间瓶子，两份工作。竞争排斥原理因此有了下半句：完全重叠的生态位不能共存，而差异——哪怕只是一瓶水的上下——就是共存的通行证。", plot({
      lines: [
        ...isoclines(0.6, 0.4),
        { points: phaseLine(competitionTrajectory(0.6, 0.4, 2, 2, 60)), emphasis: "secondary", semantic_role: "competition_trajectory" },
      ],
      points: [{ x: coexist.n1, y: coexist.n2, label: "共存", emphasis: "accent", semantic_role: "interior_equilibrium" }],
      window: phase,
      caption: "生态位分化把 α、β 拉小，几何随之改写：排斥变共存。",
      formula: String.raw`\text{生态位分化}\ \Rightarrow\ \alpha,\beta\ \text{变小}`,
    })),
    sceneStep(8, "comp-sandbox", "沙盘：四种世界的地图", `α、β、两个起点，全部归你。当前 α=${fixed(alpha, 2)}、β=${fixed(beta, 2)}，判定：${regime}${interior.n1 > 0 && interior.n2 > 0 ? `，交点在 (${fixed(interior.n1, 0)}, ${fixed(interior.n2, 0)})` : ""}。读图口诀：先看两条停线交不交叉，交叉再问谁让着自己。把 α 推过 1.64、β 推过 0.61，四种世界依次路过。下一课离开双人对局，去数一整座岛的物种。`, plot({
      lines: [
        ...isoclines(alpha, beta),
        { points: phaseLine(sandbox), emphasis: "secondary", semantic_role: "competition_trajectory" },
      ],
      points: [
        startDot(n10, n20),
        interior.n1 > 0 && interior.n2 > 0
          ? { x: interior.n1, y: interior.n2, label: "交点", emphasis: "accent", semantic_role: "interior_equilibrium" }
          : { x: COMP_K1, y: 0, label: "K₁", emphasis: "secondary", semantic_role: "boundary_equilibrium" },
      ],
      window: phase,
      caption: "自由沙盘：停线、交点与轨迹都跟着 α、β 重算。",
      formula: String.raw`\alpha=${fixed(alpha, 2)},\ \beta=${fixed(beta, 2)}`,
    })),
  ];
  return playbook(
    "biology",
    "草履虫之争 · 竞争排斥",
    "Gause 1934 实验到 L-V 竞争：停线几何、四种结局与生态位分化。",
    "ecology_competition_exclusion",
    steps,
    [
      { id: "alpha", label: "竞争系数 α", value: fixed(alpha, 2), description: "0.3 到 2；1.64 是分界" },
      { id: "beta", label: "竞争系数 β", value: fixed(beta, 2), description: "0.3 到 1.2；0.61 是分界" },
      { id: "N10", label: "初始双小核 N₁₀", value: fixed(n10, 0), description: "2 到 60；先到者赢时起作用" },
      { id: "N20", label: "初始大草履虫 N₂₀", value: fixed(n20, 0), description: "2 到 60；先到者赢时起作用" },
    ],
  );
}

// ---------------------------------------------------------------------------
// 案例三 · 喀拉喀托的重生：岛屿生物地理学

/** Rakata resident land-bird counts after the 1883 sterilizing eruption. */
const KRAKATAU_BIRDS = [
  { x: 0, y: 0, label: "1883" },
  { x: 25, y: 13, label: "13" },
  { x: 37, y: 28, label: "28" },
  { x: 50, y: 29, label: "29" },
] as const;
const IBG_I0 = 0.016; // per-species colonization rate at distance 0
const IBG_E0 = 0.09; // per-species extinction rate on a unit-area island
const IBG_DHALF = 100; // km over which colonization halves

/** Colonization / extinction coefficients and the equilibrium richness. */
export function islandRates(area: number, distanceKm: number, pool: number): {
  ci: number;
  ce: number;
  sStar: number;
} {
  const ci = IBG_I0 * 2 ** (-distanceKm / IBG_DHALF);
  const ce = IBG_E0 / Math.sqrt(area);
  return { ci, ce, sStar: (pool * ci) / (ci + ce) };
}

export function buildIslandBiogeographyGoldPlaybook(
  params: TemplatePreviewParams,
): PlaybookScript {
  const area = boundedNumber(params, "A", 10, 1, 100);
  const distance = boundedNumber(params, "D", 40, 10, 400);
  const pool = boundedNumber(params, "P", 100, 50, 300);
  const { ci, ce, sStar } = islandRates(area, distance, pool);
  const turnover = ce * sStar;
  const defaultRates = islandRates(10, 40, 100);

  const ratePlot = (args: {
    curves: MathPlotSnapshot["curves"];
    lines?: MathPlotSnapshot["polylines"];
    points?: MathPlotSnapshot["points"];
    marker?: number;
    caption: string;
    formula: string;
    window?: { xMax?: number; yMax?: number; xLabel?: string; yLabel?: string };
  }): MathPlotSnapshot => ({
    kind: "math_plot",
    pack_id: "math-basic",
    curves: args.curves,
    points: args.points,
    polylines: args.lines,
    x_min: 0,
    x_max: args.window?.xMax ?? pool,
    y_min: 0,
    y_max: args.window?.yMax ?? pool * (ci + ce) * 0.55,
    marker_x: args.marker ?? null,
    x_label: args.window?.xLabel ?? "岛上物种数 S",
    y_label: args.window?.yLabel ?? "速率（种/年）",
    formula_latex: args.formula,
    caption: args.caption,
  });
  const immigrationCurve = (c: number, label: string, emphasis: "primary" | "secondary") => ({
    expression: `${fixed(c, 5)}*(${fixed(pool, 0)}-x)`,
    label,
    emphasis,
    semantic_role: "immigration_rate",
  });
  const extinctionCurve = (c: number, label: string, emphasis: "accent" | "secondary") => ({
    expression: `${fixed(c, 5)}*x`,
    label,
    emphasis,
    semantic_role: "extinction_rate",
  });
  const equilibriumPoint = (s: number, c: number) => ({
    x: s,
    y: c * s,
    label: `S*=${fixed(s, 0)}`,
    emphasis: "accent",
    semantic_role: "species_equilibrium",
  });

  const recoveryWindow = { xMax: 55, yMax: 40, xLabel: "喷发后年数", yLabel: "留鸟物种数 S" };
  const krakatauPoints = KRAKATAU_BIRDS.map((point) => ({
    ...point,
    emphasis: "primary",
    semantic_role: "census_count",
  }));
  const relaxation = defaultRates.ci + defaultRates.ce;
  const sCurve = {
    expression: `${fixed(defaultRates.sStar, 1)}*(1-exp(-${fixed(relaxation, 4)}*x))`,
    label: "模型 S(t)",
    emphasis: "secondary" as const,
    semantic_role: "model_recovery",
  };

  const areaSmall = islandRates(1, 40, pool);
  const distanceFar = islandRates(10, 200, pool);
  const speciesAreaCurve = {
    // S*(A) with the default distance: pool·ci/(ci+e0/√A), rewritten in x.
    expression: `${fixed(pool, 0)}*${fixed(defaultRates.ci, 5)}/(${fixed(defaultRates.ci, 5)}+${IBG_E0}/sqrt(x))`,
    label: "S*(A)",
    emphasis: "primary" as const,
    semantic_role: "species_area_curve",
  };
  const sAt = (a: number) => islandRates(a, 40, pool).sStar;

  const steps = [
    sceneStep(0, "ibg-eruption", "1883：一座被清零的岛", "1883 年 8 月，喀拉喀托火山把自己炸掉了大半，幸存的拉卡塔岛被灼热的火山灰埋了几十米——确认无一生还。此后博物学家一次次登岛点名：25 年后有 13 种留鸟，37 年后 28 种，50 年后 29 种。曲线在 30 附近躺平了。可这座岛远远没有住满，为什么停在 30？", ratePlot({
      curves: [sCurve],
      points: krakatauPoints,
      window: recoveryWindow,
      caption: "拉卡塔岛留鸟普查（Dammerman 整理；MacArthur & Wilson 1967 引用）。",
      formula: String.raw`1908:13\quad 1919\text{–}21:28\quad 1932\text{–}34:29`,
    })),
    sceneStep(1, "ibg-flows", "不是终点，是两股流", "MacArthur 和 Wilson 换了一种看法：岛上的物种数不是爬向某个“装满”的容量，而是两股流的拔河。从大陆物种池不断有新物种渡海迁入；岛上已有的物种也在不断地局部灭绝。数量停住，只说明两股流打平了——像一个进水口和出水口同时开着的水池。", ratePlot({
      curves: [sCurve],
      points: krakatauPoints,
      window: recoveryWindow,
      caption: "留鸟名单在两次普查间仍在更替：总数稳定 ≠ 成员固定。",
      formula: String.raw`\frac{dS}{dt}=I(S)-E(S)`,
    })),
    sceneStep(2, "ibg-two-curves", "两条曲线的相遇", `把两股流画成 S 的函数。迁入率往下走：岛上已有 S 种，物种池 P=${fixed(pool, 0)} 里剩下的新面孔就少一分。灭绝率往上走：种数越多，每种分到的个体越少，越容易被一场风暴抹掉。一降一升必有一交，交点就是均衡 S*=${fixed(sStar, 0)}——Wilson 当年为喀拉喀托算出的数字正是约 30。`, ratePlot({
      curves: [
        immigrationCurve(ci, "迁入率 I(S)", "primary"),
        extinctionCurve(ce, "灭绝率 E(S)", "accent"),
      ],
      points: [equilibriumPoint(sStar, ce)],
      caption: "下行的迁入遇上上行的灭绝：交点左边净增，右边净减。",
      formula: String.raw`S^*=\frac{\lambda P}{\lambda+\mu}=${fixed(sStar, 0)}`,
    })),
    sceneStep(3, "ibg-turnover", "均衡是动态的", `盯住交点：那里迁入和灭绝都不是零，各是约 ${fixed(turnover, 1)} 种/年。也就是说，均衡处的岛每年送走约 ${fixed(turnover, 1)} 种，又迎来约 ${fixed(turnover, 1)} 种——总数纹丝不动，名单持续换血。喀拉喀托后来的普查恰好显示了这种更替：数字停在 28、29，成员却不是同一批。物种数是水位，不是名单。`, ratePlot({
      curves: [
        immigrationCurve(ci, "迁入率 I(S)", "primary"),
        extinctionCurve(ce, "灭绝率 E(S)", "accent"),
      ],
      points: [equilibriumPoint(sStar, ce)],
      caption: "交点高度 = 周转率：动态均衡的价签。",
      formula: String.raw`T^*=\mu S^*\approx ${fixed(turnover, 1)}\ \text{种/年}`,
    })),
    sceneStep(4, "ibg-area", "面积效应：小岛留不住", `现在把岛缩小十倍。迁入不受影响——海峡还是那条海峡；但小岛上每个物种的种群都更小，一次歉收、一场风暴就足以清零，灭绝曲线整体变陡。交点被推向左下：均衡从 ${fixed(islandRates(10, distance, pool).sStar, 0)} 掉到 ${fixed(islandRates(1, distance, pool).sStar, 0)}。拖动右侧的面积 A，亲眼看灭绝线转动、交点滑走。`, ratePlot({
      curves: [
        immigrationCurve(ci, "迁入率", "primary"),
        extinctionCurve(ce, `E(S)，A=${fixed(area, 0)}`, "accent"),
        extinctionCurve(areaSmall.ce, "E(S)，A=1", "secondary"),
      ],
      points: [equilibriumPoint(sStar, ce)],
      window: { yMax: pool * (ci + areaSmall.ce) * 0.4 },
      caption: "同一条迁入线，两条灭绝线：岛越小，线越陡，家越小。",
      formula: String.raw`\mu\propto\frac{1}{\sqrt A}`,
    })),
    sceneStep(5, "ibg-distance", "距离效应：远岛等不来", `这次把岛推远。灭绝照旧——岛还是那座岛；但渡海者按距离折损，每远 ${fixed(IBG_DHALF, 0)} 公里迁入率减半，迁入曲线整体压低。交点同样左移：从 ${fixed(islandRates(area, 40, pool).sStar, 0)} 掉到 ${fixed(distanceFar.sStar, 0)}。两条推论合起来就是群岛的秩序：近而大的岛物种最多，远而小的最少——翻开任何一册岛屿鸟类名录，都是这个排序。`, ratePlot({
      curves: [
        immigrationCurve(ci, `I(S)，D=${fixed(distance, 0)}km`, "primary"),
        immigrationCurve(distanceFar.ci, "I(S)，D=200km", "secondary"),
        extinctionCurve(ce, "灭绝率", "accent"),
      ],
      points: [equilibriumPoint(sStar, ce)],
      caption: "同一条灭绝线，两条迁入线：岛越远，线越低，客越稀。",
      formula: String.raw`\lambda\propto 2^{-D/${fixed(IBG_DHALF, 0)}}`,
    })),
    sceneStep(6, "ibg-species-area", "验证：理论长出经验律", `理论必须交出可检验的预言。把不同面积的岛的均衡值连成曲线：A=1 时约 ${fixed(sAt(1), 0)} 种，A=10 约 ${fixed(sAt(10), 0)}，A=100 约 ${fixed(sAt(100), 0)}——面积每扩大十倍，物种数大约翻一番。这正是生物地理学家在群岛上数出来的种-面积规律，S 随面积的 z 次幂增长：实测的 z 多在 0.2 到 0.35 之间，这条曲线给出 0.28 到 0.40。机制模型自己长出了经验直线。`, ratePlot({
      curves: [speciesAreaCurve],
      points: [
        { x: 1, y: sAt(1), label: fixed(sAt(1), 0), semantic_role: "species_area_sample" },
        { x: 10, y: sAt(10), label: fixed(sAt(10), 0), emphasis: "accent", semantic_role: "species_area_sample" },
        { x: 100, y: sAt(100), label: fixed(sAt(100), 0), semantic_role: "species_area_sample" },
      ],
      window: { xMax: 105, yMax: 75, xLabel: "岛面积 A（相对值）", yLabel: "均衡物种数 S*" },
      caption: "十倍面积 ≈ 两倍物种：Darlington 的经验口诀从方程里长出来。",
      formula: String.raw`S=cA^{z},\quad z\approx 0.25`,
    })),
    sceneStep(7, "ibg-reserves", "从岛屿到保护区", `理论出圈了：被农田与公路切碎的森林，就是一片人造群岛。种-面积曲线立刻给出严厉的提醒——保护区缩小十倍，长期物种数减半，哪怕一棵树都没再砍。“一大还是几小”（SLOSS）因此争论了半个世纪：四个 A=25 的碎片各养约 ${fixed(sAt(25), 0)} 种，一块 A=100 养约 ${fixed(sAt(100), 0)} 种，孰优取决于碎片间的物种是否重复。模型不判决，但它把该问的问题亮了出来：廊道抬高迁入 λ，连片扩大压低灭绝 μ。`, ratePlot({
      curves: [speciesAreaCurve],
      points: [
        { x: 25, y: sAt(25), label: `四小：各约${fixed(sAt(25), 0)}`, semantic_role: "species_area_sample" },
        { x: 100, y: sAt(100), label: `一大：${fixed(sAt(100), 0)}`, emphasis: "accent", semantic_role: "species_area_sample" },
      ],
      window: { xMax: 105, yMax: 75, xLabel: "保护区面积 A（相对值）", yLabel: "长期物种数 S*" },
      caption: "栖息地破碎化 = 人造群岛：同一条曲线，换了主语。",
      formula: String.raw`\text{SLOSS}:\ 4\times S^*(25)\ \text{vs}\ S^*(100)`,
    })),
    sceneStep(8, "ibg-boundary", "模型的边界", "回到拉卡塔。模型曲线在头 25 年明显高于数据——鸟不能落在光秃秃的浮石上，草和林先用几十年铺路，均衡论却把演替整个抹平了。后来的重访又发现，真实的年灭绝率比理论预言低了一个量级：普查会看漏，过客会被记成居民。它还把物种当成可互换的粒子——没有食物网，没有演化。骨架的价值在于它先回答了第一性的问题：多大的岛、多远的岛、养得起多少种。偏离骨架的部分，正是下一层生态学的开始。", ratePlot({
      curves: [sCurve],
      points: krakatauPoints,
      window: recoveryWindow,
      caption: "头 25 年数据低于模型：演替在前面铺路。骨架之外，皆是新课。",
      formula: String.raw`S(t)=S^*\left(1-e^{-(\lambda+\mu)t}\right)`,
    })),
  ];
  return playbook(
    "biology",
    "喀拉喀托的重生 · 岛屿生物地理学",
    "1883 灭岛后的留鸟普查到 MacArthur-Wilson 均衡：两股流、面积与距离、种-面积规律。",
    "ecology_island_biogeography",
    steps,
    [
      { id: "A", label: "岛面积 A", value: fixed(area, 0), description: "1 到 100；灭绝线的斜率" },
      { id: "D", label: "距大陆 D（km）", value: fixed(distance, 0), description: "10 到 400；迁入线的高度" },
      { id: "P", label: "物种池 P", value: fixed(pool, 0), description: "50 到 300；迁入线的截距" },
    ],
  );
}

// ---------------------------------------------------------------------------
// Manifests

export const ECOLOGY_PUBLIC_GOLD_TEMPLATES: readonly GoldTemplateManifest[] = Object.freeze([
  standaloneCase({
    caseId: "predator-prey",
    archetypeId: "ecology.interaction.predator-prey",
    subject: "university_ecology",
    domain: "biology",
    topic: "种群生态学 · 种间关系",
    title: "猞猁与雪兔 · 捕食循环",
    description: "哈德逊湾毛皮数据、L-V 相平面、中性环、Volterra 捕捞原理与模型边界",
    prompt: "从哈德逊湾公司 1900–1920 年雪兔与猞猁毛皮记录出发讲解 Lotka-Volterra 捕食模型：解释十年周期与捕食者滞后，构建相平面与零增长线，展示中性环与初值依赖，用一战亚得里亚海渔市验证 Volterra 捕捞原理，最后以密度制约说明中性环的脆弱与模型边界。",
    defaults: { r: 0.55, a: 0.028, q: 0, N0: 30 },
    controls: [
      { id: "r", kind: "range", label: "雪兔增长率 r", description: "抬高猎物停线 P=r/a", min: 0.3, max: 0.9, step: 0.01, resetPlayback: false, steps: ["lv-phase-plane", "lv-neutral-cycles", "lv-volterra", "lv-sandbox"] },
      { id: "a", kind: "range", label: "捕食效率 a", description: "同时移动两条停线", min: 0.015, max: 0.05, step: 0.001, resetPlayback: false, steps: ["lv-phase-plane", "lv-neutral-cycles", "lv-volterra", "lv-sandbox"] },
      { id: "q", kind: "range", label: "捕捞强度 q", description: "Volterra 原理；q≥r 崩溃", min: 0, max: 0.35, step: 0.005, resetPlayback: false, steps: ["lv-volterra", "lv-sandbox"] },
      { id: "N0", kind: "range", label: "初始雪兔 N₀", description: "换一条中性环", min: 5, max: 80, step: 1, resetPlayback: false, steps: ["lv-phase-plane", "lv-neutral-cycles", "lv-volterra", "lv-sandbox"] },
    ],
    requiredCapabilities: ["math_plot", "trajectory_polyline", "data_points", "expression_curve"],
    handsOn: ["lv-neutral-cycles", "lv-volterra", "lv-sandbox"],
    expectedFacts: [
      { id: "lv-equations", description: "捕食耦合方程", anyOf: ["rN−aNP", "eaNP−mP", "dN/dt=rN"] },
      { id: "lv-data-first", description: "以哈德逊湾毛皮记录开场", anyOf: ["哈德逊湾", "毛皮", "1900"] },
      { id: "lv-lag", description: "捕食者峰滞后一到两年", anyOf: ["晚一到两年", "晚约一年半", "滞后"] },
      { id: "lv-equilibrium", description: "均衡点 (m/ea, r/a) 与数据均值吻合", anyOf: ["N^*=\\frac{m}{ea}", "(34, 20)", "平均值"] },
      { id: "lv-neutral", description: "中性稳定：振幅由初值决定", anyOf: ["中性", "初值", "起点画出自己的环"] },
      { id: "lv-volterra", description: "Volterra 原理：捕捞助猎物伤捕食者", anyOf: ["Volterra", "12% 涨到 36%", "均衡点"] },
      { id: "lv-boundary", description: "密度制约让环变螺旋：模型边界", anyOf: ["螺旋", "密度制约", "安蒂科斯蒂"] },
    ],
    visualInvariants: [{
      id: "lv-visual",
      description: "毛皮数据、模型轨道、零增长线与均衡点同屏可辨认",
      requiredSemanticRoles: ["pelt_record", "model_orbit", "zero_growth_isocline", "equilibrium_point"],
      requiredStateFields: ["polylines", "points", "curves", "x_min", "x_max"],
    }],
    objective: "从真实毛皮数据出发建立捕食耦合方程，理解相平面与中性环，用 Volterra 原理解释捕捞悖论，并识别中性环的结构脆弱性。",
    builder: buildPredatorPreyGoldPlaybook,
    mechanism: "捕食把两个种群的增长率互相写进对方的方程：因果绕圈产生内生振荡，无需任何外部驱动。",
    mechanismByStep: {
      "lv-data-pelts": "毛皮收购量是种群的采样代理：收购按恒定努力比例抽样时，账本的峰谷与真实种群同步。十年周期与 1–2 年滞后在两个世纪的记录里反复出现，不是一段孤例。",
      "lv-equations": "四项各有身份：rN 是猎物的马尔萨斯项，aNP 按相遇频率（两密度之积）拖走猎物，e 把吃到的猎物折算成捕食者的增殖，mP 是捕食者的恒定死亡。非线性只有 NP 一项，振荡全部由它产生。",
      "lv-four-beats": "在均衡点附近线性化，特征值是纯虚数 ±i√(rm)：既不衰减也不发散，只旋转——小振荡周期 2π/√(rm)≈10 年，大环的周期更长（约 11 年）。捕食者滞后源于它对猎物导数而非猎物本身响应。",
      "lv-phase-plane": "dN/dt=0 给出 P=r/a（与 N 无关的横线），dP/dt=0 给出 N=m/(ea)（竖线）。四个象限内 (dN,dP) 的符号依次是 (+,+)(−,+)(−,−)(+,−)——正是逆时针旋转。",
      "lv-neutral-cycles": "H=eaN−m·lnN+aP−r·lnP 沿任何轨迹守恒（对 t 求导代入方程即得 0），每个 H 值对应一条闭合等值线——所以轨道成环、互不相交，扰动只是跳到另一条等值线上。",
      "lv-data-loop": "时间平均定理：沿任何一条闭合轨道，N 与 P 的周期平均都恰好等于均衡值 (m/ea, r/a)。因此二十一年账本的平均值落在交点附近，是模型可检验的硬预言，不是巧合。",
      "lv-volterra": "对 lnN 求周期平均可证：平均值只依赖方程系数。捕捞把 r 换成 r−q、m 换成 m+q，平均值随之移动——猎物平均升到 (m+q)/ea，捕食者降到 (r−q)/a。d'Ancona 的渔市数据（捕食者占比 1914 年约 12%、1918 年约 36%）正是战时 q 骤减的镜像。",
      "lv-boundary": "加入 (1−N/K) 后，均衡点的特征值获得负实部，环变成稳定焦点的螺旋。真实系统持续振荡的候选解释——时滞、Holling 型功能反应、雪兔-植被的第二层耦合——都是往骨架上加项；无猞猁岛屿上的兔群循环（如安蒂科斯蒂岛）说明捕食者甚至不是必需项。",
      "lv-sandbox": "r 只进猎物停线 P=r/a，m、e 只进捕食者停线 N=m/ea，a 同时进两条——这就是「谁的参数写在谁的停线上」的交叉规则：猎物的停线由捕食参数守护，捕食者的停线由猎物参数守护。",
    },
    transfer: "先在第 5 步核对数据圈的中心是否落在交点旁；再把 q 拖到 0.15，检查新均衡是否是 ((m+q)/ea, (r−q)/a)；最后把 q 推过 r，确认崩溃方式与 logistic 案例的 E≥r 完全不同。",
    posterStepIndex: 5,
  }),
  standaloneCase({
    caseId: "competition-exclusion",
    archetypeId: "ecology.interaction.competition-exclusion",
    subject: "university_ecology",
    domain: "biology",
    topic: "种群生态学 · 种间关系",
    title: "草履虫之争 · 竞争排斥",
    description: "Gause 1934 双草履虫实验、停线几何、四种结局与生态位分化",
    prompt: "从 Gause 1934 年双草履虫混养实验出发讲解 Lotka-Volterra 竞争模型：单养各自 logistic、混养大草履虫被排挤，推导零增长等倾线，分析四种排布对应的四种结局（单方稳赢、稳定共存、先到者赢），并以绿草履虫共存实验引出生态位分化与竞争排斥原理的完整表述。",
    defaults: { alpha: 1.5, beta: 0.7, N10: 2, N20: 2 },
    controls: [
      { id: "alpha", kind: "range", label: "竞争系数 α", description: "大草履虫对双小核的压强；1.64 是分界", min: 0.3, max: 2, step: 0.01, resetPlayback: false, steps: ["comp-isoclines", "comp-sandbox"] },
      { id: "beta", kind: "range", label: "竞争系数 β", description: "双小核对大草履虫的压强；0.61 是分界", min: 0.3, max: 1.2, step: 0.01, resetPlayback: false, steps: ["comp-isoclines", "comp-sandbox"] },
      { id: "N10", kind: "range", label: "初始双小核 N₁₀", description: "先到者赢的世界里定胜负", min: 2, max: 60, step: 1, resetPlayback: false, steps: ["comp-sandbox"] },
      { id: "N20", kind: "range", label: "初始大草履虫 N₂₀", description: "先到者赢的世界里定胜负", min: 2, max: 60, step: 1, resetPlayback: false, steps: ["comp-sandbox"] },
    ],
    requiredCapabilities: ["math_plot", "trajectory_polyline", "expression_curve", "data_points"],
    handsOn: ["comp-isoclines", "comp-sandbox"],
    expectedFacts: [
      { id: "comp-gause", description: "以 Gause 1934 草履虫实验开场", anyOf: ["Gause", "1934", "草履虫"] },
      { id: "comp-k", description: "单养平台 K1=105、K2=64", anyOf: ["105", "64"] },
      { id: "comp-isocline", description: "零增长等倾线决定结局", anyOf: ["N_1+\\alpha N_2=K_1", "停线", "等倾线"] },
      { id: "comp-exclusion", description: "竞争排斥原理", anyOf: ["竞争排斥", "不能长期共存"] },
      { id: "comp-coexist", description: "共存判据：种内强于种间", anyOf: ["种内竞争强于种间", "α<K₁/K₂", "各自压自己"] },
      { id: "comp-founder", description: "先到者赢：鞍点与初值依赖", anyOf: ["先到者赢", "鞍点", "起点决定"] },
      { id: "comp-niche", description: "生态位分化促成共存", anyOf: ["生态位", "绿草履虫", "差异"] },
    ],
    visualInvariants: [{
      id: "comp-visual",
      description: "两条停线、竞争轨迹与均衡点同屏可辨认",
      requiredSemanticRoles: ["zero_growth_isocline", "competition_trajectory", "interior_equilibrium"],
      requiredStateFields: ["polylines", "points", "x_min", "x_max", "y_max"],
    }],
    objective: "从 Gause 实验出发把资源竞争写成 L-V 竞争方程，用停线几何推导四种结局，理解竞争排斥原理与生态位分化的互补关系。",
    builder: buildCompetitionGoldPlaybook,
    mechanism: "每个物种在对方的 logistic 里占一个折算位置：停线的相对位置决定平面的流向，几何代替微积分给出结局。",
    mechanismByStep: {
      "comp-alone": "单养曲线确立基线参数：K 由平台读出（105 与 64），r 由半程爬升速度拟合（约 0.8 与 0.65 每天）。没有这一步，混养的下降就无法归因于竞争——它可能只是这种虫本来就长不好。",
      "comp-together": "排除法：培养液每天更换、细菌定量投喂，无毒素累积（Gause 专门做过滤液对照）；两种虫都不捕食对方。唯一共享的短缺资源是细菌——下降只能来自抢食。",
      "comp-equations": "α 的操作定义：一个 N₂ 个体消耗的资源换算成 N₁ 的「拥挤当量」。α=1.5 与两种虫的个头比一致（大草履虫体积约为双小核的 1.6 倍，按体积吃）。β=0.7 略高于体积反比，因为双小核增殖更快、抢得更勤。",
      "comp-isoclines": "在 N₁+αN₂=K₁ 线上，物种 1 感受到的总拥挤恰好等于 K₁，dN₁/dt=0。直线是 logistic 线性拥挤假设的直接推论——若拥挤效应非线性，停线就会弯曲，四种结局的分类保持不变。",
      "comp-exclusion": "当 K₁/α>K₂ 且 K₂/β<K₁，两线之间存在「只利物种 1」的走廊：那里 N₁ 仍在停线内侧（继续涨），N₂ 已在自家停线外侧（必须跌）。轨迹一旦进入走廊就出不去，终点被夹逼到 (K₁, 0)。",
      "comp-coexist": "交点稳定的条件即雅可比矩阵行列式为正：αβ<1，等价于「种内压强的几何平均强于种间」。K₁/α>K₂ 且 K₂/β>K₁ 时两线交叉且各自的停线在对方外侧被截断，流场从四面收向交点。",
      "comp-founder": "αβ>1 时交点是鞍点：只有一条严格的分界线（稳定流形）通向它，两侧分别流向 (K₁,0) 与 (0,K₂)。生态学含义：入侵者从低密度出发时 dN/dt<0——双方都无法入侵对方的定居态。",
      "comp-bursaria": "绿草履虫在瓶底摄食酵母沉渣，双小核在水柱摄食悬浮细菌：资源谱几乎不重叠，α、β 同时变小，几何自动切换到共存排布。这正是「生态位分化降低种间竞争」的实验版本。",
      "comp-sandbox": "判定只需两次比较：K₁/α 对 K₂（物种 2 能否压制物种 1 的停线），K₂/β 对 K₁（反之）。两个「能」= 先到者赢；两个「不能」= 共存；一能一不能 = 稳赢方唯一。",
    },
    transfer: "在沙盘把 α 从 1.5 拖到 0.5（β 保持 0.4 以下），看轨迹的终点从 (105,0) 变成交点；再把 α、β 同时推过 1.64 与 0.61，交换 N₁₀ 与 N₂₀，确认赢家跟着起点互换。",
    posterStepIndex: 4,
  }),
  standaloneCase({
    caseId: "island-biogeography",
    archetypeId: "ecology.community.island-biogeography",
    subject: "university_ecology",
    domain: "biology",
    topic: "群落生态学",
    title: "喀拉喀托的重生 · 岛屿生物地理学",
    description: "1883 灭岛后的留鸟普查、迁入-灭绝均衡、面积与距离效应、种-面积规律与保护区设计",
    prompt: "从喀拉喀托 1883 年灭岛后的留鸟普查（13、28、29 种）出发讲解 MacArthur-Wilson 岛屿生物地理学均衡理论：迁入率与灭绝率两条曲线相交得到动态均衡 S*≈30，推导面积效应与距离效应，验证种-面积规律 S=cA^z，延伸到栖息地破碎化与保护区设计，最后以演替缺位和周转率高估说明模型边界。",
    defaults: { A: 10, D: 40, P: 100 },
    controls: [
      { id: "A", kind: "range", label: "岛面积 A", description: "灭绝线斜率 ∝ 1/√A", min: 1, max: 100, step: 1, resetPlayback: false, steps: ["ibg-two-curves", "ibg-turnover", "ibg-area", "ibg-distance"] },
      { id: "D", kind: "range", label: "距大陆 D（km）", description: "每 100km 迁入减半", min: 10, max: 400, step: 5, resetPlayback: false, steps: ["ibg-two-curves", "ibg-turnover", "ibg-distance"] },
      { id: "P", kind: "range", label: "物种池 P", description: "大陆一侧的候选名单", min: 50, max: 300, step: 5, resetPlayback: false, steps: ["ibg-two-curves", "ibg-turnover", "ibg-area", "ibg-distance", "ibg-species-area", "ibg-reserves"] },
    ],
    requiredCapabilities: ["math_plot", "expression_curve", "data_points", "equilibrium_crossing"],
    handsOn: ["ibg-area", "ibg-distance"],
    expectedFacts: [
      { id: "ibg-krakatau", description: "以喀拉喀托灭岛与留鸟普查开场", anyOf: ["喀拉喀托", "1883", "拉卡塔"] },
      { id: "ibg-census", description: "普查数字 13、28、29 趋于平台", anyOf: ["13", "28", "29"] },
      { id: "ibg-crossing", description: "迁入降、灭绝升，交点即均衡", anyOf: ["交点", "I(S)", "E(S)"] },
      { id: "ibg-turnover", description: "均衡是动态的：持续周转", anyOf: ["周转", "换血", "名单"] },
      { id: "ibg-area-distance", description: "面积效应与距离效应", anyOf: ["面积", "距离", "近而大"] },
      { id: "ibg-species-area", description: "种-面积规律 S=cA^z，z≈0.25", anyOf: ["S=cA", "十倍", "翻一番"] },
      { id: "ibg-reserves", description: "破碎化与保护区设计（SLOSS、廊道）", anyOf: ["保护区", "SLOSS", "廊道"] },
    ],
    visualInvariants: [{
      id: "ibg-visual",
      description: "迁入曲线、灭绝曲线、均衡点与普查数据同屏可辨认",
      requiredSemanticRoles: ["immigration_rate", "extinction_rate", "species_equilibrium"],
      requiredStateFields: ["curves", "points", "y_max", "x_min", "x_max"],
    }],
    objective: "从喀拉喀托普查出发建立迁入-灭绝均衡模型，推导面积与距离效应并验证种-面积规律，能把理论迁移到保护区设计，同时说出模型抹掉了什么。",
    builder: buildIslandBiogeographyGoldPlaybook,
    mechanism: "物种数是两股流的动态水位：迁入随 S 递减、灭绝随 S 递增，交点既定水位、也定周转率。",
    mechanismByStep: {
      "ibg-eruption": "喷发把拉卡塔的生物量清到零，是自然界罕见的「从零开始」对照实验：此后每一次普查都是对群落装配理论的一次盲测。普查取留鸟（繁殖种群），排除过境候鸟，否则名单会被迁徙季灌水。",
      "ibg-flows": "把 S 的变化写成流入减流出 dS/dt=I(S)−E(S)，是水池模型的直译。它刻意不问「是哪个物种」——这份粗糙正是理论的可解性来源，也是它日后挨批的原因。",
      "ibg-two-curves": "最简线性形式：I(S)=λ(P−S)，每个池外物种以率 λ 独立尝试登陆；E(S)=μS，每个岛上物种以率 μ 独立退场。解 I=E 得 S*=λP/(λ+μ)，且 S(t) 按指数弛豫逼近 S*——两条假设都可检验、可放宽。",
      "ibg-turnover": "周转率 T*=μS*=λ(P−S*) 是理论最大胆的预言：均衡不是静止。喀拉喀托相邻普查间总数几乎不变而名单更替，定性支持了它；定量上后世发现观测周转低于预言（见边界一步）。",
      "ibg-area": "μ∝1/√A 的机制是种群规模：面积缩十倍，平均种群约缩十倍，而灭绝风险随种群规模近似指数上升——√A 是把这层非线性压平后的教学近似。真实数据里小岛的灭绝记录确实密集得多。",
      "ibg-distance": "渡海是衰减过程：单位距离存活率近似恒定，迁入率随距离指数衰减，2^(−D/100) 即「每 100 公里减半」的写法。对鸟类，100 公里量级与海峡实测的传播衰减一致；对昆虫和植物种子要短得多。",
      "ibg-species-area": "S*(A)=λP/(λ+e₀A^(−1/2)) 在 log-log 坐标上斜率 z=(∂lnS*/∂lnA) 介于 0 与 0.5，本例给出 0.28–0.40，与群岛实测 z（0.2–0.35）同区间。z 不是拟合出来的自由参数，是从灭绝-面积机制里推出来的。",
      "ibg-reserves": "SLOSS 的模型答案取决于碎片间的物种重叠度：完全不重叠时四小胜一大（4×40>57），完全重叠时一大胜四小（57>40）。真实答案介于两者之间——所以廊道（提高有效 λ、让碎片共享救援效应）比争论本身更有操作价值。",
      "ibg-boundary": "两处失配都有名有姓：演替缺位使头 25 年模型高估（Thornton 等 1988 记录了植被-鸟类的先后脚手架）；周转率被高估一个量级，部分是普查误差与过客误记（伪周转）。修补方向——含演替的时变 λμ、区分过客与居民——都在原框架上加项，骨架不倒。",
    },
    transfer: "把 A 拖到 1 再拖到 100，核对 S* 是否按「十倍面积翻一番」移动；把 D 拖到 200，检查交点是否与 A=1 时落在同一高度附近——面积缩百倍与距离远四倍，惩罚竟然相当。",
    posterStepIndex: 2,
  }),
]);
