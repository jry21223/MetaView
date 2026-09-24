import type {
  ChemAtom,
  ChemBond,
  ChemCardsPanel,
  ChemChartPanel,
  ChemEnergyPanel,
  ChemEnergyPath,
  ChemMoleculesPanel,
  ChemParticlesPanel,
} from "../../../../features/playbook/engine/kits/chemistry/sceneTypes";
import { chemMarkupToUnicode as uni } from "../../../../features/playbook/engine/kits/chemistry/chemMarkup";
import type { TemplatePreviewParams } from "../../templatePreviewCases";
import { boundedNumber, stringParam } from "../standaloneCaseHelpers";
import { chemistryCase, scatterSlots, type ChemLessonDraft, type ChemStepDraft } from "./chemistryCase";
import { num, scientificMarkup, scientificSpoken } from "./chemFormat";
import {
  activatedFraction,
  activationEnergy,
  catalystRateGain,
  HI_DELTA_H_KJ,
  HI_EA_PLATINUM_KJ,
  HI_EA_UNCATALYSED_KJ,
  SCHEMATIC_EA_PLATINUM,
  SCHEMATIC_EA_UNCATALYSED,
  schematicDistribution,
  temperatureRateRatio,
  type CatalystId,
} from "./collisionDomain";

/**
 * 碰撞理论与活化能（选择性必修1 第二章第一节）。
 *
 * The textbook's own example, 2HI → H₂ + I₂: molecules collide constantly,
 * only a well-oriented, energetic collision passes through the transition
 * state, and the energy profile, the (schematic) energy distribution and the
 * Arrhenius numbers explain why temperature and catalysts change the rate.
 * The distribution chart is labelled schematic on screen; every number the
 * narration speaks is computed from Ea and T by `collisionDomain`.
 */

const SCENE = "collision-activation";
const REFERENCE_T = 700;
const CATALYSTS: readonly CatalystId[] = ["none", "pt"];

// ---------------------------------------------------------------------------
// molecule stages for one effective collision (and one that fails)

type Stage = "apart" | "approach" | "transition" | "products";

function effectivePair(stage: Stage): { atoms: ChemAtom[]; bonds: ChemBond[] } {
  const layout: Record<Stage, Record<string, [number, number, number]>> = {
    apart: { Ha: [0.6, 1.9, 0], Ia: [-1.0, 1.9, 0], Hb: [0.6, -1.9, 0], Ib: [-1.0, -1.9, 0] },
    approach: { Ha: [0.4, 1.25, 0], Ia: [-1.2, 1.35, 0], Hb: [0.4, -1.25, 0], Ib: [-1.2, -1.35, 0] },
    transition: { Ha: [0.3, 0.52, 0], Ia: [-1.55, 1.45, 0], Hb: [0.3, -0.52, 0], Ib: [-1.55, -1.45, 0] },
    products: { Ha: [1.6, 0.37, 0], Ia: [-2.6, 1.33, 0], Hb: [1.6, -0.37, 0], Ib: [-2.6, -1.33, 0] },
  };
  const p = layout[stage];
  const atoms: ChemAtom[] = ["Ha", "Ia", "Hb", "Ib"].map((id) => ({
    id,
    element: id[0],
    x: p[id][0],
    y: p[id][1],
    z: p[id][2],
  }));
  const bonds: ChemBond[] = [];
  if (stage === "apart" || stage === "approach") {
    bonds.push({ id: "Ha-Ia", from: "Ha", to: "Ia", order: 1 }, { id: "Hb-Ib", from: "Hb", to: "Ib", order: 1 });
  } else if (stage === "transition") {
    bonds.push(
      { id: "Ha-Ia", from: "Ha", to: "Ia", order: 1, state: "partial" },
      { id: "Hb-Ib", from: "Hb", to: "Ib", order: 1, state: "partial" },
      { id: "Ha-Hb", from: "Ha", to: "Hb", order: 1, state: "partial", tone: "focus" },
      { id: "Ia-Ib", from: "Ia", to: "Ib", order: 1, state: "partial", tone: "focus" },
    );
  } else {
    bonds.push({ id: "Ha-Hb", from: "Ha", to: "Hb", order: 1 }, { id: "Ia-Ib", from: "Ia", to: "Ib", order: 1 });
  }
  return { atoms, bonds };
}

