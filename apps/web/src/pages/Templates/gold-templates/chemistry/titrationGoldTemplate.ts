import type {
  ChemBand,
  ChemCardsPanel,
  ChemChartPanel,
  ChemMarker,
  ChemParticle,
  ChemParticlesPanel,
  ChemRule,
  ChemSeries,
  ChemTitrationPanel,
} from "../../../../features/playbook/engine/kits/chemistry/sceneTypes";
import { chemMarkupToUnicode as uni } from "../../../../features/playbook/engine/kits/chemistry/chemMarkup";
import type { TemplatePreviewParams } from "../../templatePreviewCases";
import { boundedNumber, stringParam } from "../standaloneCaseHelpers";
import { chemistryCase, scatterSlots, type ChemLessonDraft, type ChemStepDraft } from "./chemistryCase";
import { dec, num, percentSpoken, percentText, ratioSpoken, scientificMarkup } from "./chemFormat";
import {
  endpointError,
  equivalenceVolumeMl,
  INDICATORS,
  indicatorColorName,
  indicatorTint,
  jumpRange,
  titrationCurve,
  titrationPh,
  type IndicatorId,
  type TitrationSetup,
} from "./titrationDomain";

/**
 * 酸碱中和滴定（选择性必修1 第三章第二节）。
 *
 * The rig, the pH curve and a magnified sample of the flask move together:
 * every drop from the burette lands in all three views at once. The numbers
 * are the textbook's (0.1000 mol/L, 20.00 mL, 19.98 → pH 4.30, 20.02 → pH
 * 9.70), computed by `titrationDomain` from the charge balance; the micro
 * view is a six-ion sample whose atom ledger is conserved step to step, with
 * the added NaOH declared as inflow.
 */

const SCENE = "acid-base-titration";
const CONCENTRATIONS = ["0.1", "0.01", "1"] as const;
const INDICATOR_IDS: readonly IndicatorId[] = ["phenolphthalein", "methyl_orange"];
const SAMPLE = 6;
const ACID_ML = 20;
const MAX_ML = 40;

const RIG_RECT = { x: 16, y: 50, w: 300, h: 376 };
const CHART_RECT = { x: 330, y: 50, w: 400, h: 376 };
const MICRO_RECT = { x: 746, y: 50, w: 238, h: 268 };
const CARD_RECT = { x: 746, y: 328, w: 238, h: 98 };

function concLabel(conc: number): string {
  return conc >= 1 ? "1.000" : conc >= 0.1 ? "0.1000" : "0.01000";
}

function spokenConc(conc: number): string {
  return conc >= 1 ? "1" : conc >= 0.1 ? "0.1" : "0.01";
}

// ---------------------------------------------------------------------------
// micro sample: 6 H⁺ + 6 Cl⁻, NaOH added in whole ions

const MICRO_BOX = { x0: 0.02, x1: 0.98, y0: 0.02, y1: 0.98 };
const SLOTS = scatterSlots(30, MICRO_BOX, 6, 5, 7);

/** Hydroxide ions added to the six-ion sample after `volume` mL (rounded to whole ions). */
export function sampleHydroxide(volumeMl: number, veqMl: number): number {
  return Math.round((SAMPLE * volumeMl) / veqMl);
}

