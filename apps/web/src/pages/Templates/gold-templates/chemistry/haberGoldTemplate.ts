import type {
  ChemAtom,
  ChemBond,
  ChemCardsPanel,
  ChemChartPanel,
  ChemMoleculesPanel,
  ChemParticle,
  ChemParticlesPanel,
  ChemRule,
  ChemSeries,
} from "../../../../features/playbook/engine/kits/chemistry/sceneTypes";
import type { TemplatePreviewParams } from "../../templatePreviewCases";
import { boundedNumber, stringParam } from "../standaloneCaseHelpers";
import { chemistryCase, scatterSlots, type ChemLessonDraft, type ChemStepDraft } from "./chemistryCase";
import { num } from "./chemFormat";
import {
  equilibriumConstant,
  HABER_DELTA_H_KJ,
  HABER_K_FORWARD,
  HABER_K_REF,
  HABER_T_REF,
  integrateSegment,
  kelvinToCelsius,
  reactionQuotient,
  scaleState,
  solveEquilibrium,
  type HaberState,
} from "./haberDomain";

/**
 * 合成氨与勒夏特列原理（选择性必修1 第二章第三、四节）。
 *
 * One reactor, one clock. The concentration–time chart is integrated from
 * mass-action kinetics (see `haberDomain` for which constants are teaching
 * values), and three disturbances hit the same equilibrium in turn: more N₂,
 * a halved volume, a hotter vessel. The particle view beside it counts
 * molecules at 0.1 mol per particle — added N₂ is declared inflow, every
 * other change is a whole reaction event (N₂ + 3H₂ → 2NH₃ or back), so N and
 * H are conserved by construction and checked by the atom ledger.
 */

const SCENE = "haber-le-chatelier";
const PARTICLES_PER_MOL = 10;
const SEGMENT = 10;
const COMPRESSIONS = ["1.5", "2"] as const;

const REACTOR_RECT = { x: 16, y: 50, w: 320, h: 376 };
const CHART_RECT = { x: 350, y: 50, w: 634, h: 262 };
const CARD_RECT = { x: 350, y: 322, w: 634, h: 104 };
const WIDE_CHART_RECT = { x: 16, y: 50, w: 640, h: 376 };
const SIDE_CARD_RECT = { x: 676, y: 60, w: 308, h: 366 };

// ---------------------------------------------------------------------------
// reactor bookkeeping in whole molecules

const SLOT_POSITIONS = scatterSlots(48, { x0: 0.02, x1: 0.98, y0: 0.02, y1: 0.98 }, 6, 8, 3);

type Species = "N2" | "H2" | "NH3";

interface Molecule {
  id: string;
  species: Species;
  slot: number;
  from?: string[];
  fresh?: boolean;
}

class Reactor {
  molecules: Molecule[] = [];
  private free: number[] = SLOT_POSITIONS.map((_, index) => index);
  private counter = 0;

  private take(): number {
    const slot = this.free.shift();
    if (slot === undefined) throw new Error("reactor: out of slots");
    return slot;
  }

  private release(slot: number): void {
    this.free.push(slot);
    this.free.sort((a, b) => a - b);
  }

  settle(): void {
    for (const molecule of this.molecules) {
      delete molecule.from;
      molecule.fresh = false;
    }
  }

  add(species: Species, count: number, fresh = false): void {
    for (let i = 0; i < count; i += 1) {
      this.counter += 1;
      this.molecules.push({ id: `${species.toLowerCase()}-${this.counter}`, species, slot: this.take(), fresh });
    }
  }

  private remove(species: Species, count: number): Molecule[] {
    const taken: Molecule[] = [];
    for (let i = 0; i < count; i += 1) {
      const index = this.molecules.findIndex((molecule) => molecule.species === species);
      if (index === -1) throw new Error(`reactor: no ${species} left`);
      taken.push(...this.molecules.splice(index, 1));
    }
    return taken;
  }

