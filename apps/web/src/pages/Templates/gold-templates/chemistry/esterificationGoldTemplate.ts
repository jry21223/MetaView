import type {
  ChemBond,
  ChemCallout,
  ChemCardsPanel,
  ChemMoleculesPanel,
} from "../../../../features/playbook/engine/kits/chemistry/sceneTypes";
import type { TemplatePreviewParams } from "../../templatePreviewCases";
import { stringParam } from "../standaloneCaseHelpers";
import { chemistryCase, type ChemLessonDraft, type ChemStepDraft } from "./chemistryCase";
import {
  esterGroups,
  esterMass,
  esterStage,
  nextArrow,
  type Alcohol,
  type EsterStage,
} from "./esterMechanism";

/**
 * 乙酸乙酯的酯化反应机理（必修第二册 第七章第三节；选择性必修3 第三章第四节）。
 *
 * The question the textbook asks — which molecule loses the –OH? — is
 * answered twice: first by the ¹⁸O tracer experiment (the label ends up in
 * the ester, so the acid loses –OH and the alcohol loses H), then atom by
 * atom through the acid-catalysed mechanism, with each bond cracking open
 * or growing in and a curly arrow announcing the next move.
 */

const SCENE = "esterification-mechanism";
const ALCOHOLS: readonly Alcohol[] = ["ethanol", "methanol"];
const MODELS = ["ball_stick", "space_fill"] as const;
type Model = (typeof MODELS)[number];

const MOLECULE_RECT = { x: 16, y: 50, w: 640, h: 376 };
const CARD_RECT = { x: 676, y: 60, w: 308, h: 366 };

function highlight(bonds: ChemBond[], ids: Record<string, "focus" | "primary">): ChemBond[] {
  return bonds.map((bond) => (ids[bond.id] ? { ...bond, tone: ids[bond.id] } : bond));
}