/** A head-on I···I collision: wrong orientation, the molecules bounce apart. */
function failedPair(): { atoms: ChemAtom[]; bonds: ChemBond[] } {
  const atoms: ChemAtom[] = [
    { id: "Hc", element: "H", x: -9.0, y: 0.1, z: 0 },
    { id: "Ic", element: "I", x: -7.4, y: 0.1, z: 0 },
    { id: "Id", element: "I", x: -4.9, y: 0.1, z: 0 },
    { id: "Hd", element: "H", x: -3.3, y: 0.1, z: 0 },
  ];
  return { atoms, bonds: [{ id: "Hc-Ic", from: "Hc", to: "Ic", order: 1 }, { id: "Id-Hd", from: "Id", to: "Hd", order: 1 }] };
}

// ---------------------------------------------------------------------------

export function buildCollisionLesson(params: TemplatePreviewParams): ChemLessonDraft {
  const temperature = boundedNumber(params, "temperature", 750, 725, 800);
  const catalyst = stringParam(params, "catalyst", CATALYSTS, "none") as CatalystId;
  const ea = activationEnergy(catalyst);
  const fractionRef = activatedFraction(HI_EA_UNCATALYSED_KJ, REFERENCE_T);
  const fractionT = activatedFraction(HI_EA_UNCATALYSED_KJ, temperature);
  const ratioT = temperatureRateRatio(HI_EA_UNCATALYSED_KJ, REFERENCE_T, temperature);
  const ratioPlus10 = temperatureRateRatio(HI_EA_UNCATALYSED_KJ, REFERENCE_T, REFERENCE_T + 10);
  const gain = catalystRateGain(HI_EA_UNCATALYSED_KJ, HI_EA_PLATINUM_KJ, temperature);
  const fractionChosen = activatedFraction(ea, temperature);
  const equation = "2HI(g) ⇌ H_2(g) + I_2(g)";
  const reverseEa = HI_EA_UNCATALYSED_KJ - HI_DELTA_H_KJ;

  const molecules = (stage: Stage, rect = { x: 16, y: 50, w: 470, h: 376 }, withFailed = false): ChemMoleculesPanel => {
    const pair = effectivePair(stage);
    const failed = withFailed ? failedPair() : { atoms: [], bonds: [] };
    return {
      type: "molecules",
      id: "collision",
      rect,
      system_id: withFailed ? null : "hi-pair",
      view: { yaw: 0, pitch: 0 },
      scale: withFailed ? 44 : 62,
      center: withFailed ? { x: -3.2, y: 0, z: 0 } : { x: -0.4, y: 0, z: 0 },
      atoms: [...failed.atoms, ...pair.atoms],
      bonds: [...failed.bonds, ...pair.bonds],
      groups: withFailed
        ? [
            { id: "failed", atom_ids: ["Hc", "Ic", "Id", "Hd"], label: "取向不对：弹开" },
            { id: "effective", atom_ids: ["Ha", "Ia", "Hb", "Ib"], label: "H 对 H、I 对 I：可能反应" },
          ]
        : stage === "products"
          ? [
              { id: "h2", atom_ids: ["Ha", "Hb"], label: "H_2" },
              { id: "i2", atom_ids: ["Ia", "Ib"], label: "I_2" },
            ]
          : stage === "transition"
            ? [{ id: "ts", atom_ids: ["Ha", "Ia", "Hb", "Ib"], label: "过渡态（活化络合物）" }]
            : [{ id: "hi", atom_ids: ["Ha", "Ia", "Hb", "Ib"], label: "2 个 HI" }],
    };
  };

  const uncatalysedPath: ChemEnergyPath = {
    id: "none",
    label: null,
    tone: "primary",
    levels: [
      { id: "r", x: 0.14, e: 0, kind: "reactant", label: "2HI" },
      { id: "ts", x: 0.5, e: HI_EA_UNCATALYSED_KJ, kind: "ts", label: "过渡态" },
      { id: "p", x: 0.86, e: HI_DELTA_H_KJ, kind: "product", label: "H_2 + I_2" },
    ],
  };
  const platinumPath: ChemEnergyPath = {
    id: "pt",
    label: null,
    tone: "focus",
    dashed: true,
    levels: [
      { id: "pr", x: 0.14, e: 0, kind: "reactant" },
      { id: "pts", x: 0.5, e: HI_EA_PLATINUM_KJ, kind: "ts", label: "Pt 表面" },
      { id: "pp", x: 0.86, e: HI_DELTA_H_KJ, kind: "product" },
    ],
  };
  const energy = (options: { rect?: ChemEnergyPanel["rect"]; rider?: number | null; measures?: boolean; platinum?: boolean }): ChemEnergyPanel => ({
    type: "energy_profile",
    id: "energy",
    rect: options.rect ?? { x: 500, y: 50, w: 484, h: 376 },
    title: "能量变化",
    y: { min: 0, max: 220, label: "E/(kJ·mol^{-1})", ticks: [0, 50, 100, 150, 200] },
    x_label: "反应进程",
    paths: options.platinum ? [uncatalysedPath, platinumPath] : [uncatalysedPath],
    measures: options.measures
      ? [
          { id: "ea", kind: "ea", from: "r", to: "ts", label: `E_a = ${HI_EA_UNCATALYSED_KJ}`, tone: "focus" },
          ...(options.platinum ? [{ id: "eapt", kind: "ea" as const, from: "pr", to: "pts", label: `E_a' = ${HI_EA_PLATINUM_KJ}`, tone: "secondary" as const, at: 0.4, side: "left" as const }] : []),
          { id: "dh", kind: "dh", from: "r", to: "p", label: `ΔH = +${HI_DELTA_H_KJ}`, tone: "primary" },
        ]
      : null,
    rider: options.rider === null || options.rider === undefined ? null : { path_id: "none", t: options.rider },
  });

  const distribution = (options: { rect?: ChemChartPanel["rect"]; hot?: number | null; threshold: number; thresholdLabel: string }): ChemChartPanel => {
    const series = [
      { id: "t0", points: schematicDistribution(REFERENCE_T), label: `${REFERENCE_T} K`, tone: "muted" as const },
      ...(options.hot && options.hot !== REFERENCE_T
        ? [{ id: "t1", points: schematicDistribution(options.hot), label: `${options.hot} K`, tone: "focus" as const }]
        : []),
    ];
    const tailSeries = series.at(-1)!;
    return {
      type: "chart",
      id: "distribution",
      rect: options.rect ?? { x: 16, y: 50, w: 600, h: 376 },
      title: "分子能量分布（示意，横轴不按比例）",
      x: { min: 0, max: 7, label: "分子能量 E", ticks: [] },
      y: { min: 0, max: 0.6, label: "分子所占比例", ticks: [] },
      series,
      areas: [{ id: "tail", series_id: tailSeries.id, from_x: options.threshold, to_x: 7, tone: "focus" }],
      rules: [{ id: "ea", axis: "x", value: options.threshold, label: options.thresholdLabel, tone: "focus" }],
    };
  };
  const cards = (items: ChemCardsPanel["cards"], rect: ChemCardsPanel["rect"], id = "cards"): ChemCardsPanel => ({ type: "cards", id, rect, cards: items });
  const scene = (panels: Array<ChemMoleculesPanel | ChemEnergyPanel | ChemChartPanel | ChemCardsPanel | ChemParticlesPanel>, caption: string) => ({
    kind: "chemistry_scene" as const,
    scene_id: SCENE,
    equation,
    panels,
    callouts: [],
    caption,
  });

  const gasSlots = scatterSlots(12, { x0: 0.06, x1: 0.94, y0: 0.06, y1: 0.94 }, 4, 3, 11);
  const gas: ChemParticlesPanel = {
    type: "particles",
    id: "gas",
    rect: { x: 16, y: 50, w: 480, h: 376 },
    title: "HI 气体（示意）",
    container: "box",
    particles: gasSlots.map((slot, index) => ({ id: `hi-${index}`, species: "HI", x: slot.x, y: slot.y, angle: (index * 61) % 180 })),
    scale: 18,
    motion: 1,
    legend: true,
  };

  const steps: ChemStepDraft[] = [
    {
      id: "collision-question",
      title: "反应要靠分子碰撞，可为什么这么慢？",
      narration: `碘化氢分解成氢气和碘蒸气。容器里的气体分子一直在高速运动、彼此碰撞，每个分子每秒要碰撞十亿次左右。如果每次碰撞都能反应，反应瞬间就会完成；可实际上，在 ${REFERENCE_T} 开左右，这个反应进行得相当慢。大多数碰撞没有引起反应——为什么？`,
      scene: scene([
        gas,
        cards([
          { id: "fact", heading: "事实", lines: ["气体分子碰撞极其频繁", "但反应并不快"], tone: "secondary" },
          { id: "question", heading: "问题", lines: ["什么样的碰撞才能反应？"], tone: "focus" },
        ], { x: 516, y: 60, w: 468, h: 366 }),
      ], "碰撞是反应的前提，但不是每次碰撞都有效"),
      questions: [
        { question: "这一幕先观察什么？", answer: "容器中的碘化氢分子在不停运动、相互碰撞；碰撞非常频繁，可反应并不快。" },
        { question: "为什么说“碰撞是必要的，但不充分”？", answer: "分子必须相互接触，旧键才可能断开、新键才可能形成；但碰撞后还要满足能量和取向两个条件，大多数碰撞达不到。" },
        { question: "怎样从数量级上检查这个矛盾？", answer: "如果每秒十亿次左右的碰撞都有效，反应会在远不到一秒内完成；实际反应需要很长时间，说明有效碰撞只占极小的一部分。" },
      ],
    },
    {
      id: "collision-orientation",
      title: "条件一：碰撞的取向要合适",
      narration: "先看方向。左边两个碘化氢分子用碘原子一端对撞，碰完就弹开；右边两个分子并排靠近，氢对着氢、碘对着碘——只有这样，氢和氢之间、碘和碘之间才有机会成键。取向不对的碰撞，能量再大也是无效碰撞。",
      scene: scene([
        molecules("approach", { x: 16, y: 50, w: 640, h: 376 }, true),
        cards([
          { id: "bad", heading: "无效碰撞", lines: ["取向不合适，碰后弹开"], tone: "muted" },
          { id: "good", heading: "可能有效的碰撞", lines: ["H 靠近 H，I 靠近 I"], tone: "focus" },
        ], { x: 676, y: 60, w: 308, h: 366 }),
      ], "有效碰撞的第一个条件：合适的取向"),
      questions: [
        { question: "两组碰撞有什么不同？", answer: "左边是碘原子对碘原子的“迎头”碰撞，碰后分开；右边两个分子并排，氢对氢、碘对碘地靠近。" },
        { question: "为什么取向会决定能否反应？", answer: "要生成 H₂ 和 I₂，必须让两个氢原子彼此靠近、两个碘原子彼此靠近，新键才可能形成；取向不对，需要成键的原子根本碰不到一起。" },
        { question: "怎样判断一次碰撞的取向是否合适？", answer: "看将要形成新键的原子是否在碰撞中互相靠近：这里就是看 H 与 H、I 与 I 是否相对。" },
      ],
    },
    {
      id: "collision-transition",
      title: "过渡态：旧键将断、新键将成",
      narration: "取向合适、能量又足够大时，两个分子挤到一起，形成能量很高的过渡态：氢碘键被拉长，氢氢键和碘碘键正在生成，虚线表示这些键都只形成了一半。越过这个能量最高点，反应才能继续向前。",
      scene: scene([
        molecules("transition"),
        energy({ rider: 0.5 }),
      ], "虚线：正在断开或正在形成的键"),
      questions: [
        { question: "过渡态里的虚线分别代表什么？", answer: "H–I 之间的虚线是正在断开的旧键，H–H、I–I 之间的虚线是正在形成的新键，它们都只有一部分成键。" },
        { question: "为什么过渡态的能量最高？", answer: "旧键已经被削弱、新键还没有完全形成，体系处在最不稳定的状态，所以位于能量曲线的最高点。" },
        { question: "怎样在图中找到过渡态？", answer: "能量–反应进程图上曲线的最高点就是过渡态，右侧小球现在正停在这里。" },
      ],
    },
    {
      id: "collision-energy",
      title: "条件二：能量要够——活化能",
      narration: `越过能垒之后生成氢气和碘分子。从反应物到过渡态的能量差叫活化能，这个反应约为 ${HI_EA_UNCATALYSED_KJ} 千焦每摩尔；生成物比反应物高约 ${HI_DELTA_H_KJ} 千焦，所以反应略微吸热。逆反应的活化能是两者之差，约 ${num(reverseEa, 1)} 千焦每摩尔。`,
      scene: scene([
        molecules("products"),
        energy({ rider: 0.92, measures: true }),
      ], "活化能 Ea：普通分子变成活化分子所需的最低能量"),
      questions: [
        { question: "图中两条双箭头各表示什么？", answer: `长箭头是正反应的活化能 Ea ≈ ${HI_EA_UNCATALYSED_KJ} kJ/mol；短箭头是反应热 ΔH ≈ +${HI_DELTA_H_KJ} kJ/mol。` },
        { question: "为什么活化能决定了反应快慢？", answer: "只有能量达到活化能的碰撞才能越过过渡态；活化能越高，满足条件的碰撞越少，反应越慢。" },
        { question: "怎样用图算逆反应的活化能？", answer: `逆反应从 H₂ + I₂ 出发越过同一个过渡态：Ea(逆) = Ea(正) − ΔH = ${HI_EA_UNCATALYSED_KJ} − ${HI_DELTA_H_KJ} ≈ ${num(reverseEa, 1)} kJ/mol。` },
      ],
    },
    {
      id: "collision-fraction",
      title: "活化分子只占极小一部分",
      narration: `分子的能量有高有低，大多数分子的能量都在平均值附近，只有曲线右侧尾巴上的少数分子能量超过活化能，叫做活化分子。按活化能计算，在 ${REFERENCE_T} 开时，这部分只占约 ${scientificSpoken(fractionRef)}。注意这张图只示意形状，横轴没有按比例画。`,
      scene: scene([
        distribution({ threshold: SCHEMATIC_EA_UNCATALYSED, thresholdLabel: "E_a" }),
        cards([
          { id: "fraction", heading: "活化分子所占比例", lines: [`≈ exp(−E_a/RT) = ${scientificMarkup(fractionRef)}`, `（E_a = ${HI_EA_UNCATALYSED_KJ} kJ/mol，T = ${REFERENCE_T} K）`], tone: "focus" },
          { id: "note", heading: "读图", lines: ["阴影 = 能量 ≥ Ea 的分子"], tone: "secondary" },
        ], { x: 636, y: 60, w: 348, h: 366 }),
      ], "阴影面积越大，有效碰撞越多，反应越快"),
      questions: [
        { question: "阴影部分代表什么？", answer: "能量达到或超过活化能的分子，也就是活化分子；它们发生取向合适的碰撞时才可能成为有效碰撞。" },
        { question: "为什么这个比例这么小？", answer: `活化能远大于分子的平均能量：${HI_EA_UNCATALYSED_KJ} kJ/mol 约是 RT（${num((8.314 * REFERENCE_T) / 1000, 1)} kJ/mol）的 ${num(HI_EA_UNCATALYSED_KJ / ((8.314 * REFERENCE_T) / 1000), 0)} 倍，比例按 e 的负 ${num(HI_EA_UNCATALYSED_KJ / ((8.314 * REFERENCE_T) / 1000), 0)} 次方衰减。` },
        { question: "怎样自己估算这个比例？", answer: `计算 Ea/RT = 184000 ÷ (8.314 × ${REFERENCE_T}) ≈ ${num((HI_EA_UNCATALYSED_KJ * 1000) / (8.314 * REFERENCE_T), 1)}，再取 e 的负这个数次方，约为 1.9 × 10⁻¹⁴。` },
      ],
    },
    {
      id: "collision-temperature",
      title: "升高温度：尾巴变长，活化分子变多",
      narration: `把温度从 ${REFERENCE_T} 开升到 ${temperature} 开，分子的平均能量增大，分布曲线变矮变宽，超过活化能的尾巴明显变大。按活化能计算，速率变为原来的约 ${num(ratioT, ratioT < 10 ? 1 : 0)} 倍。只升高 10 开，速率就约为原来的 ${num(ratioPlus10, 2)} 倍。拖动右侧温度试试。`,
      scene: scene([
        distribution({ hot: temperature, threshold: SCHEMATIC_EA_UNCATALYSED, thresholdLabel: "E_a" }),
        cards([
          { id: "ratio", heading: `${REFERENCE_T} K → ${temperature} K`, lines: [`活化分子比例：${scientificMarkup(fractionRef)} → ${scientificMarkup(fractionT)}`, `速率约变为 ${num(ratioT, ratioT < 10 ? 2 : 0)} 倍`], tone: "focus" },
          { id: "why", heading: "原因", lines: ["活化分子百分数增大", "碰撞也更频繁（次要）"], tone: "primary" },
        ], { x: 636, y: 60, w: 348, h: 366 }),
      ], "温度升高，活化分子百分数增大，有效碰撞增多"),
      questions: [
        { question: "两条曲线比较，哪里变化最大？", answer: `${temperature} K 的曲线更矮更宽，右侧超过 Ea 的尾巴面积明显增大，也就是活化分子所占比例增大。` },
        { question: "为什么温度对速率影响这么大？", answer: `比例按 exp(−Ea/RT) 变化，Ea 很大时 T 稍有变化，指数就变化很多：从 ${REFERENCE_T} K 升到 ${temperature} K，比例从 ${uni(scientificMarkup(fractionRef))} 变为 ${uni(scientificMarkup(fractionT))}。` },
        { question: "怎样自己算温度对速率的影响？", answer: `k₂/k₁ = exp[Ea/R × (1/T₁ − 1/T₂)] = exp[${num((HI_EA_UNCATALYSED_KJ * 1000) / 8.314, 0)} × (1/${REFERENCE_T} − 1/${temperature})] ≈ ${num(ratioT, 2)}。` },
      ],
    },
    {
      id: "collision-catalyst",
      title: "催化剂：换一条能垒更低的路",
      narration: `在铂的表面上，碘化氢分解走的是另一条路，活化能降到约 ${HI_EA_PLATINUM_KJ} 千焦每摩尔。同样的 ${temperature} 开，活化分子的比例大大增加，速率约提高到 ${scientificSpoken(gain)} 倍。催化剂不改变反应热，正、逆反应的活化能降低同样多，所以平衡不移动。`,
      scene: scene([
        energy({ rect: { x: 16, y: 50, w: 560, h: 376 }, measures: true, platinum: true }),
        cards([
          { id: "gain", heading: `${temperature} K 下的效果`, lines: [`E_a：${HI_EA_UNCATALYSED_KJ} → ${HI_EA_PLATINUM_KJ} kJ/mol`, `速率约提高 ${scientificMarkup(gain)} 倍`], tone: "focus" },
          { id: "same", heading: "不变的量", lines: ["反应热 ΔH 不变", "平衡常数 K 不变"], tone: "primary" },
        ], { x: 596, y: 60, w: 388, h: 366 }),
      ], "虚线：有催化剂时的反应历程"),
      questions: [
        { question: "两条能量曲线有什么相同和不同？", answer: `起点和终点相同（ΔH 相同），不同的是最高点：无催化剂 Ea ≈ ${HI_EA_UNCATALYSED_KJ} kJ/mol，Pt 表面上 Ea ≈ ${HI_EA_PLATINUM_KJ} kJ/mol。` },
        { question: "为什么催化剂能大大加快反应？", answer: "催化剂改变了反应历程，降低了活化能，使更多分子成为活化分子，有效碰撞的比例大大增加。" },
        { question: "怎样估算催化剂带来的加速倍数？", answer: `k(Pt)/k = exp[(Ea − Ea′)/RT] = exp[${(HI_EA_UNCATALYSED_KJ - HI_EA_PLATINUM_KJ) * 1000} ÷ (8.314 × ${temperature})] ≈ ${uni(scientificMarkup(gain))}（${temperature} K）。` },
      ],
    },
    {
      id: "collision-summary",
      title: "四个外因，同一把钥匙：有效碰撞",
      narration: `把四个外因放在一起看：增大浓度或压强，单位体积内活化分子数增多；升高温度和使用催化剂，活化分子的百分数增大。现在的条件是 ${temperature} 开、${catalyst === "pt" ? "有铂催化" : "无催化剂"}，活化能 ${ea} 千焦每摩尔，活化分子约占 ${scientificSpoken(fractionChosen)}。调节右侧的温度和催化剂，看看阴影和数字怎样变。`,
      scene: scene([
        distribution({
          rect: { x: 16, y: 50, w: 480, h: 376 },
          hot: temperature,
          threshold: catalyst === "pt" ? SCHEMATIC_EA_PLATINUM : SCHEMATIC_EA_UNCATALYSED,
          thresholdLabel: catalyst === "pt" ? "E_a'（Pt）" : "E_a",
        }),
        cards([
          { id: "now", heading: `${temperature} K · ${catalyst === "pt" ? "Pt 催化" : "无催化剂"}`, lines: [`E_a = ${ea} kJ/mol`, `活化分子比例 ≈ ${scientificMarkup(fractionChosen)}`], tone: "focus" },
          { id: "conc", heading: "浓度、压强", lines: ["单位体积活化分子数 ↑，百分数不变"], tone: "secondary" },
          { id: "tc", heading: "温度、催化剂", lines: ["活化分子百分数 ↑"], tone: "primary" },
        ], { x: 516, y: 60, w: 468, h: 366 }),
      ], "所有外因最终都落在“单位时间内有效碰撞的次数”上"),
      questions: [
        { question: "四个外因分别改变了什么？", answer: "浓度和压强改变单位体积内的分子总数（活化分子数随之增加，百分数不变）；温度和催化剂改变活化分子的百分数。" },
        { question: "为什么说它们归结到同一把钥匙？", answer: "反应速率取决于单位时间、单位体积内的有效碰撞次数；四个外因都是通过增加有效碰撞次数来加快反应的。" },
        { question: "怎样用当前数字检查？", answer: `当前 Ea = ${ea} kJ/mol、T = ${temperature} K，exp(−Ea/RT) ≈ ${uni(scientificMarkup(fractionChosen))}；换成 Pt 或升温，这个数都会变大。` },
      ],
    },
  ];

  return {
    title: "碰撞理论与活化能",
    summary: "以 2HI → H₂ + I₂ 为例：取向、过渡态与活化能，温度与催化剂怎样改变活化分子的比例。",
    algorithmId: "chemistry_collision_activation",
    steps,
    controls: [
      { id: "temperature", label: "温度 T", value: String(temperature), description: "K" },
      { id: "catalyst", label: "催化剂", value: catalyst === "pt" ? "Pt" : "无", description: "无或铂" },
    ],
  };
}