  /** N₂ + 3H₂ → 2NH₃, `events` times (negative runs it backwards). */
  react(events: number): void {
    for (let e = 0; e < Math.abs(events); e += 1) {
      if (events > 0) {
        const used = [...this.remove("N2", 1), ...this.remove("H2", 3)];
        const from = used.map((molecule) => molecule.id);
        const slots = used.map((molecule) => molecule.slot);
        slots.slice(2).forEach((slot) => this.release(slot));
        for (const slot of slots.slice(0, 2)) {
          this.counter += 1;
          this.molecules.push({ id: `nh3-${this.counter}`, species: "NH3", slot, from, fresh: true });
        }
      } else {
        const used = this.remove("NH3", 2);
        const from = used.map((molecule) => molecule.id);
        const slots = [...used.map((molecule) => molecule.slot), this.take(), this.take()];
        const products: Species[] = ["N2", "H2", "H2", "H2"];
        products.forEach((species, index) => {
          this.counter += 1;
          this.molecules.push({ id: `${species.toLowerCase()}-${this.counter}`, species, slot: slots[index], from, fresh: true });
        });
      }
    }
  }

  count(species: Species): number {
    return this.molecules.filter((molecule) => molecule.species === species).length;
  }

  panel(options: { widthFraction: number; inflow?: Record<string, number> | null; title: string }): ChemParticlesPanel {
    const particles: ChemParticle[] = this.molecules.map((molecule, index) => ({
      id: molecule.id,
      species: molecule.species,
      ...SLOT_POSITIONS[molecule.slot],
      angle: (index * 47) % 180,
      tone: molecule.fresh ? "focus" : null,
      from: molecule.from ?? null,
    }));
    return {
      type: "particles",
      id: "reactor",
      rect: REACTOR_RECT,
      system_id: "reactor",
      title: options.title,
      container: "box",
      width_fraction: options.widthFraction,
      particles,
      scale: 10,
      motion: 0.4,
      legend: true,
      entry: "top",
      inflow: options.inflow ?? null,
    };
  }
}

/** Whole reaction events between two states, at 0.1 mol per particle. */
function eventsBetween(before: HaberState, after: HaberState, volume: number): number {
  return Math.round(((after.nh3 - before.nh3) / 2) * volume * PARTICLES_PER_MOL);
}

// ---------------------------------------------------------------------------
// molecule models for the opening step

function moleculeScene(): ChemMoleculesPanel {
  const atoms: ChemAtom[] = [];
  const bonds: ChemBond[] = [];
  const at = (id: string, element: string, x: number, y: number, z = 0) => atoms.push({ id, element, x, y, z });
  const bond = (from: string, to: string, order: 1 | 2 | 3 = 1) => bonds.push({ id: `${from}-${to}`, from, to, order });
  // N≡N
  at("n1", "N", -5.3, 0.4);
  at("n2", "N", -4.2, 0.4);
  bond("n1", "n2", 3);
  // 3 H–H
  [[-2.3, 1.4], [-2.3, 0.2], [-2.3, -1.0]].forEach(([x, y], index) => {
    at(`h${index}a`, "H", x - 0.37, y);
    at(`h${index}b`, "H", x + 0.37, y);
    bond(`h${index}a`, `h${index}b`);
  });
  // 2 NH₃ (trigonal pyramids, N–H 1.01 Å)
  [[2.4, 0.9], [4.6, 0.0]].forEach(([x, y], index) => {
    const n = `m${index}n`;
    at(n, "N", x, y + 0.12, 0);
    at(`${n}1`, "H", x, y - 0.25, 0.95);
    at(`${n}2`, "H", x + 0.82, y - 0.25, -0.47);
    at(`${n}3`, "H", x - 0.82, y - 0.25, -0.47);
    bond(n, `${n}1`);
    bond(n, `${n}2`);
    bond(n, `${n}3`);
  });
  return {
    type: "molecules",
    id: "models",
    rect: { x: 350, y: 50, w: 634, h: 250 },
    title: "分子模型",
    view: { yaw: 18, pitch: 16 },
    scale: 56,
    center: { x: -0.35, y: 0.2, z: 0 },
    atoms,
    bonds,
    groups: [
      { id: "n2", atom_ids: ["n1", "n2"], label: "N_2（N≡N）" },
      { id: "h2", atom_ids: ["h0a", "h0b", "h1a", "h1b", "h2a", "h2b"], label: "3H_2" },
      { id: "nh3", atom_ids: ["m0n", "m0n1", "m0n2", "m0n3", "m1n", "m1n1", "m1n2", "m1n3"], label: "2NH_3" },
    ],
    reaction_arrow: { from_x: -0.9, to_x: 1.1, y: 0.2, reversible: true, label: "高温高压 催化剂" },
  };
}

// ---------------------------------------------------------------------------

