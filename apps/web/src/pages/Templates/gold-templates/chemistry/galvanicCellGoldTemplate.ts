import type {
  ChemGalvanicPanel,
  ChemHalfCell,
  ChemParticle,
  ChemParticlesPanel,
  ChemRect,
} from "../../../../features/playbook/engine/kits/chemistry/sceneTypes";
import { chemMarkupToUnicode as uni } from "../../../../features/playbook/engine/kits/chemistry/chemMarkup";
import type { TemplatePreviewParams } from "../../templatePreviewCases";
import { boundedNumber, stringParam } from "../standaloneCaseHelpers";
import { chemistryCase, lattice, type ChemLessonDraft, type ChemStepDraft } from "./chemistryCase";
import { dec, num, scientificMarkup, signed } from "./chemFormat";
import { cellEmf, electrodeMassChange, METALS, type AnodeMetal } from "./galvanicDomain";

/**
 * 锌铜原电池（必修第二册 第六章第一节；选择性必修1 第四章第一节）。
 *
 * Macro → micro → symbol, in the order a class meets it: a zinc strip in
 * copper sulfate only gets warm; splitting the two half-reactions and closing
 * the loop with a salt bridge turns the same electron transfer into current.
 * Two electrode close-ups run beside the apparatus so every half-reaction is
 * seen as atoms leaving or joining a lattice, with the atom ledger of each
 * close-up conserved from step to step and every beaker neutral once the
 * bridge has answered.
 */

const SCENE = "galvanic-cell";
const ANODES: readonly AnodeMetal[] = ["Zn", "Fe"];

const MACRO: ChemRect = { x: 16, y: 50, w: 520, h: 300 };
const STRIP: ChemRect = { x: 16, y: 360, w: 520, h: 66 };
const ANODE_ZOOM: ChemRect = { x: 556, y: 50, w: 428, h: 186 };
const CATHODE_ZOOM: ChemRect = { x: 556, y: 244, w: 428, h: 184 };

interface Metal {
  anode: AnodeMetal;
  data: (typeof METALS)[AnodeMetal];
}

function anodeCell(metal: Metal, overrides: Partial<ChemHalfCell> = {}): ChemHalfCell {
  return {
    electrode: metal.anode,
    electrode_label: `${metal.data.name}片`,
    solution: `${metal.data.sulfate} 溶液`,
    tint: metal.data.solutionTint,
    role: "negative",
    ...overrides,
  };
}