export const COLLISION_GOLD_TEMPLATE = chemistryCase({
  caseId: "collision-activation",
  archetypeId: "chemistry.kinetics.collision-theory-activation-energy",
  topic: "化学反应速率",
  title: "碰撞理论与活化能",
  description: "2HI 分解：有效碰撞的取向与能量、过渡态、活化能，温度与催化剂怎样改变活化分子比例",
  prompt: "以 2HI → H₂ + I₂ 为例讲解有效碰撞理论：碰撞取向、过渡态与活化能，画出能量–反应进程图，并用活化分子比例解释温度和催化剂对速率的影响。",
  defaults: { temperature: 750, catalyst: "none" },
  controls: [
    { id: "temperature", kind: "range", label: "温度 T", description: "K；从 700 K 升到的温度", min: 725, max: 800, step: 25, resetPlayback: false, steps: ["collision-temperature", "collision-catalyst", "collision-summary"] },
    {
      id: "catalyst",
      kind: "select",
      label: "催化剂",
      description: "铂表面把活化能降到约 59 kJ/mol",
      resetPlayback: false,
      options: [
        { label: "无", value: "none" },
        { label: "铂（Pt）", value: "pt" },
      ],
      steps: ["collision-summary"],
    },
  ],
  requiredCapabilities: ["chemistry_scene", "energy_profile", "molecules_3d", "chart"],
  handsOn: ["collision-temperature", "collision-summary"],
  expectedFacts: [
    { id: "collision-orientation", description: "有效碰撞需要合适的取向", anyOf: ["取向", "H 对 H"] },
    { id: "collision-ea", description: "2HI 分解的活化能约 184 kJ/mol", anyOf: ["184"] },
    { id: "collision-catalyst", description: "催化剂降低活化能，不改变反应热", anyOf: ["反应热 ΔH 不变", "不改变反应热"] },
  ],
  visualInvariants: [{
    id: "collision-energy-views",
    description: "分子碰撞、能量–反应进程图与能量分布图互相对应",
    requiredSemanticRoles: ["molecules", "energy_profile", "chart"],
    requiredStateFields: ["atoms", "paths", "measures", "areas"],
  }],
  objective: "用有效碰撞理论解释反应速率：取向与活化能两个条件，温度与催化剂通过改变活化分子百分数影响速率。",
  build: buildCollisionLesson,
  posterStepIndex: 3,
});