function microSample(added: number, previousAdded: number, systemId = "flask-sample"): ChemParticlesPanel {
  const neutralised = Math.min(added, SAMPLE);
  const particles: ChemParticle[] = [];
  for (let i = 1; i <= SAMPLE; i += 1) {
    particles.push({ id: `cl-${i}`, species: "Cl-", tone: "muted", ...SLOTS[SAMPLE + i - 1] });
    if (i <= neutralised) {
      // Water forms where the hydrogen ion was; it is new in the step it forms.
      const formedNow = i > Math.min(previousAdded, SAMPLE);
      particles.push({
        id: `w-${i}`,
        species: "H2O",
        tone: formedNow ? "focus" : null,
        from: formedNow ? [`h-${i}`, `oh-${i}`] : null,
        ...SLOTS[i - 1],
      });
    } else {
      particles.push({ id: `h-${i}`, species: "H+", ...SLOTS[i - 1] });
    }
  }
  for (let i = 1; i <= added; i += 1) {
    particles.push({ id: `na-${i}`, species: "Na+", tone: "muted", ...SLOTS[2 * SAMPLE + i - 1] });
    if (i > SAMPLE) particles.push({ id: `oh-${i}`, species: "OH-", tone: "focus", ...SLOTS[4 * SAMPLE + i - SAMPLE - 1] });
  }
  const inflow = added - previousAdded;
  return {
    type: "particles",
    id: "micro",
    rect: MICRO_RECT,
    system_id: systemId,
    title: "放大：锥形瓶中的离子（示意）",
    container: "beaker",
    particles,
    scale: 14,
    motion: 0.5,
    legend: true,
    entry: "top",
    inflow: inflow > 0 && systemId === "flask-sample" ? { Na: inflow, O: inflow, H: inflow } : null,
  };
}

// ---------------------------------------------------------------------------

interface Stage {
  volume: number;
  previousVolume: number;
}