function cathodeCell(overrides: Partial<ChemHalfCell> = {}): ChemHalfCell {
  return {
    electrode: "Cu",
    electrode_label: "铜片",
    solution: "CuSO_4 溶液",
    tint: METALS.Cu.solutionTint,
    role: "positive",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// close-ups

type AnodeStage = "intact" | "oxidised" | "drained" | "bridged";
type CathodeStage = "intact" | "arriving" | "reduced" | "bridged";

function anodeZoom(metal: Metal, stage: AnodeStage): ChemParticlesPanel {
  const lat = lattice("m", metal.anode, 2, 3, { x0: 0.05, x1: 0.15, y0: 0.18, y1: 0.82 });
  const ion = `${metal.anode}2+`;
  const particles: ChemParticle[] = [
    ...lat.map((atom) => (stage !== "intact" && atom.id === "m-1-1"
      ? { id: atom.id, species: ion, x: 0.42, y: 0.5, tone: "focus" as const }
      : atom)),
    { id: "a-ion-1", species: ion, x: 0.62, y: 0.24 },
    { id: "a-ion-2", species: ion, x: 0.86, y: 0.72 },
    { id: "a-so4-1", species: "SO4^2-", tone: "muted", x: 0.62, y: 0.74 },
    { id: "a-so4-2", species: "SO4^2-", tone: "muted", x: 0.88, y: 0.26 },
  ];
  if (stage === "oxidised") {
    particles.push(
      { id: "a-e-1", species: "e-", x: 0.1, y: 0.02, fixed: true, tone: "focus" },
      { id: "a-e-2", species: "e-", x: 0.1, y: 0.34, fixed: true, tone: "focus" },
    );
  }
  if (stage === "bridged") {
    particles.push(
      { id: "a-cl-1", species: "Cl-", x: 0.76, y: 0.48, tone: "focus" },
      { id: "a-cl-2", species: "Cl-", x: 0.95, y: 0.5, tone: "focus" },
    );
  }
  return {
    type: "particles",
    id: "anode-zoom",
    rect: ANODE_ZOOM,
    system_id: "anode-zoom",
    title: `放大：${metal.data.name}片（负极）表面`,
    container: "box",
    slab: { side: "left", material: metal.anode, depth: 0.2, label: `${metal.data.name}片` },
    particles,
    motion: 0.45,
    scale: 14,
    legend: true,
    entry: "right",
    inflow: stage === "bridged" ? { Cl: 2 } : null,
  };
}

function cathodeZoom(stage: CathodeStage): ChemParticlesPanel {
  const lat = lattice("c", "Cu", 2, 3, { x0: 0.85, x1: 0.95, y0: 0.18, y1: 0.82 });
  const reduced = stage === "reduced" || stage === "bridged";
  const particles: ChemParticle[] = [
    ...lat,
    reduced
      ? { id: "c-ion-1", species: "Cu", x: 0.76, y: 0.5, fixed: true, tone: "focus" }
      : { id: "c-ion-1", species: "Cu2+", x: 0.55, y: 0.5 },
    { id: "c-ion-2", species: "Cu2+", x: 0.3, y: 0.16 },
    { id: "c-ion-3", species: "Cu2+", x: 0.14, y: 0.8 },
    { id: "c-so4-1", species: "SO4^2-", tone: "muted", x: 0.08, y: 0.24 },
    { id: "c-so4-2", species: "SO4^2-", tone: "muted", x: 0.36, y: 0.88 },
    { id: "c-so4-3", species: "SO4^2-", tone: "muted", x: 0.6, y: 0.14 },
  ];
  if (stage === "arriving") {
    particles.push(
      { id: "c-e-1", species: "e-", x: 0.9, y: 0.02, fixed: true, tone: "focus" },
      { id: "c-e-2", species: "e-", x: 0.9, y: 0.34, fixed: true, tone: "focus" },
    );
  }
  if (stage === "bridged") {
    particles.push(
      { id: "c-k-1", species: "K+", x: 0.05, y: 0.5, tone: "focus" },
      { id: "c-k-2", species: "K+", x: 0.24, y: 0.5, tone: "focus" },
    );
  }
  return {
    type: "particles",
    id: "cathode-zoom",
    rect: CATHODE_ZOOM,
    system_id: "cathode-zoom",
    title: "放大：铜片（正极）表面",
    container: "box",
    slab: { side: "right", material: "Cu", depth: 0.2, label: "铜片" },
    particles,
    motion: 0.45,
    scale: 14,
    legend: true,
    entry: "left",
    inflow: stage === "bridged" ? { K: 2 } : null,
  };
}

function directZoom(metal: Metal): ChemParticlesPanel {
  const lat = lattice("d", metal.anode, 2, 4, { x0: 0.05, x1: 0.15, y0: 0.14, y1: 0.86 });
  return {
    type: "particles",
    id: "direct-zoom",
    rect: { x: 336, y: 56, w: 360, h: 364 },
    system_id: "direct-zoom",
    title: `放大：${metal.data.name}片表面`,
    container: "box",
    slab: { side: "left", material: metal.anode, depth: 0.2, label: `${metal.data.name}片` },
    particles: [
      ...lat.filter((atom) => atom.id !== "d-1-1" && atom.id !== "d-1-2"),
      { id: "d-cu-1", species: "Cu", x: 0.25, y: 0.16, fixed: true },
      { id: "d-cu-2", species: "Cu", x: 0.25, y: 0.84, fixed: true },
      { id: "d-e-1", species: "e-", x: 0.26, y: 0.42, fixed: true, tone: "focus" },
      { id: "d-e-2", species: "e-", x: 0.26, y: 0.56, fixed: true, tone: "focus" },
      { id: "d-cu2-1", species: "Cu2+", x: 0.4, y: 0.5, tone: "focus" },
      { id: "d-m-1", species: `${metal.anode}2+`, x: 0.62, y: 0.2 },
      { id: "d-m-2", species: `${metal.anode}2+`, x: 0.7, y: 0.82 },
      { id: "d-so4-1", species: "SO4^2-", tone: "muted", x: 0.9, y: 0.2 },
      { id: "d-so4-2", species: "SO4^2-", tone: "muted", x: 0.44, y: 0.84 },
      { id: "d-so4-3", species: "SO4^2-", tone: "muted", x: 0.92, y: 0.8 },
    ],
    motion: 0.45,
    legend: true,
  };
}

// ---------------------------------------------------------------------------
// the lesson

export function buildGalvanicCellLesson(params: TemplatePreviewParams): ChemLessonDraft {
  const anode = stringParam(params, "anode", ANODES, "Zn") as AnodeMetal;
  const electrons = boundedNumber(params, "electrons", 0.2, 0.1, 0.4);
  const metal: Metal = { anode, data: METALS[anode] };
  const name = metal.data.name;
  const ionMarkup = metal.data.ionMarkup;
  const ionName = metal.data.ionName;
  const emf = cellEmf(anode);
  const ledger = electrodeMassChange(anode, electrons);
  const overall = `${anode} + Cu^{2+} = ${ionMarkup} + Cu`;
  const anodeHalf = `${anode} − 2e^- = ${ionMarkup}`;
  const cathodeHalf = "Cu^{2+} + 2e^- = Cu";
  const equation = `${anode} + CuSO_4 = ${metal.data.sulfate} + Cu`;

  const cell = (overrides: Partial<ChemGalvanicPanel>, rect: ChemRect = MACRO): ChemGalvanicPanel => ({
    type: "galvanic_cell",
    id: "cell",
    rect,
    mode: "two_beakers",
    left: anodeCell(metal),
    right: cathodeCell(),
    salt_bridge: { cation: "K+", anion: "Cl-", migrating: false },
    meter: { kind: "ammeter", reading: "指针偏转", deflection: 0.55 },
    electron_flow: "left_to_right",
    ion_flows: [],
    ...overrides,
  });
  const strip = (heading: string, line: string, tone: "focus" | "primary" | "secondary" = "focus") => ({
    type: "cards" as const,
    id: "half-reaction",
    rect: STRIP,
    cards: [{ id: "half", heading, lines: [line], tone }],
  });

  const steps: ChemStepDraft[] = [
    {
      id: "cell-direct",
      title: `${name}片直接放进硫酸铜溶液`,
      narration: `把${name}片直接插进蓝色的硫酸铜溶液：${name}片表面很快析出红色的铜，溶液的蓝色变浅，摸一摸烧杯还会发热。放大看，电子在${name}片表面直接交给了铜离子——化学能全变成了热，没有一点变成电。`,
      scene: {
        kind: "chemistry_scene",
        scene_id: SCENE,
        equation,
        panels: [
          {
            type: "galvanic_cell",
            id: "direct-cell",
            rect: { x: 16, y: 52, w: 300, h: 372 },
            mode: "single_beaker",
            left: {
              electrode: anode,
              electrode_label: `${name}片`,
              solution: "CuSO_4 溶液",
              tint: { hue: "blue", strength: 0.45 },
              deposit: 0.7,
              deposit_element: "Cu",
            },
            ion_flows: [
              { id: "direct-cu", species: "Cu2+", route: "left_in" },
              { id: "direct-m", species: `${anode}2+`, route: "left_out" },
            ],
          },
          directZoom(metal),
          {
            type: "cards",
            id: "direct-cards",
            rect: { x: 716, y: 60, w: 268, h: 360 },
            cards: [
              { id: "seen", heading: "宏观现象", lines: [`${name}片表面析出红色铜`, "溶液蓝色变浅", "溶液温度升高"], tone: "secondary" },
              { id: "essence", heading: "符号表示", lines: [overall, "电子直接转移 → 放热"], tone: "focus" },
            ],
          },
        ],
        callouts: [{ id: "direct-e", target: "direct-zoom/d-e-1", text: "电子在表面直接交接", tone: "focus", prefer: "right" }],
        caption: "宏观（析出铜、放热）↔ 微观（表面电子交接）↔ 符号（离子方程式）",
      },
      questions: [
        { question: "这一幕先看哪三个现象？", answer: `${name}片表面出现红色的铜、溶液蓝色变浅、烧杯发热。它们分别对应：铜离子变成铜原子、铜离子浓度下降、反应放出能量。` },
        { question: "为什么这样放不出电流？", answer: `氧化（${name}失电子）和还原（铜离子得电子）发生在同一个表面，电子直接交接，不经过外电路，能量只能以热的形式放出。` },
        { question: "怎样自己检验这个解释？", answer: `称量反应前后的${name}片：${name}溶解、铜析出，净离子方程式 ${uni(overall)} 两边原子数和电荷数都相等。` },
      ],
    },
    {
      id: "cell-split",
      title: "把氧化和还原分到两个烧杯",
      narration: `把${name}片放进${name === "锌" ? "硫酸锌" : "硫酸亚铁"}溶液，铜片放进硫酸铜溶液，用导线和电流计连起来：指针纹丝不动。因为回路没有闭合——如果${name}继续失电子，左杯的正电荷会越积越多，右杯的负电荷也会越积越多，电子立刻就流不动了。`,
      scene: {
        kind: "chemistry_scene",
        scene_id: SCENE,
        equation,
        panels: [
          cell({
            rect: { x: 16, y: 50, w: 600, h: 376 },
            salt_bridge: null,
            meter: { kind: "ammeter", reading: "I = 0", deflection: 0 },
            electron_flow: "none",
          }, { x: 16, y: 50, w: 600, h: 376 }),
          {
            type: "cards",
            id: "split-cards",
            rect: { x: 640, y: 60, w: 344, h: 360 },
            cards: [
              { id: "reading", heading: "电流计读数", lines: ["指针不偏转：I = 0"], tone: "muted" },
              { id: "why", heading: "为什么？", lines: ["左杯若多出阳离子 → 带正电", "右杯若少掉阳离子 → 带负电", "电荷积累，回路不通"], tone: "focus" },
            ],
          },
        ],
        callouts: [
          { id: "left-plus", target: "cell/left_solution", text: "正电荷积累", tone: "focus", prefer: "below" },
          { id: "right-minus", target: "cell/right_solution", text: "负电荷积累", tone: "primary", prefer: "below" },
        ],
        caption: "只有导线还不够：两个溶液之间也必须让电荷能够移动",
      },
      questions: [
        { question: "这一幕先观察什么？", answer: "电流计的指针：导线已经把两个电极连起来了，但指针不偏转，说明外电路没有持续的电流。" },
        { question: "为什么连上导线也没有电流？", answer: `电子流动需要闭合回路。若${name}继续失电子，左杯会积累正电荷、右杯会积累负电荷，产生的电场立刻阻止电子继续流动。` },
        { question: "怎样检验“缺的是离子通道”？", answer: "保持导线不动，只在两杯之间加一个能导电的离子通道（盐桥）。如果指针随即偏转，就说明缺的正是溶液中的电荷通路。" },
      ],
    },
    {
      id: "cell-bridge",
      title: "接上盐桥，指针偏转",
      narration: `在两杯之间搭上装有氯化钾溶液的盐桥，指针立刻偏转：电子从${name}片经导线流向铜片，电流的方向正好相反。化学能第一次变成了电能——${name}片是负极，铜片是正极。右边把两个电极表面放大，接下来一边一边看。`,
      scene: {
        kind: "chemistry_scene",
        scene_id: SCENE,
        equation,
        panels: [
          cell({}),
          strip("能量转化", "化学能 → 电能：电子 负极 → 导线 → 正极", "primary"),
          anodeZoom(metal, "intact"),
          cathodeZoom("intact"),
        ],
        callouts: [{ id: "wire-e", target: "cell/wire", text: "电子经导线流动", tone: "focus", prefer: "below" }],
        caption: "外电路靠电子导电，溶液和盐桥里靠离子导电",
      },
      questions: [
        { question: "盐桥接上后看到了什么？", answer: `电流计指针偏转，说明外电路有了持续的电流，电子从${name}片经导线流向铜片。` },
        { question: "为什么加了盐桥就通了？", answer: "盐桥里的钾离子和氯离子可以在两杯之间迁移，及时中和两杯里的电荷积累，使整个回路闭合：导线里电子移动，溶液和盐桥里离子移动。" },
        { question: "怎样判断正负极？", answer: `较活泼的金属失电子、电子从它流出，是负极（${name}）；电子流入、溶液中阳离子在此得电子的一极是正极（铜）。电流方向与电子流向相反。` },
      ],
    },
    {
      id: "cell-anode",
      title: `负极：${name}原子失去电子`,
      narration: `放大负极表面：一个${name}原子失去两个电子，变成${ionName}进入溶液；留在${name}片里的两个电子沿导线流走。这就是负极的氧化反应，${name}片因此一点点变薄。`,
      scene: {
        kind: "chemistry_scene",
        scene_id: SCENE,
        equation,
        panels: [
          cell({ ion_flows: [{ id: "anode-out", species: `${anode}2+`, route: "left_out" }], left: anodeCell(metal, { wear: 0.12 }) }),
          strip("负极（氧化反应）", anodeHalf, "focus"),
          anodeZoom(metal, "oxidised"),
          cathodeZoom("arriving"),
        ],
        callouts: [
          { id: "anode-ion", target: "anode-zoom/m-1-1", text: `${ionMarkup} 进入溶液`, tone: "focus", prefer: "above" },
        ],
        caption: `${name}片逐渐变薄，溶液中的${ionName}增多：负极质量减小`,
      },
      questions: [
        { question: "放大图里先盯住哪个粒子？", answer: `表面那个被圈出的${name}原子：它离开晶格变成带两个正电荷的${ionName}，同时把两个电子留在金属里。` },
        { question: "为什么说负极发生氧化反应？", answer: `${name}的化合价从 0 升到 +2，失去电子，这正是氧化反应的定义；失去的电子经导线流向正极。` },
        { question: "怎样核对负极的电极反应式？", answer: `看 ${uni(anodeHalf)}：左右都是一个${name}原子；左边电荷 0 − (−2)×1 = +2，右边 +2，电荷守恒。` },
      ],
    },
    {
      id: "cell-cathode",
      title: "正极：铜离子得到电子",
      narration: `电子沿导线到达铜片。溶液里的一个铜离子游到铜片表面，接过这两个电子，变成铜原子留在表面——这是正极的还原反应，铜片因此变厚，硫酸铜溶液的蓝色慢慢变浅。`,
      scene: {
        kind: "chemistry_scene",
        scene_id: SCENE,
        equation,
        panels: [
          cell({
            ion_flows: [{ id: "cathode-in", species: "Cu2+", route: "right_in" }],
            left: anodeCell(metal, { wear: 0.18 }),
            right: cathodeCell({ deposit: 0.3, tint: { hue: "blue", strength: 0.62 } }),
          }),
          strip("正极（还原反应）", cathodeHalf, "primary"),
          anodeZoom(metal, "drained"),
          cathodeZoom("reduced"),
        ],
        callouts: [{ id: "cathode-atom", target: "cathode-zoom/c-ion-1", text: "得 2e^- 变成 Cu", tone: "primary", prefer: "left" }],
        caption: "铜片表面有铜析出，溶液蓝色变浅：正极质量增大",
      },
      questions: [
        { question: "放大图里发生了什么变化？", answer: "一个铜离子移到铜片表面，与两个电子结合成铜原子，成为铜片晶格的一部分，所以铜片表面有新的铜析出。" },
        { question: `为什么是铜离子得电子，而不是${ionName}或氢离子？`, answer: `在这个电池里，铜离子比${ionName}更容易得到电子；溶液中得电子能力最强的阳离子在正极优先被还原。` },
        { question: "怎样核对正极的电极反应式？", answer: "Cu²⁺ + 2e⁻ = Cu：两边都是一个铜原子；左边电荷 +2 + (−2) = 0，右边 0，电荷守恒；负极失去的电子数与正极得到的电子数相等。" },
      ],
    },
    {
      id: "cell-salt-bridge",
      title: "盐桥里的离子迁移",
      narration: `负极区多出了${ionName}，正极区少了铜离子。盐桥里的氯离子向负极区移动，钾离子向正极区移动，两个烧杯随时保持电中性，回路才能一直闭合。记住方向：阴离子移向负极，阳离子移向正极。`,
      scene: {
        kind: "chemistry_scene",
        scene_id: SCENE,
        equation,
        panels: [
          cell({
            salt_bridge: { cation: "K+", anion: "Cl-", migrating: true },
            ion_flows: [
              { id: "bridge-cl", species: "Cl-", route: "bridge_to_left" },
              { id: "bridge-k", species: "K+", route: "bridge_to_right" },
            ],
            left: anodeCell(metal, { wear: 0.22 }),
            right: cathodeCell({ deposit: 0.38, tint: { hue: "blue", strength: 0.58 } }),
          }),
          strip("盐桥的作用", "阴离子 → 负极区，阳离子 → 正极区：溶液保持电中性", "secondary"),
          anodeZoom(metal, "bridged"),
          cathodeZoom("bridged"),
        ],
        callouts: [{ id: "bridge-cl", target: "anode-zoom/a-cl-1", text: "Cl^- 来自盐桥", tone: "focus", prefer: "left" }],
        caption: "每个放大图里正负电荷数重新相等：电荷守恒由盐桥维持",
      },
      questions: [
        { question: "盐桥两端各有什么离子进入溶液？", answer: "氯离子进入负极区，补偿新生成的阳离子；钾离子进入正极区，补偿被消耗的铜离子。两个放大图里正负电荷重新相等。" },
        { question: "为什么阴离子移向负极区？", answer: `负极区不断生成${ionName}，正电荷过剩，吸引带负电的氯离子；正极区铜离子被消耗，负电荷相对过剩，吸引带正电的钾离子。` },
        { question: "怎样检查电中性？", answer: `数放大图的电荷：负极区 3 个${ionName}（+6）、2 个硫酸根（−4）、2 个氯离子（−2），合计 0；正极区 2 个铜离子（+4）、3 个硫酸根（−6）、2 个钾离子（+2），合计 0。` },
      ],
    },
    {
      id: "cell-ledger",
      title: "电子守恒：算电极的质量变化",
      narration: `外电路每通过 2 摩尔电子，负极就溶解 1 摩尔${name}，正极就析出 1 摩尔铜。现在通过 ${num(electrons, 1)} 摩尔电子：${name}片减少 ${num(ledger.anodeLossG, 2)} 克，铜片增加 ${num(ledger.cathodeGainG, 2)} 克。拖动右侧滑杆改变电子的物质的量，两边一起按比例变化。`,
      scene: {
        kind: "chemistry_scene",
        scene_id: SCENE,
        equation,
        panels: [
          cell({
            rect: { x: 16, y: 50, w: 560, h: 376 },
            left: anodeCell(metal, { wear: Math.min(0.9, 0.2 + electrons * 1.6) }),
            right: cathodeCell({ deposit: Math.min(1, 0.25 + electrons * 1.9), tint: { hue: "blue", strength: Math.max(0.2, 0.75 - electrons * 1.2) } }),
          }, { x: 16, y: 50, w: 560, h: 376 }),
          {
            type: "cards",
            id: "ledger-cards",
            rect: { x: 600, y: 60, w: 384, h: 360 },
            cards: [
              { id: "electrons", heading: "外电路通过电子", lines: [`n(e^-) = ${num(electrons, 1)} mol`, `电量 Q = ${scientificMarkup(ledger.charge, 3)} C`], tone: "focus" },
              { id: "anode", heading: `负极 ${anode}（M = ${metal.data.molarMass} g/mol）`, lines: [`减少 ${num(electrons / 2, 2)} mol × ${metal.data.molarMass} = ${num(ledger.anodeLossG, 2)} g`], tone: "focus" },
              { id: "cathode", heading: "正极 Cu（M = 64 g/mol）", lines: [`增加 ${num(electrons / 2, 2)} mol × 64 = ${num(ledger.cathodeGainG, 2)} g`], tone: "primary" },
            ],
          },
        ],
        callouts: [],
        caption: "得失电子相等是原电池计算的出发点：n(金属) = n(e⁻) ÷ 2",
      },
      questions: [
        { question: "这一幕的数字从哪里来？", answer: `每个${name}原子失 2 个电子、每个铜离子得 2 个电子，所以 n(${anode}) = n(Cu) = n(e⁻)/2 = ${num(electrons / 2, 2)} mol。` },
        { question: "为什么两个电极的质量变化不相等？", answer: `转移的物质的量相同，但摩尔质量不同：${name} ${metal.data.molarMass} g/mol，铜 64 g/mol，所以减少 ${num(ledger.anodeLossG, 2)} g、增加 ${num(ledger.cathodeGainG, 2)} g。` },
        { question: "怎样自己验算？", answer: `把滑杆拖到 0.4 mol：${name}片应减少 ${num(0.2 * metal.data.molarMass, 1)} g，铜片应增加 12.8 g，都是 0.2 mol 时的两倍。` },
      ],
    },
    {
      id: "cell-voltage",
      title: "拓展：两极越“不一样”，电压越大",
      narration: `把电流计换成电压表：${name}铜原电池的理论电压约 ${dec(emf, 2)} 伏，等于铜和${name}两个电对标准电极电势之差。两种金属失电子能力相差越大，电压越大。原电池要成立，需要四个条件：两个活泼性不同的电极、电解质溶液、闭合回路和一个能自发进行的氧化还原反应。`,
      scene: {
        kind: "chemistry_scene",
        scene_id: SCENE,
        equation,
        panels: [
          {
            type: "chart",
            id: "potential-ladder",
            rect: { x: 16, y: 50, w: 520, h: 376 },
            title: "标准电极电势（25 ℃）",
            x: { min: 0, max: 1, label: "", ticks: [] },
            y: { min: -1, max: 0.6, label: "E°/V", ticks: [-1, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6] },
            series: [
              { id: "gap", points: [[0.52, METALS[anode].standardPotential], [0.52, METALS.Cu.standardPotential]], tone: "focus", label: `E = ${dec(emf, 2)} V` },
            ],
            rules: [
              { id: "zn", axis: "y", value: METALS.Zn.standardPotential, label: "Zn^{2+}/Zn −0.76", tone: anode === "Zn" ? "focus" : "muted" },
              { id: "fe", axis: "y", value: METALS.Fe.standardPotential, label: "Fe^{2+}/Fe −0.44", tone: anode === "Fe" ? "focus" : "muted" },
              { id: "cu", axis: "y", value: METALS.Cu.standardPotential, label: "Cu^{2+}/Cu +0.34", tone: "primary" },
            ],
          },
          {
            type: "cards",
            id: "conditions",
            rect: { x: 560, y: 60, w: 424, h: 360 },
            title: "原电池的构成条件",
            cards: [
              { id: "c1", lines: ["① 两个活泼性不同的电极"], tone: "secondary" },
              { id: "c2", lines: ["② 电解质溶液（离子导电）"], tone: "secondary" },
              { id: "c3", lines: ["③ 闭合回路（导线 + 盐桥）"], tone: "secondary" },
              { id: "c4", lines: ["④ 自发的氧化还原反应"], tone: "secondary" },
              { id: "emf", heading: `${anode}–Cu 电池`, lines: [`E = 0.34 − (${signed(METALS[anode].standardPotential, 2)}) = ${dec(emf, 2)} V`], tone: "focus" },
            ],
          },
        ],
        callouts: [],
        caption: anode === "Fe" ? "铁作负极只失 2 个电子，生成 Fe²⁺，不是 Fe³⁺" : "换成铁作负极，电压降到 0.78 V：试试右侧的“负极金属”",
      },
      questions: [
        { question: "图上两条横线之间的距离代表什么？", answer: `正极电对与负极电对的标准电极电势之差，也就是这个电池的理论电压：0.34 − (${signed(METALS[anode].standardPotential, 2)}) = ${dec(emf, 2)} V。` },
        { question: "为什么换成铁，电压就变小？", answer: "铁失电子的能力比锌弱（Fe²⁺/Fe 的电极电势 −0.44 V 高于锌的 −0.76 V），与铜的差距变小，电池电压从 1.10 V 降到 0.78 V。" },
        { question: "怎样检查一个装置能不能构成原电池？", answer: "逐条核对四个条件：电极活泼性不同、有电解质溶液、形成闭合回路、存在自发的氧化还原反应。少一条，外电路就没有持续电流。" },
      ],
    },
  ];

  return {
    title: `${name}铜原电池 · 电子与离子的双通道`,
    summary: `从${name}片放进硫酸铜只会发热出发，拆分半反应、接通盐桥，逐个放大负极、正极与盐桥，最后用电子守恒算电极质量。`,
    algorithmId: "chemistry_galvanic_cell",
    steps,
    controls: [
      { id: "anode", label: "负极金属", value: anode, description: "锌或铁" },
      { id: "electrons", label: "通过电子 n(e⁻)", value: num(electrons, 1), description: "0.1–0.4 mol" },
    ],
  };
}

export const GALVANIC_CELL_GOLD_TEMPLATE = chemistryCase({
  caseId: "galvanic-cell",
  archetypeId: "chemistry.electrochemistry.zinc-copper-galvanic-cell",
  topic: "原电池",
  title: "锌铜原电池 · 电子与离子",
  description: "从直接置换只放热到盐桥接通：负极、正极、盐桥逐个放大，电子守恒算电极质量",
  prompt: "讲解锌铜原电池：为什么锌片直接放进硫酸铜只放热，盐桥接通后电子和离子分别怎样移动，写出两极反应并用电子守恒计算电极质量变化。",
  defaults: { anode: "Zn", electrons: 0.2 },
  controls: [
    {
      id: "anode",
      kind: "select",
      label: "负极金属",
      description: "锌或铁；整课随之重算",
      resetPlayback: false,
      options: [
        { label: "锌（Zn）", value: "Zn" },
        { label: "铁（Fe）", value: "Fe" },
      ],
    },
    {
      id: "electrons",
      kind: "range",
      label: "通过电子 n(e⁻)",
      description: "mol；两极质量按比例变化",
      min: 0.1,
      max: 0.4,
      step: 0.1,
      resetPlayback: false,
      steps: ["cell-ledger"],
    },
  ],
  requiredCapabilities: ["chemistry_scene", "galvanic_cell", "particle_zoom", "atom_ledger"],
  handsOn: ["cell-ledger", "cell-voltage"],
  expectedFacts: [
    { id: "cell-anode", description: "负极锌失电子被氧化", anyOf: ["Zn − 2e^- = Zn^{2+}", "负极失电子"] },
    { id: "cell-cathode", description: "正极铜离子得电子被还原", anyOf: ["Cu^{2+} + 2e^- = Cu", "正极得电子"] },
    { id: "cell-bridge", description: "盐桥中阴离子移向负极区、阳离子移向正极区", anyOf: ["阴离子 → 负极区", "阴离子移向负极"] },
    { id: "cell-emf", description: "锌铜电池理论电压约 1.10 V", anyOf: ["1.1 V", "1.10 V"] },
  ],
  visualInvariants: [{
    id: "cell-two-channels",
    description: "外电路电子流与溶液、盐桥中的离子迁移同屏，负极与正极表面有放大视图",
    requiredSemanticRoles: ["galvanic_cell", "particles"],
    requiredStateFields: ["panels", "salt_bridge", "electron_flow", "ion_flows"],
  }],
  objective: "把置换反应拆成两个半反应，理解电子走导线、离子走溶液与盐桥的双通道，并用电子守恒计算。",
  build: buildGalvanicCellLesson,
  posterStepIndex: 5,
});