export function buildEsterificationLesson(params: TemplatePreviewParams): ChemLessonDraft {
  const alcohol = stringParam(params, "alcohol", ALCOHOLS, "ethanol") as Alcohol;
  const model = stringParam(params, "model", MODELS, "ball_stick") as Model;
  const ethanol = alcohol === "ethanol";
  const alcoholName = ethanol ? "乙醇" : "甲醇";
  const esterName = ethanol ? "乙酸乙酯" : "乙酸甲酯";
  const alkyl = ethanol ? "C_2H_5" : "CH_3";
  const alcoholFormula = ethanol ? "CH_3CH_2^{18}OH" : "CH_3^{18}OH";
  const esterFormula = `CH_3CO^{18}O${alkyl}`;
  const labelledMass = esterMass(alcohol, true);
  const plainMass = esterMass(alcohol, false);
  const equation = `CH_3COOH + ${alcoholFormula} ⇌ ${esterFormula} + H_2O`;

  const molecules = (
    stage: EsterStage,
    options: { focus?: string[]; bondTones?: Record<string, "focus" | "primary">; arrows?: boolean; yaw?: number; title?: string } = {},
  ): ChemMoleculesPanel => {
    const { atoms, bonds } = esterStage(stage, alcohol, options.focus ?? []);
    return {
      type: "molecules",
      id: "mechanism",
      rect: MOLECULE_RECT,
      system_id: "ester-mechanism",
      title: options.title ?? null,
      style: model,
      view: { yaw: options.yaw ?? 12, pitch: 14 },
      scale: model === "space_fill" ? 44 : 50,
      center: { x: 2.0, y: -0.5, z: 0 },
      atoms,
      bonds: highlight(bonds, options.bondTones ?? {}),
      arrows: options.arrows === false ? [] : nextArrow(stage),
      groups: esterGroups(stage, alcohol),
    };
  };
  const cards = (items: ChemCardsPanel["cards"], title: string | null = null): ChemCardsPanel => ({
    type: "cards",
    id: "cards",
    rect: CARD_RECT,
    title,
    cards: items,
  });
  const scene = (panels: Array<ChemMoleculesPanel | ChemCardsPanel>, caption: string, callouts: ChemCallout[] = []) => ({
    kind: "chemistry_scene" as const,
    scene_id: SCENE,
    equation,
    panels,
    callouts,
    caption,
  });

  const steps: ChemStepDraft[] = [
    {
      id: "ester-lab",
      title: `实验：乙酸、${alcoholName}和浓硫酸共热`,
      narration: `在试管中加入${alcoholName}、浓硫酸和乙酸，加热；产生的蒸气通到饱和碳酸钠溶液的液面上方。液面上出现一层透明的油状液体，并闻到香味——生成了${esterName}。浓硫酸在这里是催化剂，也是吸水剂。`,
      scene: scene([
        molecules(0, { arrows: false }),
        cards([
          { id: "seen", heading: "现象", lines: ["饱和 Na_2CO_3 溶液液面上", "出现透明油状液体，有香味"], tone: "secondary" },
          { id: "acid", heading: "浓硫酸的作用", lines: ["催化剂、吸水剂"], tone: "primary" },
          { id: "carbonate", heading: "饱和 Na_2CO_3 溶液的作用", lines: [`中和乙酸、溶解${alcoholName}`, "降低酯的溶解度，便于分层"], tone: "primary" },
        ]),
      ], "宏观：生成有香味的油状液体；微观：两个分子怎样连在一起？"),
      questions: [
        { question: "这个实验里看到了什么？", answer: `饱和碳酸钠溶液的液面上出现一层透明的油状液体，并有香味，说明生成了难溶于水、密度比水小的${esterName}。` },
        { question: "为什么要用饱和碳酸钠溶液承接产物？", answer: "饱和碳酸钠溶液能中和挥发出来的乙酸、溶解挥发出来的醇，同时降低酯在水中的溶解度，使酯与水溶液分层，便于分离。" },
        { question: "怎样检查装置是否规范？", answer: "导管口应在饱和碳酸钠溶液液面上方，不能插入液面以下，以防倒吸；加试剂的顺序是先加醇，再慢慢加浓硫酸，最后加乙酸。" },
      ],
    },
    {
      id: "ester-hypotheses",
      title: "两种可能：谁脱去羟基？",
      narration: `酯化反应生成一分子水，这个水的氧原子来自哪里？有两种可能。甲：酸脱羟基、醇脱氢，断开的是乙酸的碳氧单键和${alcoholName}的氢氧键；乙：酸脱氢、醇脱羟基。两种断法生成的酯和水完全一样，只看产物分不出来。`,
      scene: scene([
        molecules(0, {
          arrows: false,
          bondTones: { "C2-O2": "focus", "O3-H3": "focus", "O2-H2": "primary", "O3-C3": "primary" },
        }),
        cards([
          { id: "a", heading: "假设甲：酸脱羟基、醇脱氢", lines: ["断 C–OH（酸）与 O–H（醇）"], tone: "focus" },
          { id: "b", heading: "假设乙：酸脱氢、醇脱羟基", lines: ["断 O–H（酸）与 C–OH（醇）"], tone: "primary" },
          { id: "same", heading: "难点", lines: ["两种断法产物相同"], tone: "secondary" },
        ]),
      ], "橙色：假设甲断开的键；绿色：假设乙断开的键", [
        { id: "a-bond", target: "mechanism/bond:C2-O2", text: "甲：断 C–O", tone: "focus", prefer: "below" },
        { id: "b-bond", target: "mechanism/bond:O3-C3", text: "乙：断 C–O", tone: "primary", prefer: "above" },
      ]),
      questions: [
        { question: "两种假设分别断开哪两根键？", answer: `假设甲断开乙酸的 C–OH 键和${alcoholName}的 O–H 键；假设乙断开乙酸的 O–H 键和${alcoholName}的 C–OH 键。` },
        { question: "为什么只看产物无法区分？", answer: "两种断法都是“去掉一个 OH 和一个 H 组成水，剩下的部分连成酯”，得到的酯和水在组成上完全相同。" },
        { question: "怎样设计实验区分它们？", answer: "给其中一个氧原子做上记号：用含 ¹⁸O 的醇反应，再测定 ¹⁸O 出现在酯里还是水里。" },
      ],
    },
    {
      id: "ester-tracer",
      title: "¹⁸O 示踪：标记留在了酯里",
      narration: `用氧-18 标记${alcoholName}的氧原子再做实验。测定发现，氧-18 只存在于${esterName}中，${esterName}的相对分子质量是 ${labelledMass} 而不是 ${plainMass}；生成的水仍是普通的水，相对分子质量为 18。这说明假设甲正确：酸脱羟基，醇脱氢。`,
      scene: scene([
        molecules(0, { focus: ["O3"] }),
        cards([
          { id: "result", heading: "测定结果", lines: [`${esterName}：M_r = ${labelledMass}（含 ^{18}O）`, "水：M_r = 18（不含 ^{18}O）"], tone: "focus" },
          { id: "conclusion", heading: "结论", lines: ["酸脱羟基，醇脱氢"], tone: "primary" },
          { id: "next", heading: "下一步", lines: ["H^+ 先加到羰基氧上"], tone: "secondary" },
        ]),
      ], "同位素示踪法：给原子做记号，追踪它去了哪里", [
        { id: "o18", target: "mechanism/O3", text: "^{18}O 标记", tone: "focus", prefer: "above" },
      ]),
      questions: [
        { question: "示踪实验测到了什么？", answer: `¹⁸O 只出现在${esterName}中，酯的相对分子质量为 ${labelledMass}（比普通的 ${plainMass} 大 2）；水的相对分子质量仍是 18。` },
        { question: "为什么这就证明了“酸脱羟基、醇脱氢”？", answer: `若醇脱羟基，${alcoholName}的 ¹⁸O 应随羟基进入水中，水的相对分子质量应为 20；实际 ¹⁸O 留在酯里，说明醇保留了氧、只失去了羟基上的氢。` },
        { question: "怎样自己算这两个相对分子质量？", answer: `${esterName}的分子式为 ${ethanol ? "C₄H₈O₂" : "C₃H₆O₂"}，普通的相对分子质量为 ${plainMass}；把其中一个 ¹⁶O 换成 ¹⁸O，相对分子质量增加 2，变为 ${labelledMass}。` },
      ],
    },
    {
      id: "ester-protonate",
      title: "机理①：H⁺ 加到羰基氧上",
      narration: "进入机理。浓硫酸提供的氢离子先与羰基氧结合，羰基氧带上正电荷，与它相连的碳原子因此更缺电子，更容易被进攻。两个弯箭头预告下一步：醇的氧原子用它的孤电子对进攻这个碳，同时碳氧双键中的一对电子移到氧上。",
      scene: scene([
        molecules(1, { focus: ["O1", "C2"] }),
        cards([
          { id: "step", heading: "质子化", lines: ["C=O + H^+ → C=O^+–H", "羰基碳更缺电子"], tone: "focus" },
          { id: "arrow", heading: "弯箭头", lines: ["从电子来源指向电子去处"], tone: "secondary" },
        ]),
      ], "催化剂 H⁺ 让羰基碳变得“更缺电子”"),
      questions: [
        { question: "这一步哪根键形成了？", answer: "氢离子与羰基氧之间形成了一根新的 O–H 键，羰基氧因此带正电荷。" },
        { question: "为什么先要质子化？", answer: "羰基氧带正电后会更强地吸引 C=O 上的电子，使羰基碳更缺电子，醇分子里氧原子的孤电子对就更容易进攻它。" },
        { question: "怎样检查电荷守恒？", answer: "反应前正电荷在 H⁺ 上，反应后在羰基氧上，体系总电荷始终是 +1。" },
      ],
    },
    {
      id: "ester-attack",
      title: "机理②：醇的 ¹⁸O 进攻羰基碳",
      narration: `${alcoholName}的氧-18 进攻羰基碳，形成一根新的碳氧键；碳氧双键中的一对电子转移到氧上。这样得到一个四面体中间体，碳原子连着四个基团，带正电的是刚连上去的氧-18。`,
      scene: scene([
        molecules(2, { focus: ["O3", "C2"] }),
        cards([
          { id: "step", heading: "加成", lines: [`^{18}O–C 键形成`, "C=O 变为 C–OH"], tone: "focus" },
          { id: "shape", heading: "四面体中间体", lines: ["C 原子连 4 个基团", "^{18}O 带正电"], tone: "primary" },
        ]),
      ], "¹⁸O 从这一步起连在碳上，一直留到酯里"),
      questions: [
        { question: "这一步新形成了哪根键？", answer: `${alcoholName}中带 ¹⁸O 标记的氧原子与羰基碳形成了新的 C–O 单键，原来的碳氧双键变成了单键。` },
        { question: "为什么叫“四面体中间体”？", answer: "中心碳原子此时连着甲基、两个羟基和 –¹⁸O–R 共四个基团，空间构型接近四面体；它不稳定，会继续反应。" },
        { question: "怎样确认原子没有丢失？", answer: "数一数：所有原子都还在，碳 4 个（甲醇时 3 个），氧 3 个（其中 1 个 ¹⁸O），总电荷 +1。" },
      ],
    },
    {
      id: "ester-shuttle",
      title: "机理③：质子转移到酸的羟基上",
      narration: "带正电的氧-18 把它上面的氢以质子形式交给乙酸原来的羟基氧。这样原来的羟基变成了带正电的水合结构，成为一个很容易离开的基团——醇失去的正是这个氢。",
      scene: scene([
        molecules(3, { focus: ["H3", "O2"] }),
        cards([
          { id: "step", heading: "质子转移", lines: ["^{18}O–H 的 H 转到 O–H 上", "–OH 变成 –OH_2^+"], tone: "focus" },
          { id: "why", heading: "为什么", lines: ["–OH_2^+ 是好的离去基团"], tone: "secondary" },
        ]),
      ], "醇脱氢：失去的正是 ¹⁸O 上的这个 H"),
      questions: [
        { question: "哪个原子换了位置？", answer: `原来连在${alcoholName}氧-18 上的氢，转移到了乙酸原来的羟基氧上。` },
        { question: "为什么要把质子转过去？", answer: "–OH 很难直接离开，变成 –OH₂⁺ 之后就能以中性水分子的形式离开，反应才能继续。" },
        { question: "怎样核对“醇脱氢”？", answer: `${alcoholName}分子失去的只有羟基上的这个氢原子，¹⁸O 仍连在碳上。` },
      ],
    },
    {
      id: "ester-leave",
      title: "机理④：C–O 断开，脱去一分子水",
      narration: "碳和带正电的氧之间的键断开，乙酸原来的羟基氧带着两个氢离开，成为一分子水；碳氧双键重新形成。这就是“酸脱羟基”——水分子中的氧来自乙酸，不是来自醇。",
      scene: scene([
        molecules(4, { focus: ["O2", "H2", "H3"] }),
        cards([
          { id: "step", heading: "消除", lines: ["C–O 键断裂，H_2O 离开", "C=O 重新形成"], tone: "focus" },
          { id: "why", heading: "酸脱羟基", lines: ["水中的 O 来自乙酸的 –OH"], tone: "primary" },
        ]),
      ], "水分子里的氧不是 ¹⁸O：它来自乙酸"),
      questions: [
        { question: "离开的水分子由哪些原子组成？", answer: "乙酸原来羟基上的氧和氢，加上刚从醇转移过来的那个氢。" },
        { question: "为什么这就是“酸脱羟基”？", answer: "离开的氧原子正是乙酸羟基的氧，相当于乙酸失去 –OH、醇失去 –H，二者组合成水。" },
        { question: "怎样检查这一步的电荷？", answer: "离开的是中性水分子；正电荷回到羰基氧上，体系总电荷仍是 +1。" },
      ],
    },
    {
      id: "ester-regenerate",
      title: "机理⑤：H⁺ 离开，催化剂再生",
      narration: `最后羰基氧上的氢以质子形式离开，得到${esterName}，氢离子重新生成——它参与了反应，但反应前后没有被消耗，所以是催化剂。数一数原子：碳、氢、氧和氧-18 的个数，反应前后一个都不少。`,
      scene: scene([
        molecules(5, { focus: ["O3"] }),
        cards([
          { id: "ledger", heading: "原子账本（反应前 = 反应后）", lines: [ethanol ? "C 4 · H 11 · O 2 · ^{18}O 1" : "C 3 · H 9 · O 2 · ^{18}O 1", "总电荷 +1（H^+）"], tone: "primary" },
          { id: "cat", heading: "催化剂", lines: ["H^+ 参与反应，最后再生"], tone: "focus" },
        ]),
      ], "机理的每一步都保持原子守恒与电荷守恒"),
      questions: [
        { question: "最后得到了哪些粒子？", answer: `${esterName}（含 ¹⁸O）、一分子普通的水，以及重新生成的氢离子。` },
        { question: "为什么说 H⁺ 是催化剂？", answer: "它在第一步被消耗、在最后一步重新生成，参与了反应历程、改变了反应速率，但反应前后的量不变。" },
        { question: "怎样核对原子账本？", answer: ethanol ? "反应前：乙酸 C₂H₄O₂ + 乙醇 C₂H₆¹⁸O + H⁺；反应后：乙酸乙酯 C₄H₈O¹⁸O + H₂O + H⁺。C 4、H 11、O 2、¹⁸O 1，两边相同。" : "反应前：乙酸 C₂H₄O₂ + 甲醇 CH₄¹⁸O + H⁺；反应后：乙酸甲酯 C₃H₆O¹⁸O + H₂O + H⁺。C 3、H 9、O 2、¹⁸O 1，两边相同。" },
      ],
    },
    {
      id: "ester-reversible",
      title: "可逆：怎样提高酯的产率",
      narration: `酯化反应是可逆反应，${esterName}也能水解回到酸和醇。要提高产率，就让平衡向右移动：浓硫酸吸收生成的水，加热把${esterName}及时蒸出，也可以适当加过量的${alcoholName}。转动分子模型，看看这个酯的空间结构。`,
      scene: scene([
        molecules(5, { arrows: false, yaw: 48, focus: ["O3"] }),
        cards([
          { id: "rev", heading: "可逆反应", lines: ["酯化 ⇌ 水解"], tone: "secondary" },
          { id: "yield", heading: "提高产率", lines: ["浓硫酸吸水", "及时蒸出酯", "适当增加醇的用量"], tone: "primary" },
        ]),
      ], "换个角度看同一个分子：试试右侧的“模型”和“醇”"),
      questions: [
        { question: "为什么说酯化反应是可逆的？", answer: `${esterName}在酸性条件下能与水反应生成乙酸和${alcoholName}，所以正、逆反应同时存在，最终达到化学平衡。` },
        { question: "为什么浓硫酸能提高产率？", answer: "浓硫酸吸收了生成的水，减小了生成物浓度，使平衡向生成酯的方向移动；同时它也是催化剂，加快反应速率。" },
        { question: "怎样判断改变某个条件能否提高产率？", answer: "看它能否使平衡正向移动：减小生成物浓度（吸水、蒸出酯）、增大反应物浓度（加过量醇）都可以；只加催化剂不能提高平衡产率。" },
      ],
    },
  ];

  return {
    title: `${esterName}的酯化反应机理`,
    summary: "¹⁸O 示踪回答“谁脱羟基”，再逐步动画质子化、加成、质子转移、脱水与催化剂再生，每一步原子与电荷守恒。",
    algorithmId: "chemistry_esterification_mechanism",
    steps,
    controls: [
      { id: "alcohol", label: "醇", value: alcoholName, description: "乙醇或甲醇" },
      { id: "model", label: "模型", value: model === "space_fill" ? "比例模型" : "球棍模型", description: "分子模型的画法" },
    ],
  };
}