export function buildHaberLesson(params: TemplatePreviewParams): ChemLessonDraft {
  const addN2 = boundedNumber(params, "addN2", 0.6, 0.6, 1.0);
  const compression = Number(stringParam(params, "compression", COMPRESSIONS, "2"));
  const heat = boundedNumber(params, "heat", 100, 50, 150);
  const hotT = HABER_T_REF + heat;
  const kHot = equilibriumConstant(hotT);

  // Four segments on one clock.
  const s0start: HaberState = { n2: 1, h2: 3, nh3: 0 };
  const eq0 = solveEquilibrium(s0start, HABER_K_REF);
  const s1start: HaberState = { ...eq0, n2: eq0.n2 + addN2 };
  const eq1 = solveEquilibrium(s1start, HABER_K_REF);
  const s2start = scaleState(eq1, compression);
  const eq2 = solveEquilibrium(s2start, HABER_K_REF);
  const eq3 = solveEquilibrium(eq2, kHot);
  const segments = [
    integrateSegment({ t0: 0, t1: SEGMENT, start: s0start, k: HABER_K_REF, kf: HABER_K_FORWARD }),
    integrateSegment({ t0: SEGMENT, t1: 2 * SEGMENT, start: s1start, k: HABER_K_REF, kf: HABER_K_FORWARD }),
    // The rate grows with the fourth power of concentration, so after the
    // compression the (schematic) clock is slowed by compression³ to keep
    // each approach visible; heating then speeds it up by a schematic 1.5×.
    integrateSegment({ t0: 2 * SEGMENT, t1: 3 * SEGMENT, start: s2start, k: HABER_K_REF, kf: HABER_K_FORWARD / compression ** 3 }),
    integrateSegment({ t0: 3 * SEGMENT, t1: 4 * SEGMENT, start: eq2, k: kHot, kf: (1.5 * HABER_K_FORWARD) / compression ** 3 }),
  ];
  const timeline = segments.flatMap((segment, index) => (index === 0 ? segment : segment.slice(1)))
    .filter((_, index, all) => index % 10 === 0 || index === all.length - 1);
  const catalysed = integrateSegment({ t0: 0, t1: SEGMENT, start: s0start, k: HABER_K_REF, kf: HABER_K_FORWARD * 4 })
    .filter((_, index, all) => index % 10 === 0 || index === all.length - 1);

  const seriesUpTo = (tMax: number): ChemSeries[] => {
    const window = timeline.filter(([t]) => t <= tMax + 1e-9);
    return [
      { id: "n2", points: window.map(([t, s]) => [t, s.n2]), label: "N_2", element: "N" },
      { id: "h2", points: window.map(([t, s]) => [t, s.h2]), label: "H_2", tone: "muted" },
      { id: "nh3", points: window.map(([t, s]) => [t, s.nh3]), label: "NH_3", tone: "focus" },
    ];
  };
  const yMax = Math.ceil(Math.max(...timeline.map(([, s]) => Math.max(s.n2, s.h2, s.nh3))) + 0.5);
  const disturbanceRules = (upTo: number): ChemRule[] => [
    { id: "add", axis: "x" as const, value: SEGMENT, label: "加 N_2", tone: "muted" as const },
    { id: "press", axis: "x" as const, value: 2 * SEGMENT, label: "压缩", tone: "muted" as const },
    { id: "heat", axis: "x" as const, value: 3 * SEGMENT, label: "升温", tone: "muted" as const },
  ].filter((rule) => rule.value < upTo);
  const chart = (tMax: number, previous: number, extra: Partial<ChemChartPanel> = {}): ChemChartPanel => ({
    type: "chart",
    id: "ct",
    rect: CHART_RECT,
    title: "浓度–时间（时间轴为示意）",
    x: { min: 0, max: 4 * SEGMENT, label: "t/min", ticks: [0, 10, 20, 30, 40] },
    y: { min: 0, max: yMax, label: "c/(mol·L^{-1})" },
    series: seriesUpTo(tMax),
    rules: disturbanceRules(tMax),
    reveal: { series_ids: ["n2", "h2", "nh3"], from_x: previous },
    ...extra,
  });
  const sideCards = (cards: ChemCardsPanel["cards"]): ChemCardsPanel => ({
    type: "cards",
    id: "side",
    rect: SIDE_CARD_RECT,
    cards,
  });
  const card = (heading: string, lines: string[], tone: "focus" | "primary" | "secondary" = "primary"): ChemCardsPanel => ({
    type: "cards",
    id: "note",
    rect: CARD_RECT,
    cards: [{ id: "note", heading, lines, tone }],
  });

  // Reactor, step by step.
  const reactor = new Reactor();
  reactor.add("N2", 10);
  reactor.add("H2", 30);
  const reactorInitial = reactor.panel({ widthFraction: 1, title: "反应容器：每个粒子约 0.1 mol" });
  reactor.settle();
  reactor.react(eventsBetween(s0start, eq0, 1));
  const reactorEq0 = reactor.panel({ widthFraction: 1, title: "反应容器：每个粒子约 0.1 mol" });
  reactor.settle();
  const addedParticles = Math.round(addN2 * PARTICLES_PER_MOL);
  reactor.add("N2", addedParticles, true);
  reactor.react(eventsBetween(s1start, eq1, 1));
  const reactorEq1 = reactor.panel({ widthFraction: 1, inflow: { N: 2 * addedParticles }, title: "加入 N₂ 后" });
  reactor.settle();
  reactor.react(eventsBetween(s2start, eq2, 1 / compression));
  const reactorEq2 = reactor.panel({ widthFraction: 1 / compression, title: `体积压缩为 1/${num(compression, 1)}` });
  reactor.settle();
  reactor.react(eventsBetween(eq2, eq3, 1 / compression));
  const reactorEq3 = reactor.panel({ widthFraction: 1 / compression, title: `升温 ${heat} K 后` });

  const qAfterAdd = reactionQuotient(s1start);
  const qAfterPress = reactionQuotient(s2start);
  const qAfterHeat = reactionQuotient(eq2);
  const tC = kelvinToCelsius(HABER_T_REF);
  const hotC = kelvinToCelsius(hotT);
  const k = (value: number) => num(value, value < 0.1 ? 3 : 2);

  const equation = "N_2 + 3H_2 ⇌ 2NH_3　ΔH = −92.4 kJ/mol";
  const scene = (panels: Array<ChemParticlesPanel | ChemChartPanel | ChemCardsPanel | ChemMoleculesPanel>, caption: string) => ({
    kind: "chemistry_scene" as const,
    scene_id: SCENE,
    equation,
    panels,
    callouts: [],
    caption,
  });

  const steps: ChemStepDraft[] = [
    {
      id: "haber-bonds",
      title: "合成氨：一个放热、可逆、气体变少的反应",
      narration: "氮气和氢气在高温、高压和铁催化剂作用下合成氨。拆开 1 摩尔氮氮三键要吸收 946 千焦，3 摩尔氢氢键 1308 千焦；形成 6 摩尔氮氢键放出 2346 千焦。放出的比吸收的多约 92 千焦，所以反应放热；而且四个气体分子变成两个，气体分子数减少。",
      scene: scene([
        reactorInitial,
        moleculeScene(),
        card("键能估算反应热", ["断键吸热：946 + 3×436 = 2254 kJ", "成键放热：6×391 = 2346 kJ → ΔH ≈ −92 kJ/mol"], "secondary"),
      ], "可逆、放热、气体分子数由 4 变为 2：这三个特点决定了条件怎么选"),
      questions: [
        { question: "这个反应有哪三个特点？", answer: "可逆反应；正反应放热（ΔH = −92.4 kJ/mol）；正反应方向气体分子数减少（4 → 2）。" },
        { question: "为什么用键能能估算反应热？", answer: "反应热 = 断开反应物化学键吸收的总能量 − 形成生成物化学键放出的总能量：946 + 3×436 − 6×391 ≈ −92 kJ/mol，与实测 −92.4 kJ/mol 接近。" },
        { question: "怎样检查左边容器的原子数？", answer: "10 个 N₂ 含 20 个 N 原子，30 个 H₂ 含 60 个 H 原子；后面每一步无论怎样反应，N、H 原子总数只会因“加入 N₂”而增加。" },
      ],
    },
    {
      id: "haber-equilibrium",
      title: "达到平衡：v正 = v逆，浓度不再变",
      narration: `从只有氮气和氢气开始，氨越来越多；随着氨增多，逆反应也越来越快。约 10 分钟后正、逆反应速率相等，三种物质的浓度都不再变化：氮气 ${num(eq0.n2, 2)}、氢气 ${num(eq0.h2, 2)}、氨 ${num(eq0.nh3, 2)} 摩尔每升。这时反应没有停止，只是生成和分解一样快。`,
      scene: scene([
        reactorEq0,
        chart(SEGMENT, 0),
        card("平衡常数", [`K = c^2(NH_3) / [c(N_2)·c^3(H_2)] = ${k(HABER_K_REF)}`, "Q < K 正向进行，Q = K 平衡，Q > K 逆向进行"], "primary"),
      ], "动态平衡：粒子仍在反应，只是正逆两个方向一样快"),
      questions: [
        { question: "曲线在哪里变平？", answer: `约 10 min 后三条曲线都变平，N₂、H₂、NH₃ 分别稳定在 ${num(eq0.n2, 2)}、${num(eq0.h2, 2)}、${num(eq0.nh3, 2)} mol/L。` },
        { question: "浓度不变了，为什么说反应没有停？", answer: "化学平衡是动态平衡：正反应仍在生成 NH₃，逆反应仍在分解 NH₃，两者速率相等，所以各物质浓度保持不变。" },
        { question: "怎样验证这是平衡状态？", answer: `代入 K 的表达式：${num(eq0.nh3, 2)}² ÷ (${num(eq0.n2, 2)} × ${num(eq0.h2, 2)}³) ≈ ${k(reactionQuotient(eq0))}，等于平衡常数 ${k(HABER_K_REF)}，说明 Q = K。` },
      ],
    },
    {
      id: "haber-add-n2",
      title: "扰动一：加入 N₂",
      narration: `第 10 分钟，向容器中加入 ${num(addN2, 1)} 摩尔每升的氮气。这一瞬间 Q 变为 ${k(qAfterAdd)}，小于 K，平衡正向移动：氢气被消耗，氨增多，加进去的氮气也被用掉一部分。新平衡时氮气浓度是 ${num(eq1.n2, 2)}，比原平衡大，比刚加入时小——移动只能减弱这种改变。`,
      scene: scene([
        reactorEq1,
        chart(2 * SEGMENT, SEGMENT),
        card("Q 与 K", [`加入瞬间 Q = ${k(qAfterAdd)} < K = ${k(HABER_K_REF)} → 正向移动`, `c(N_2)：${num(eq0.n2, 2)} → ${num(s1start.n2, 2)} → ${num(eq1.n2, 2)} mol/L`], "focus"),
      ], "加入的 N₂ 被部分消耗：减弱而不抵消"),
      questions: [
        { question: "加入 N₂ 后三条曲线怎样变？", answer: `N₂ 突然升高后逐渐下降，H₂ 逐渐下降，NH₃ 逐渐上升，最后稳定在 N₂ ${num(eq1.n2, 2)}、H₂ ${num(eq1.h2, 2)}、NH₃ ${num(eq1.nh3, 2)} mol/L。` },
        { question: "为什么平衡向正反应方向移动？", answer: `增大反应物浓度，Q = c²(NH₃)/[c(N₂)c³(H₂)] 的分母变大，Q = ${k(qAfterAdd)} < K，v正 > v逆，所以正向移动。` },
        { question: "怎样检查“减弱而不抵消”？", answer: `比较 N₂ 的三个浓度：原平衡 ${num(eq0.n2, 2)}，加入瞬间 ${num(s1start.n2, 2)}，新平衡 ${num(eq1.n2, 2)}。新平衡介于两者之间：增加的量被部分消耗，但没有被全部抵消。` },
      ],
    },
    {
      id: "haber-compress",
      title: "扰动二：压缩体积（增大压强）",
      narration: `第 20 分钟，把体积压缩到原来的 ${compression === 2 ? "二分之一" : "三分之二"}。所有气体的浓度同时变为原来的 ${num(compression, 1)} 倍，Q 变为 ${k(qAfterPress)}，小于 K。平衡向气体分子数减少的方向，也就是正反应方向移动：容器里又有氮气和氢气变成了氨。`,
      scene: scene([
        reactorEq2,
        chart(3 * SEGMENT, 2 * SEGMENT),
        card("压强与气体分子数", [`浓度同乘 ${num(compression, 1)} → Q = ${k(qAfterPress)} < K`, "平衡向气体分子数减少的方向（正向）移动"], "focus"),
      ], "增大压强：平衡移向气体分子数减少的一侧"),
      questions: [
        { question: "压缩瞬间曲线有什么特征？", answer: `三条曲线在 20 min 处同时向上跳，都变为原来的 ${num(compression, 1)} 倍；之后 N₂、H₂ 下降、NH₃ 上升。` },
        { question: "为什么增大压强平衡正向移动？", answer: `浓度同乘 ${num(compression, 1)}，Q 的分子乘 ${num(compression, 1)}²、分母乘 ${num(compression, 1)}⁴，Q 变为原来的 1/${num(compression ** 2, 2)}，小于 K；正反应方向气体分子数由 4 变 2，所以向正向移动以减弱压强的增大。` },
        { question: "怎样从粒子图检查？", answer: "容器变窄但粒子数没有凭空增减：N、H 原子总数不变；新平衡时 NH₃ 分子比压缩前多，N₂、H₂ 分子少。" },
      ],
    },
    {
      id: "haber-heat",
      title: "扰动三：升高温度",
      narration: `第 30 分钟，温度从约 ${tC} 摄氏度升高到约 ${hotC} 摄氏度。正反应放热，升温使平衡常数从 ${k(HABER_K_REF)} 减小到 ${k(kHot)}；此时 Q 等于 ${k(qAfterHeat)}，大于新的 K，平衡逆向移动，氨分解。升温同时加快了正逆反应，所以新平衡来得更快。`,
      scene: scene([
        reactorEq3,
        chart(4 * SEGMENT, 3 * SEGMENT),
        card("温度改变 K", [`${tC} °C：K = ${k(HABER_K_REF)} → ${hotC} °C：K = ${k(kHot)}`, `Q = ${k(qAfterHeat)} > K → 逆向移动（吸热方向）`], "focus"),
      ], "只有温度能改变 K：升温，平衡向吸热方向移动"),
      questions: [
        { question: "升温后哪条曲线下降？", answer: `NH₃ 下降，N₂ 和 H₂ 上升，新平衡时 NH₃ 为 ${num(eq3.nh3, 2)} mol/L，低于升温前的 ${num(eq2.nh3, 2)} mol/L。` },
        { question: "为什么升温平衡逆向移动？", answer: `正反应放热（ΔH = ${HABER_DELTA_H_KJ} kJ/mol），升高温度使 K 减小到 ${k(kHot)}，原来的平衡组成 Q = ${k(qAfterHeat)} > K，所以向吸热的逆反应方向移动。` },
        { question: "怎样区分“浓度、压强”和“温度”两类扰动？", answer: "改变浓度或压强时 K 不变，是 Q 偏离了 K；改变温度时 Q 没变，是 K 本身变了。两种情况都用 Q 与 K 的大小判断移动方向。" },
      ],
    },
    {
      id: "haber-catalyst",
      title: "催化剂：更快到达，但平衡不移动",
      narration: "加入催化剂，正反应和逆反应被同等程度地加快。虚线是有催化剂时的情形：更早到达平衡，但平衡时三种物质的浓度和没有催化剂时完全相同。催化剂只改变到达平衡所需的时间，不能使平衡移动。",
      scene: scene([
        {
          type: "chart",
          id: "ct",
          rect: WIDE_CHART_RECT,
          title: "有无催化剂（前 10 min）",
          x: { min: 0, max: SEGMENT, label: "t/min", ticks: [0, 2, 4, 6, 8, 10] },
          y: { min: 0, max: 3.2, label: "c/(mol·L^{-1})" },
          series: [
            { id: "nh3", points: segments[0].filter((_, index) => index % 10 === 0).map(([t, s]) => [t, s.nh3]), label: "NH_3 无催化剂", tone: "focus" },
            { id: "nh3-cat", points: catalysed.map(([t, s]) => [t, s.nh3]), label: "有催化剂", tone: "primary", dashed: true },
            { id: "h2", points: segments[0].filter((_, index) => index % 10 === 0).map(([t, s]) => [t, s.h2]), label: "H_2", tone: "muted" },
            { id: "h2-cat", points: catalysed.map(([t, s]) => [t, s.h2]), tone: "primary", dashed: true },
          ],
          rules: [{ id: "eq", axis: "y", value: eq0.nh3, label: "平衡浓度相同", tone: "muted" }],
        },
        sideCards([
          { id: "cat", heading: "催化剂", lines: ["同等程度加快 v正、v逆", "更早到达平衡", "K 与平衡组成不变"], tone: "primary" },
          { id: "fe", heading: "合成氨的催化剂", lines: ["铁触媒（以铁为主体）", "活性温度约 500 °C"], tone: "secondary" },
        ]),
      ], "合成氨用铁触媒：让反应在 400–500 °C 就足够快"),
      questions: [
        { question: "两组曲线最终有什么相同之处？", answer: `有无催化剂，NH₃ 最终都稳定在 ${num(eq0.nh3, 2)} mol/L，H₂ 都稳定在 ${num(eq0.h2, 2)} mol/L；不同的只是到达的快慢。` },
        { question: "为什么催化剂不能使平衡移动？", answer: "催化剂同等程度地降低正、逆反应的活化能，v正 和 v逆 增大的倍数相同，平衡常数 K 不变，所以平衡组成不变。" },
        { question: "怎样判断一种措施能否提高氨的平衡产率？", answer: "看它是否改变 Q 与 K 的关系：增大压强、降低温度、及时分离出氨能使平衡正向移动；使用催化剂只能加快速率。" },
      ],
    },
    {
      id: "haber-industry",
      title: "工业条件：速率与产率的折中",
      narration: "低温有利于提高氨的平衡含量，可温度太低反应太慢；铁触媒在 500 摄氏度左右活性最大，所以工业上选 400 到 500 摄氏度。压强越大越有利，但对设备和能耗要求越高，一般选 10 到 30 兆帕。再把生成的氨及时液化分离，未反应的氮气和氢气循环使用。",
      scene: scene([
        {
          type: "chart",
          id: "ct",
          rect: WIDE_CHART_RECT,
          title: "平衡时 NH₃ 的物质的量分数（模型示意）",
          x: { min: 300, max: 600, label: "温度/°C", ticks: [300, 350, 400, 450, 500, 550, 600] },
          y: { min: 0, max: 70, label: "x(NH_3)/%" },
          series: [1, 2].map((factor) => ({
            id: `p${factor}`,
            points: Array.from({ length: 31 }, (_, index) => {
              const celsius = 300 + index * 10;
              const eq = solveEquilibrium({ n2: factor, h2: 3 * factor, nh3: 0 }, equilibriumConstant(celsius + 273.15));
              return [celsius, (100 * eq.nh3) / (eq.n2 + eq.h2 + eq.nh3)] as [number, number];
            }),
            label: factor === 1 ? "较低压强" : "压强加倍",
            tone: factor === 1 ? ("muted" as const) : ("primary" as const),
          })),
          bands: [{ id: "industry", axis: "x", from: 400, to: 500, label: "工业 400–500 °C", tone: "secondary" }],
        },
        sideCards([
          { id: "t", heading: "温度 400–500 °C", lines: ["兼顾速率与平衡", "催化剂活性最大"], tone: "focus" },
          { id: "p", heading: "压强 10–30 MPa", lines: ["压强越大越有利", "受设备与能耗限制"], tone: "primary" },
          { id: "sep", heading: "分离与循环", lines: ["及时液化分离 NH_3", "N_2、H_2 循环使用"], tone: "secondary" },
        ]),
      ], "温度：兼顾速率与平衡；压强：兼顾产率与成本"),
      questions: [
        { question: "图中哪条规律一眼可见？", answer: "温度越高，平衡时氨的含量越低；同一温度下压强越大，氨的含量越高。" },
        { question: "既然低温产率高，为什么不用低温？", answer: "温度太低反应速率太慢，而且铁触媒在 500 °C 左右活性最大；工业上要的是单位时间的产量，所以选 400–500 °C 作为速率与平衡的折中。" },
        { question: "怎样再提高原料的利用率？", answer: "把生成的氨及时液化分离（减小生成物浓度使平衡正向移动），并把未反应的 N₂ 和 H₂ 循环送回合成塔。" },
      ],
    },
    {
      id: "haber-principle",
      title: "勒夏特列原理：减弱这种改变",
      narration: `回看完整的 40 分钟：加氮气，平衡向消耗氮气的方向移动；加压，向气体分子数减少的方向移动；升温，向吸热方向移动。三次都是同一条规律：改变影响平衡的一个条件，平衡就向能够减弱这种改变的方向移动，但只能减弱，不能抵消。拖动右侧参数，看每一次移动怎样变大或变小。`,
      scene: scene([
        reactorEq3,
        chart(4 * SEGMENT, 4 * SEGMENT),
        card("勒夏特列原理", ["改变一个条件 → 平衡向减弱这种改变的方向移动", "只能减弱，不能抵消；催化剂不使平衡移动"], "focus"),
      ], "三次扰动，同一条规律"),
      questions: [
        { question: "三次扰动分别让平衡向哪边移动？", answer: "加 N₂：正向；压缩：正向（气体分子数减少）；升温：逆向（吸热方向）。" },
        { question: "为什么说原理的核心是“减弱”？", answer: `每次移动都部分抵消了外界的改变：加入的 N₂ 被部分消耗，增大的压强因气体分子数减少而部分回落，升高的温度被吸热的逆反应部分抵消；新平衡与原平衡都不相同。` },
        { question: "怎样用 Q 和 K 验证每一次判断？", answer: `加 N₂ 后 Q = ${k(qAfterAdd)} < K；压缩后 Q = ${k(qAfterPress)} < K；升温后 K 变为 ${k(kHot)}，Q = ${k(qAfterHeat)} > K。三次移动方向都与 Q、K 的比较一致。` },
      ],
    },
  ];

  return {
    title: "合成氨与勒夏特列原理",
    summary: "同一个反应容器经历加 N₂、压缩、升温三次扰动：浓度–时间曲线、分子粒子与 Q/K 判断同步。",
    algorithmId: "chemistry_haber_le_chatelier",
    steps,
    controls: [
      { id: "addN2", label: "加入 N₂", value: num(addN2, 1), description: "mol/L" },
      { id: "compression", label: "压缩倍数", value: num(compression, 1), description: "体积缩小为 1/k" },
      { id: "heat", label: "升温", value: String(heat), description: "K" },
    ],
  };
}