export function buildTitrationLesson(params: TemplatePreviewParams): ChemLessonDraft {
  const conc = Number(stringParam(params, "conc", CONCENTRATIONS, "0.1"));
  const indicator = stringParam(params, "indicator", INDICATOR_IDS, "phenolphthalein") as IndicatorId;
  const sandboxVolume = boundedNumber(params, "volume", 20, 0, MAX_ML);
  const setup: TitrationSetup = { acidConc: conc, acidVolumeMl: ACID_ML, baseConc: conc };
  const veq = equivalenceVolumeMl(setup);
  const jump = jumpRange(setup);
  const ind = INDICATORS[indicator];
  const error = endpointError(setup, indicator);
  const curve = titrationCurve(setup, MAX_ML);
  const cLabel = concLabel(conc);
  const equation = "HCl + NaOH = NaCl + H_2O";
  const ph = (v: number) => titrationPh(setup, v);

  const rig = (stage: Stage, dripping = true): ChemTitrationPanel => ({
    type: "titration",
    id: "rig",
    rect: RIG_RECT,
    titrant: `NaOH ${cLabel} mol/L`,
    analyte: `HCl ${dec(ACID_ML)} mL`,
    capacity_ml: 50,
    dispensed_ml: stage.volume,
    flask_tint: indicatorTint(indicator, ph(stage.volume)),
    dripping: dripping && stage.volume > 0,
    ph: ph(stage.volume),
    indicator: ind.name,
  });

  const upTo = (v: number): Array<[number, number]> => [
    ...curve.filter(([x]) => x < v - 1e-9),
    [v, ph(v)],
  ];

  const chart = (stage: Stage, extra: {
    markers?: ChemMarker[];
    bands?: ChemBand[];
    rules?: ChemRule[];
    series?: ChemSeries[];
    full?: boolean;
  } = {}): ChemChartPanel => ({
    type: "chart",
    id: "curve",
    rect: CHART_RECT,
    title: "滴定曲线",
    x: { min: 0, max: MAX_ML, label: "V(NaOH)/mL", ticks: [0, 10, 20, 30, 40] },
    y: { min: 0, max: 14, label: "pH", ticks: [0, 2, 4, 6, 7, 8, 10, 12, 14] },
    series: extra.series ?? [{ id: "ph", points: extra.full ? curve : upTo(stage.volume), tone: "primary" }],
    markers: extra.markers ?? [{ id: "now", x: stage.volume, y: ph(stage.volume), label: `pH ${dec(ph(stage.volume))}`, tone: "focus" }],
    bands: extra.bands ?? null,
    rules: extra.rules ?? null,
    reveal: extra.full || extra.series ? null : { series_ids: ["ph"], from_x: stage.previousVolume },
  });

  const card = (heading: string, lines: string[], tone: "focus" | "primary" | "secondary" = "primary"): ChemCardsPanel => ({
    type: "cards",
    id: "note",
    rect: CARD_RECT,
    cards: [{ id: "note", heading, lines, tone }],
  });

  const micro = (stage: Stage) => microSample(sampleHydroxide(stage.volume, veq), sampleHydroxide(stage.previousVolume, veq));

  const scene = (stage: Stage, panels: ChemistryPanels, caption: string, callouts: ChemistrySceneCallouts = []) => ({
    kind: "chemistry_scene" as const,
    scene_id: SCENE,
    equation,
    panels: [rig(stage), ...panels],
    callouts,
    caption,
  });

  const vHalf = veq / 2;
  const vNear = jump.vLow;
  const vOver = jump.vHigh;
  const jumpBand: ChemBand = { id: "jump", axis: "y", from: jump.phLow, to: jump.phHigh, label: `突变 ${dec(jump.phLow)}–${dec(jump.phHigh)}`, tone: "focus" };
  const indicatorBands: ChemBand[] = [
    { id: "phenolphthalein", axis: "y", from: 8.2, to: 10, label: "酚酞 8.2–10.0", tint: { hue: "pink", strength: 0.35 } },
    { id: "methyl_orange", axis: "y", from: 3.1, to: 4.4, label: "甲基橙 3.1–4.4", tint: { hue: "orange", strength: 0.35 } },
  ];
  const equivalenceRule: ChemRule = { id: "veq", axis: "x", value: veq, label: `${dec(veq)} mL`, tone: "muted" };
  const hBefore = 10 ** -jump.phLow;
  const hAfter = 10 ** -jump.phHigh;
  const decades = Math.log10(hBefore / hAfter);
  const hydroxideOver = 10 ** -(14 - ph(vOver));
  /** One drop from a burette is about 0.04 mL (textbook: 19.98 → 20.02 mL is "about one drop"). */
  const DROP_ML = 0.04;
  const endpointDrops = Math.abs(error.volumeMl - veq) / DROP_ML;
  const indicatorWorks = Math.abs(error.relativeError) <= 0.001;
  const colourName = indicatorColorName(indicator, ind.endpointPh + 0.01);
  // Exam keys often write methyl orange's endpoint as "由红色变为橙色"; the case keeps the
  // analytically consistent "just yellow" (pH 4.4) and says how the two relate.
  const endpointCheckAnswer =
    indicator === "methyl_orange"
      ? `${ind.endpointText}。若半分钟内又变回橙色，说明局部过量的碱被尚未反应的酸中和了，还没有到终点。习题答案里常见的“由红色变为橙色”指颜色开始变化的时刻；按误差计算，${
          indicatorWorks ? "要滴到刚变黄（pH 4.4）才在 0.1% 以内" : "这个浓度下即使滴到刚变黄（pH 4.4），误差仍超过 0.1%"
        }。`
      : `${ind.endpointText}。若半分钟内褪色，说明局部过量的碱被尚未反应的酸中和了，还没有到终点。`;
  const bandMeetsJump = (id: IndicatorId) => INDICATORS[id].high > jump.phLow && INDICATORS[id].low < jump.phHigh;
  const bandSentence = INDICATOR_IDS
    .map((id) => `${INDICATORS[id].name}${bandMeetsJump(id) ? "与突变段相交" : "完全在突变段之外"}`)
    .join("，");
  const sandboxPh = ph(sandboxVolume);

  const steps: ChemStepDraft[] = [
    {
      id: "titration-setup",
      title: "用已知浓度的碱测未知浓度的酸",
      narration: `锥形瓶里是 20.00 毫升盐酸，滴两滴${ind.name}；滴定管里是浓度为 ${spokenConc(conc)} 摩尔每升的氢氧化钠标准溶液。只要准确测出恰好中和时用去的碱的体积，就能算出盐酸的浓度。现在 pH 计显示 ${dec(ph(0))}。`,
      scene: scene(
        { volume: 0, previousVolume: 0 },
        [chart({ volume: 0, previousVolume: 0 }, { series: [], markers: [{ id: "now", x: 0, y: ph(0), label: `pH ${dec(ph(0))}`, tone: "focus" }] }), micro({ volume: 0, previousVolume: 0 }), card("原理", ["c(HCl)·V(HCl) = c(NaOH)·V(NaOH)"], "secondary")],
        "关键：准确判断“恰好中和”的那一滴",
      ),
      questions: [
        { question: "这一幕先看清哪些量？", answer: `锥形瓶里 HCl 的体积 20.00 mL、滴定管里 NaOH 的浓度 ${cLabel} mol/L；滴定要测的是恰好中和时消耗的 NaOH 体积。` },
        { question: "为什么测出碱的体积就能算酸的浓度？", answer: "HCl 与 NaOH 按 1 : 1 反应，恰好中和时 n(HCl) = n(NaOH)，即 c(HCl)·V(HCl) = c(NaOH)·V(NaOH)，三个量已知就能求第四个。" },
        { question: "怎样自己检查装置读数？", answer: "滴定管的 0 刻度在上方，读数时视线与凹液面最低处相平，读到 0.01 mL；锥形瓶不用待测液润洗，滴定管要用标准液润洗。" },
      ],
    },
    {
      id: "titration-essence",
      title: "中和的本质：H⁺ 与 OH⁻ 结合成水",
      narration: "滴入第一批氢氧化钠：放大看，钠离子和氯离子都不参与反应，真正发生的是氢离子和氢氧根离子结合成水分子。这就是中和反应的实质。",
      scene: scene(
        { volume: veq / 3, previousVolume: 0 },
        [chart({ volume: veq / 3, previousVolume: 0 }), micro({ volume: veq / 3, previousVolume: 0 }), card("离子方程式", ["H^+ + OH^- = H_2O"], "focus")],
        "Na⁺ 与 Cl⁻ 是旁观离子，只有 H⁺ 和 OH⁻ 真正反应",
      ),
      questions: [
        { question: "放大图里哪些离子变了，哪些没变？", answer: "氢离子与新加入的氢氧根离子结合成水分子；氯离子和钠离子的数目在反应前后不变，是旁观离子。" },
        { question: "为什么离子方程式里没有 Na⁺ 和 Cl⁻？", answer: "NaCl 在水中完全电离，Na⁺ 和 Cl⁻ 反应前后都以离子形式存在，没有参与变化，所以在离子方程式中删去。" },
        { question: "怎样核对这个离子方程式？", answer: "H⁺ + OH⁻ = H₂O：两边各有 2 个氢原子、1 个氧原子；电荷左边 (+1) + (−1) = 0，右边 0，原子和电荷都守恒。" },
      ],
    },
    {
      id: "titration-half",
      title: "滴到一半：酸去了一半，pH 才升到这么点",
      narration: `滴到 ${dec(vHalf)} 毫升，一半的酸已经被中和，可 pH 只从 ${dec(ph(0))} 升到 ${dec(ph(vHalf))}。剩下的酸只有一半，溶液又被稀释，氢离子浓度约降为原来的三分之一；而 pH 是浓度的负对数，所以只增加 ${dec(ph(vHalf) - ph(0))}。`,
      scene: scene(
        { volume: vHalf, previousVolume: veq / 3 },
        [chart({ volume: vHalf, previousVolume: veq / 3 }), micro({ volume: vHalf, previousVolume: veq / 3 }), card("对数刻度", [`c(H^+) 约降为 1/3 → pH 仅 +${dec(ph(vHalf) - ph(0))}`], "primary")],
        "前半程曲线几乎是平的：pH 对浓度的变化很“迟钝”",
      ),
      questions: [
        { question: "曲线在这一段有什么特点？", answer: `从 0 到 ${dec(vHalf)} mL，pH 只从 ${dec(ph(0))} 升到 ${dec(ph(vHalf))}，曲线平缓，放大图里还剩一半的 H⁺。` },
        { question: "为什么中和了一半，pH 变化却很小？", answer: "pH = −lg c(H⁺)。剩余 H⁺ 减半、溶液体积又变大，c(H⁺) 约降为原来的 1/3，lg 3 ≈ 0.48，所以 pH 只升高约 0.48。" },
        { question: "怎样自己验算这个 pH？", answer: `剩余 n(H⁺) = (20.00 − ${dec(vHalf)}) × ${cLabel} mmol，总体积 ${dec(ACID_ML + vHalf)} mL，c(H⁺) = ${num(10 ** -ph(vHalf), 4)} mol/L，pH = ${dec(ph(vHalf))}。` },
      ],
    },
    {
      id: "titration-near",
      title: `差半滴：${dec(vNear)} mL 时 pH = ${dec(ph(vNear))}`,
      narration: `继续滴到 ${dec(vNear)} 毫升，离恰好中和只差零点零二毫升，也就是半滴。剩下的氢离子不到原来的千分之一，放大图里一个也看不见了，pH 才升到 ${dec(ph(vNear))}。`,
      scene: scene(
        { volume: vNear, previousVolume: vHalf },
        [chart({ volume: vNear, previousVolume: vHalf }, { rules: [equivalenceRule] }), micro({ volume: vNear, previousVolume: vHalf }), card("还差多少", [`剩余 c(H^+) = ${scientificMarkup(hBefore)} mol/L`], "primary")],
        `99.9% 的酸已被中和，pH 仍然只有 ${dec(ph(vNear))}`,
      ),
      questions: [
        { question: "这一点的读数是多少？", answer: `V(NaOH) = ${dec(vNear)} mL，pH = ${dec(ph(vNear))}；离恰好中和只差 0.02 mL，约半滴。` },
        { question: "为什么 99.9% 中和了，溶液还是酸性？", answer: `剩余的 H⁺ 虽然只有千分之一，浓度仍有约 ${uni(scientificMarkup(hBefore))} mol/L，比纯水中的 10⁻⁷ mol/L 大得多，所以 pH 仍明显小于 7。` },
        { question: `怎样验算 pH ${dec(ph(vNear))}？`, answer: `剩余 n(H⁺) = 0.02 mL × ${cLabel} mol/L，除以总体积 ${dec(ACID_ML + vNear)} mL，得 c(H⁺) ≈ ${uni(scientificMarkup(hBefore))} mol/L，pH ≈ ${dec(ph(vNear))}。` },
      ],
    },
    {
      id: "titration-jump",
      title: "再加一滴：pH 突变",
      narration: `只再加零点零四毫升，大约一滴，pH 就从 ${dec(ph(vNear))} 跳到 ${dec(ph(vOver))}：氢离子浓度一下子变小了约 ${ratioSpoken(hBefore / hAfter)} 倍。这段几乎竖直的线叫滴定突变，恰好中和的点 pH 等于 7，就落在突变中间。`,
      scene: scene(
        { volume: vOver, previousVolume: vNear },
        [
          chart({ volume: vOver, previousVolume: vNear }, {
            rules: [equivalenceRule],
            bands: [jumpBand],
            markers: [
              { id: "before", x: vNear, y: ph(vNear), label: dec(ph(vNear)), tone: "primary" },
              { id: "now", x: vOver, y: ph(vOver), label: `pH ${dec(ph(vOver))}`, tone: "focus" },
            ],
          }),
          micro({ volume: vOver, previousVolume: vNear }),
          card("一滴之差", [`c(H^+): ${scientificMarkup(hBefore)} → ${scientificMarkup(hAfter)}`], "focus"),
        ],
        `pH 是对数刻度：离子数几乎没变，c(H⁺) 却跨了约 ${num(decades, 0)} 个数量级`,
      ),
      questions: [
        { question: "突变发生在哪一段？", answer: `V(NaOH) 从 ${dec(vNear)} mL 到 ${dec(vOver)} mL（相差 0.04 mL，约一滴），pH 从 ${dec(ph(vNear))} 跳到 ${dec(ph(vOver))}。` },
        { question: "为什么一滴碱能让 pH 变化这么大？", answer: `恰好中和附近溶液中几乎没有 H⁺ 或 OH⁻ 剩余，一滴碱带来的 OH⁻ 相对于极小的剩余量就是巨大的变化；而 pH 是对数，c(H⁺) 从 ${uni(scientificMarkup(hBefore))} 降到 ${uni(scientificMarkup(hAfter))} mol/L，pH 就跨越约 ${num(ph(vOver) - ph(vNear), 1)} 个单位。` },
        { question: "怎样检查 20.02 mL 时的 pH？", answer: `过量 n(OH⁻) = 0.02 mL × ${cLabel} mol/L，c(OH⁻) ≈ ${uni(scientificMarkup(hydroxideOver))} mol/L，pOH ≈ ${dec(14 - ph(vOver))}，pH = 14 − pOH ≈ ${dec(ph(vOver))}。` },
      ],
    },
    {
      id: "titration-indicator",
      title: indicatorWorks ? "指示剂在突变范围内变色" : "指示剂变色太早：不在突变范围内",
      narration: indicatorWorks
        ? `${ind.name}的变色范围是 ${ind.low} 到 ${ind.high}，与 ${dec(jump.phLow)} 到 ${dec(jump.phHigh)} 的突变范围重叠。所以溶液一变色，加入的碱与恰好中和所需的量相差不到一滴。终点现象：${ind.endpointText}。`
        : `${ind.name}的变色范围是 ${ind.low} 到 ${ind.high}，而这个浓度下的突变范围是 ${dec(jump.phLow)} 到 ${dec(jump.phHigh)}，两者不重叠。溶液在 ${dec(error.volumeMl)} 毫升就已变${colourName}，比恰好中和少了约 ${num(endpointDrops, 0)} 滴，误差${percentSpoken(error.relativeError)}——这时应换用变色范围落在突变内的指示剂。`,
      scene: {
        ...scene(
          { volume: vOver, previousVolume: vOver },
          [
            chart({ volume: vOver, previousVolume: vOver }, {
              full: true,
              rules: [equivalenceRule],
              bands: indicatorBands,
              markers: [{ id: "now", x: vOver, y: ph(vOver), label: `${ind.name}：${indicatorColorName(indicator, ph(vOver))}`, tone: "focus" }],
            }),
            micro({ volume: vOver, previousVolume: vOver }),
            card("终点判断", [ind.endpointText.split("，")[0], ind.endpointText.split("，")[1] ?? ""], "focus"),
          ],
          indicatorWorks
            ? `${ind.name}的变色范围落在突变之内：终点误差 ${percentText(error.relativeError)}`
            : `${ind.name}的变色范围不在突变之内：终点误差 ${percentText(error.relativeError)}`,
        ),
      },
      questions: [
        { question: "两条色带分别是什么？", answer: `粉色带是酚酞的变色范围（8.2–10.0），橙色带是甲基橙的变色范围（3.1–4.4）。这条曲线的突变段是 ${dec(jump.phLow)}–${dec(jump.phHigh)}：${bandSentence}。` },
        { question: "为什么指示剂可以代替 pH 计判断终点？", answer: `只要指示剂的变色范围全部或部分落在突变范围内，溶液开始变色时加入的碱与恰好中和所需的量就相差不到一滴。按当前参数，用${ind.name}停在终点的相对误差为 ${percentText(error.relativeError)}，${indicatorWorks ? "可以接受" : `约差 ${num(endpointDrops, 0)} 滴，不宜选用`}。` },
        { question: "怎样判断终点已经到达？", answer: endpointCheckAnswer },
      ],
    },
    {
      id: "titration-concentration",
      title: "浓度越小，突变越窄",
      narration: `把酸和碱都换成其他浓度，比较三条曲线：浓度每变为原来的十分之一，突变范围两端各向中间收缩约 1 个 pH 单位。当前浓度 ${spokenConc(conc)} 摩尔每升，突变范围是 ${dec(jump.phLow)} 到 ${dec(jump.phHigh)}；用${ind.name}判断终点，误差${percentSpoken(error.relativeError)}。`,
      scene: scene(
        { volume: vOver, previousVolume: vOver },
        [
          chart({ volume: vOver, previousVolume: vOver }, {
            series: (["1", "0.1", "0.01"] as const).map((value) => {
              const other = Number(value);
              const s: TitrationSetup = { acidConc: other, acidVolumeMl: ACID_ML, baseConc: other };
              return {
                id: `c-${value}`,
                points: titrationCurve(s, MAX_ML),
                label: `${concLabel(other)} mol/L`,
                tone: other === conc ? ("primary" as const) : ("muted" as const),
                dashed: other !== conc,
              };
            }),
            bands: [jumpBand],
            rules: [equivalenceRule],
            markers: [],
          }),
          micro({ volume: vOver, previousVolume: vOver }),
          card(`${cLabel} mol/L`, [`突变 ${dec(jump.phLow)}–${dec(jump.phHigh)}`, `${ind.name}误差 ${percentText(error.relativeError)}`], Math.abs(error.relativeError) > 0.001 ? "focus" : "primary"),
        ],
        conc < 0.1
          ? "稀溶液的突变范围已经和甲基橙的变色范围错开：用甲基橙误差超过 0.1%"
          : "换参数看看：0.01 mol/L 时甲基橙还合适吗？",
      ),
      questions: [
        { question: "三条曲线有什么共同点和不同点？", answer: "三条曲线都在 20.00 mL 处经过 pH = 7；浓度越小，起点 pH 越高、终点 pH 越低，中间竖直的突变段越短。" },
        { question: "为什么浓度小，突变就窄？", answer: "在 ±0.1% 的范围内，剩余或过量的 H⁺、OH⁻ 的浓度与酸碱浓度成正比；浓度缩小为 1/10，c(H⁺) 与 c(OH⁻) 都缩小 10 倍，突变两端的 pH 各向 7 靠拢 1 个单位。" },
        { question: "怎样判断某个指示剂还能不能用？", answer: `看它的变色范围是否落在突变范围内。当前 ${cLabel} mol/L 的突变范围是 ${dec(jump.phLow)}–${dec(jump.phHigh)}；${conc < 0.1 ? "甲基橙（3.1–4.4）已不在其中" : "若降到 0.01 mol/L，突变为 5.30–8.70，甲基橙（3.1–4.4）就不在其中了"}，用它终点会提前约 0.8%。` },
      ],
    },
    {
      id: "titration-sandbox",
      title: "自己滴：拖动加入的体积",
      narration: `现在滴定管交给你：拖动右侧的加入体积，看 pH 计、溶液颜色和放大图一起变化。当前加入 ${dec(sandboxVolume)} 毫升，pH 为 ${dec(sandboxPh)}，溶液呈${indicatorColorName(indicator, sandboxPh)}。恰好中和时用去 ${dec(veq)} 毫升，所以盐酸浓度等于 ${spokenConc(conc)} 摩尔每升。`,
      scene: scene(
        { volume: sandboxVolume, previousVolume: vOver },
        [
          chart({ volume: sandboxVolume, previousVolume: vOver }, {
            full: true,
            rules: [equivalenceRule],
            markers: [{ id: "now", x: sandboxVolume, y: sandboxPh, label: `pH ${dec(sandboxPh)}`, tone: "focus" }],
          }),
          // A free trial: its own ledger, since the slider can also go backwards.
          microSample(sampleHydroxide(sandboxVolume, veq), sampleHydroxide(vOver, veq), "sandbox-sample"),
          card("计算", [`c(HCl) = ${cLabel} × ${dec(veq)} ÷ 20.00`, `= ${cLabel} mol/L`], "primary"),
        ],
        "三种视角同时读：刻度（宏观）、离子（微观）、pH 与方程（符号）",
      ),
      questions: [
        { question: "拖到哪里颜色会变？", answer: `以${ind.name}判断终点的 pH 是 ${ind.endpointPh}。当前参数下，约在 ${dec(error.volumeMl)} mL 可以看到溶液变${colourName}，与 ${dec(veq)} mL 相差${indicatorWorks ? "不到一滴" : `约 ${num(endpointDrops, 0)} 滴`}。` },
        { question: "为什么放大图里 H⁺ 和 OH⁻ 从不同时大量存在？", answer: "两者一相遇就结合成水：恰好中和之前剩下的是 H⁺，之后多出的是 OH⁻，两种离子不能大量共存。" },
        { question: "怎样用这次滴定算盐酸浓度？", answer: `恰好中和时 c(HCl) × 20.00 mL = ${cLabel} mol/L × ${dec(veq)} mL，得 c(HCl) = ${cLabel} mol/L。实验中要平行滴定 2–3 次取平均值。` },
      ],
    },
  ];

  return {
    title: "酸碱中和滴定 · pH 突变",
    summary: "滴定管、滴定曲线与锥形瓶里的离子同步变化：理解中和本质、pH 突变、指示剂选择与浓度的影响。",
    algorithmId: "chemistry_acid_base_titration",
    steps,
    controls: [
      { id: "conc", label: "酸碱浓度", value: cLabel, description: "mol/L" },
      { id: "indicator", label: "指示剂", value: ind.name, description: "酚酞或甲基橙" },
      { id: "volume", label: "加入 NaOH 体积", value: dec(sandboxVolume), description: "mL" },
    ],
  };
}