export const ESTERIFICATION_GOLD_TEMPLATE = chemistryCase({
  caseId: "esterification-mechanism",
  archetypeId: "chemistry.organic.esterification-o18-mechanism",
  topic: "酯化反应",
  title: "酯化反应 · ¹⁸O 示踪与机理",
  description: "¹⁸O 示踪证明酸脱羟基、醇脱氢，再逐步看质子化、加成、脱水与催化剂再生",
  prompt: "讲解乙酸与乙醇的酯化反应：用 ¹⁸O 示踪实验判断“酸脱羟基、醇脱氢”，再用分子模型逐步演示浓硫酸催化下断键、成键的机理，并说明提高产率的方法。",
  defaults: { alcohol: "ethanol", model: "ball_stick" },
  controls: [
    {
      id: "alcohol",
      kind: "select",
      label: "醇",
      description: "换成甲醇：规律不变，产物变为乙酸甲酯",
      resetPlayback: false,
      options: [
        { label: "乙醇", value: "ethanol" },
        { label: "甲醇", value: "methanol" },
      ],
    },
    {
      id: "model",
      kind: "select",
      label: "模型",
      description: "球棍模型看键，比例模型看分子大小",
      resetPlayback: false,
      options: [
        { label: "球棍模型", value: "ball_stick" },
        { label: "比例模型", value: "space_fill" },
      ],
    },
  ],
  requiredCapabilities: ["chemistry_scene", "molecules_3d", "bond_morph", "curly_arrow", "atom_ledger"],
  handsOn: ["ester-tracer", "ester-reversible"],
  expectedFacts: [
    { id: "ester-rule", description: "酸脱羟基、醇脱氢", anyOf: ["酸脱羟基，醇脱氢", "酸脱羟基、醇脱氢"] },
    { id: "ester-tracer", description: "¹⁸O 进入酯，酯的相对分子质量为 90", anyOf: ["90", "¹⁸O 只出现在"] },
    { id: "ester-catalyst", description: "浓硫酸作催化剂和吸水剂", anyOf: ["催化剂", "吸水剂"] },
  ],
  visualInvariants: [{
    id: "ester-mechanism-atoms",
    description: "同一组原子贯穿全部机理步骤，¹⁸O 有标记，键的断开与形成有动画",
    requiredSemanticRoles: ["molecules", "curly_arrow"],
    requiredStateFields: ["atoms", "bonds", "arrows", "isotope"],
  }],
  objective: "用同位素示踪证据确定断键方式，并在分子层面理解酸催化酯化的加成–消除机理与原子守恒。",
  build: buildEsterificationLesson,
  posterStepIndex: 4,
});