export const HABER_GOLD_TEMPLATE = chemistryCase({
  caseId: "haber-le-chatelier",
  archetypeId: "chemistry.equilibrium.haber-le-chatelier",
  topic: "化学平衡",
  title: "合成氨与勒夏特列原理",
  description: "一个反应容器、一条时间轴：加 N₂、压缩、升温三次扰动下的浓度曲线、分子粒子与 Q/K",
  prompt: "以 N₂ + 3H₂ ⇌ 2NH₃ 为例讲解化学平衡与勒夏特列原理：建立平衡，再分别加入 N₂、压缩体积、升高温度，画出浓度–时间曲线并用 Q 与 K 判断移动方向，最后讨论催化剂与工业条件。",
  defaults: { addN2: 0.6, compression: "2", heat: 100 },
  controls: [
    { id: "addN2", kind: "range", label: "加入 N₂", description: "mol/L；第 10 分钟加入", min: 0.6, max: 1.0, step: 0.1, resetPlayback: false, steps: ["haber-add-n2", "haber-principle"] },
    {
      id: "compression",
      kind: "select",
      label: "压缩倍数",
      description: "第 20 分钟体积缩小为 1/k",
      resetPlayback: false,
      options: [
        { label: "1.5 倍", value: "1.5" },
        { label: "2 倍", value: "2" },
      ],
      steps: ["haber-compress", "haber-principle"],
    },
    { id: "heat", kind: "range", label: "升温", description: "K；第 30 分钟", min: 50, max: 150, step: 25, resetPlayback: false, steps: ["haber-heat", "haber-principle"] },
  ],
  requiredCapabilities: ["chemistry_scene", "chart", "particles", "atom_ledger"],
  handsOn: ["haber-principle"],
  expectedFacts: [
    { id: "haber-exothermic", description: "合成氨正反应放热 ΔH = −92.4 kJ/mol", anyOf: ["−92.4", "放热"] },
    { id: "haber-q-k", description: "用 Q 与 K 判断平衡移动方向", anyOf: ["Q <", "Q >"] },
    { id: "haber-principle", description: "勒夏特列原理：减弱而不抵消", anyOf: ["减弱", "不能抵消"] },
    { id: "haber-catalyst", description: "催化剂不使平衡移动", anyOf: ["不能使平衡移动", "K 与平衡组成不变"] },
  ],
  visualInvariants: [{
    id: "haber-clock",
    description: "反应容器粒子与浓度–时间曲线同屏，三次扰动在同一条时间轴上",
    requiredSemanticRoles: ["particles", "chart"],
    requiredStateFields: ["particles", "series", "rules"],
  }],
  objective: "用 Q 与 K 的比较统一解释浓度、压强、温度对平衡的影响，理解“减弱而不抵消”，并能分析合成氨的工业条件。",
  build: buildHaberLesson,
  posterStepIndex: 7,
});