type ChemistryPanels = Array<ChemChartPanel | ChemParticlesPanel | ChemCardsPanel>;
type ChemistrySceneCallouts = Array<{ id: string; target: string; text: string; tone?: "focus" | "primary"; prefer?: "above" | "below" | "left" | "right" }>;

export const TITRATION_GOLD_TEMPLATE = chemistryCase({
  caseId: "acid-base-titration",
  archetypeId: "chemistry.acid-base.strong-acid-strong-base-titration",
  topic: "酸碱中和滴定",
  title: "酸碱中和滴定 · pH 突变",
  description: "滴定管、pH 曲线与锥形瓶里的离子同步：一滴之差的突变、指示剂与浓度的影响",
  prompt: "用 0.1000 mol/L NaOH 滴定 20.00 mL 同浓度盐酸，讲解中和本质、19.98 mL 到 20.02 mL 的 pH 突变、指示剂为什么能判断终点，以及浓度对突变范围的影响。",
  defaults: { conc: "0.1", indicator: "phenolphthalein", volume: 20 },
  controls: [
    {
      id: "conc",
      kind: "select",
      label: "酸碱浓度",
      description: "mol/L；酸与碱同浓度",
      resetPlayback: false,
      options: [
        { label: "0.1000", value: "0.1" },
        { label: "0.01000", value: "0.01" },
        { label: "1.000", value: "1" },
      ],
    },
    {
      id: "indicator",
      kind: "select",
      label: "指示剂",
      description: "终点颜色与误差随之改变",
      resetPlayback: false,
      options: [
        { label: "酚酞", value: "phenolphthalein" },
        { label: "甲基橙", value: "methyl_orange" },
      ],
    },
    {
      id: "volume",
      kind: "range",
      label: "加入 NaOH 体积",
      description: "mL；只驱动最后一步",
      min: 0,
      max: 40,
      step: 0.02,
      resetPlayback: false,
      steps: ["titration-sandbox"],
    },
  ],
  requiredCapabilities: ["chemistry_scene", "titration", "chart", "particle_zoom"],
  handsOn: ["titration-concentration", "titration-sandbox"],
  expectedFacts: [
    { id: "titration-essence", description: "中和的实质是 H⁺ 与 OH⁻ 结合成水", anyOf: ["H^+ + OH^- = H_2O", "结合成水"] },
    { id: "titration-jump", description: "19.98 mL 到 20.02 mL，pH 从 4.30 突变到 9.70", anyOf: ["4.30", "9.70"] },
    { id: "titration-indicator", description: "指示剂变色范围落在突变范围内", anyOf: ["突变范围", "变色范围"] },
  ],
  visualInvariants: [{
    id: "titration-three-views",
    description: "滴定装置、pH 曲线与离子放大图同屏联动",
    requiredSemanticRoles: ["titration", "chart", "particles"],
    requiredStateFields: ["dispensed_ml", "series", "particles"],
  }],
  objective: "从离子层面理解中和，定量解释滴定突变，并据此选择指示剂、判断浓度的影响。",
  build: buildTitrationLesson,
  posterStepIndex: 4,
});
