import type {
  BioProcessSceneSnapshot,
  CodeTraceSceneSnapshot,
  GeoMapSceneSnapshot,
  MathPlotSnapshot,
  MetaStep,
  PhasePortraitSceneSnapshot,
  PlaybookScript,
  ReactionSceneSnapshot,
} from "../../../features/playbook/engine/types";
import { compileBioProcessLayout } from "../../../features/playbook/engine/kits/biology/biologyLayouts";
import { compileReactionLayout } from "../../../features/playbook/engine/kits/chemistry/chemistryLayouts";
import { compileGeoMapLayout } from "../../../features/playbook/engine/kits/geography/geographyLayouts";
import type {
  TemplatePreviewFollowups,
  TemplatePreviewParams,
  TemplatePreviewQuestion,
} from "../templatePreviewCases";
import { applyNarrationTimeline, posterFrameForStep } from "../narrationTiming";
import {
  defineStandaloneGoldTemplate,
  type GoldTemplateManifest,
} from "./manifest";

const FPS = 30;
const STEP_FRAMES = 90;

function sceneStep<T extends MetaStep["snapshot"]>(
  index: number,
  stepId: string,
  title: string,
  narration: string,
  snapshot: T,
): MetaStep<T> {
  return {
    step_id: stepId,
    end_frame: (index + 1) * STEP_FRAMES,
    title,
    voiceover_text: narration,
    snapshot,
    tokens: [],
  };
}

function playbook(
  domain: string,
  title: string,
  summary: string,
  algorithmId: string,
  steps: MetaStep[],
  controls: PlaybookScript["parameter_controls"] = [],
): PlaybookScript {
  const timed = applyNarrationTimeline(steps, FPS);
  return {
    schema_version: "2.0.0",
    fps: FPS,
    total_frames: timed.at(-1)?.end_frame ?? 0,
    domain,
    title,
    summary,
    steps: timed,
    parameter_controls: controls,
    algorithm_id: algorithmId,
    initial_data: {
      scene_blueprint: [algorithmId],
      teaching_phases: ["观察", "机制或推理", "验证", "总结"],
    },
  };
}

function followups(
  script: PlaybookScript,
  mechanism: (step: MetaStep) => string,
  transfer: string,
): TemplatePreviewFollowups {
  return Object.fromEntries(script.steps.map((step) => [
    step.step_id,
    [
      {
        id: `${step.step_id}-observe`,
        question: "这一幕先观察什么？",
        answer: step.voiceover_text,
      },
      {
        id: `${step.step_id}-reason`,
        question: "这个变化为什么成立？",
        answer: mechanism(step),
      },
      {
        id: `${step.step_id}-transfer`,
        question: "怎样自己检查这一幕？",
        answer: transfer,
      },
    ] satisfies TemplatePreviewQuestion[],
  ]));
}

function stringParam(
  params: TemplatePreviewParams,
  key: string,
  allowed: readonly string[],
  fallback: string,
): string {
  const value = String(params[key] ?? "");
  return allowed.includes(value) ? value : fallback;
}

// ---------------------------------------------------------------------------
// Code · Two Sum with a hash table

const TWO_SUM_NUMS = [2, 7, 11, 15] as const;
const TWO_SUM_TARGETS = [9, 18, 26] as const;
const TWO_SUM_CODE = [
  "def two_sum(nums, target):",
  "    seen = {}",
  "    for i, n in enumerate(nums):",
  "        complement = target - n",
  "        if complement in seen:",
  "            return [seen[complement], i]",
  "        seen[n] = i",
  "    return []",
];

export interface TwoSumTraceEntry {
  readonly index: number;
  readonly value: number;
  readonly complement: number;
  readonly seenBefore: Readonly<Record<number, number>>;
  readonly matchedIndex: number | null;
}

export function traceTwoSum(
  nums: readonly number[],
  target: number,
): readonly TwoSumTraceEntry[] {
  const seen = new Map<number, number>();
  const trace: TwoSumTraceEntry[] = [];
  for (const [index, value] of nums.entries()) {
    const complement = target - value;
    const matchedIndex = seen.get(complement) ?? null;
    trace.push({
      index,
      value,
      complement,
      seenBefore: Object.fromEntries(seen),
      matchedIndex,
    });
    if (matchedIndex != null) break;
    seen.set(value, index);
  }
  return trace;
}

function hashState(entry?: TwoSumTraceEntry): string {
  if (!entry) return "{}";
  return `{${Object.entries(entry.seenBefore)
    .map(([value, index]) => `${value}: ${index}`)
    .join(", ")}}`;
}

function twoSumSnapshot(
  title: string,
  activeLine: number,
  entry: TwoSumTraceEntry | undefined,
  caption: string,
  result = "尚未返回",
): CodeTraceSceneSnapshot {
  const index = entry?.index ?? 0;
  return {
    kind: "code_trace_scene",
    pack_id: "algorithm-code-basic",
    language: "python",
    lines: TWO_SUM_CODE,
    active_lines: [activeLine],
    active_line: activeLine,
    array_values: TWO_SUM_NUMS.map(String),
    active_indices: entry ? [entry.index] : [],
    search_range: [0, index],
    pointers: entry ? [{ id: "i", label: "i", index: entry.index }] : [],
    variables: {
      target: title,
      i: entry ? String(entry.index) : "—",
      n: entry ? String(entry.value) : "—",
      complement: entry ? String(entry.complement) : "—",
      seen: hashState(entry),
      result,
    },
    caption,
  };
}

export function buildTwoSumGoldPlaybook(params: TemplatePreviewParams): PlaybookScript {
  const target = Number(stringParam(params, "target", TWO_SUM_TARGETS.map(String), "9"));
  const trace = traceTwoSum(TWO_SUM_NUMS, target);
  const match = trace.find((entry) => entry.matchedIndex != null);
  if (!match || match.matchedIndex == null) {
    throw new Error(`Gold Two Sum target ${target} must have a deterministic pair`);
  }

  const steps: MetaStep[] = [
    sceneStep(
      0,
      "two-sum-question",
      "先明确返回什么",
      `在 nums=[${TWO_SUM_NUMS.join(",")}] 中寻找和为 ${target} 的两个不同下标；输出是下标，不是数值。`,
      twoSumSnapshot(String(target), 0, undefined, "目标：一次扫描中返回两个不同下标。"),
    ),
  ];

  for (const entry of trace) {
    const found = entry.matchedIndex != null;
    const narration = found
      ? `扫描到 i=${entry.index}、n=${entry.value}，补数 ${entry.complement} 已在 seen 中，位置是 ${entry.matchedIndex}。`
      : `扫描到 i=${entry.index}、n=${entry.value}，需要补数 ${entry.complement}；seen 中没有它，所以先记录 ${entry.value}→${entry.index}。`;
    steps.push(sceneStep(
      steps.length,
      `two-sum-scan-${entry.index}`,
      found ? "命中已经见过的补数" : `扫描第 ${entry.index + 1} 个数`,
      narration,
      twoSumSnapshot(
        String(target),
        found ? 5 : 6,
        entry,
        found ? "先查补数，再返回旧下标与当前下标。" : "查找失败后才写入 seen，避免同一元素重复使用。",
        found ? `[${entry.matchedIndex}, ${entry.index}]` : "尚未返回",
      ),
    ));
  }

  const result = `[${match.matchedIndex}, ${match.index}]`;
  steps.push(
    sceneStep(
      steps.length,
      "two-sum-invariant",
      "解释哈希表不变量",
      "进入第 i 次循环时，seen 只保存 i 之前的数值到下标映射；因此命中补数时，两个下标天然不同。",
      twoSumSnapshot(String(target), 4, match, "不变量：seen 只包含已经扫描过的元素。", result),
    ),
    sceneStep(
      steps.length + 1,
      "two-sum-verify",
      "代回原数组验证",
      `nums[${match.matchedIndex}]+nums[${match.index}]=${TWO_SUM_NUMS[match.matchedIndex]}+${TWO_SUM_NUMS[match.index]}=${target}，所以返回 ${result} 正确。`,
      twoSumSnapshot(String(target), 5, match, `验证数值和等于目标 ${target}，且 ${match.matchedIndex}≠${match.index}。`, result),
    ),
    sceneStep(
      steps.length + 2,
      "two-sum-summary",
      "总结复杂度与适用条件",
      "每个元素只扫描一次，哈希查找平均为 O(1)，所以时间复杂度平均 O(n)，额外空间 O(n)。",
      twoSumSnapshot(String(target), 6, match, "查补数 → 未命中则记录 → 命中则验证并返回。", result),
    ),
  );

  return playbook(
    "code",
    "两数之和 · 哈希表",
    "用一次扫描建立 seen 不变量，并代回原数组验证返回下标。",
    "code_two_sum_hash_table",
    steps,
    [{ id: "target", label: "目标和 target", value: String(target), description: "可选 9、18 或 26；均有唯一演示解" }],
  );
}

// ---------------------------------------------------------------------------
// Chemistry · Zinc / copper ion redox

type RedoxStage = "observe" | "states" | "oxidation" | "reduction" | "transfer" | "verify";

function redoxSnapshot(stage: RedoxStage, caption: string): ReactionSceneSnapshot {
  const showFlow = stage === "transfer" || stage === "verify";
  const formulaByStage: Record<RedoxStage, string> = {
    observe: "Zn + Cu²⁺ → Zn²⁺ + Cu",
    states: "Zn⁰ → Zn²⁺ ; Cu²⁺ → Cu⁰",
    oxidation: "Zn → Zn²⁺ + 2e⁻",
    reduction: "Cu²⁺ + 2e⁻ → Cu",
    transfer: "Zn + Cu²⁺ → Zn²⁺ + Cu",
    verify: "Zn + CuSO₄ → ZnSO₄ + Cu",
  };
  const calloutsByStage: Record<RedoxStage, Array<{ id: string; targetId: string; label: string; side: "top" | "bottom" | "left" | "right" }>> = {
    observe: [{ id: "observe-change", targetId: "main-arrow", label: "置换反应", side: "top" }],
    states: [
      { id: "zn-state", targetId: "zn", label: "0 → +2，失电子", side: "top" },
      { id: "cu-state", targetId: "cu2", label: "+2 → 0，得电子", side: "top" },
    ],
    oxidation: [{ id: "zn-oxidized", targetId: "zn", label: "还原剂 Zn 被氧化", side: "top" }],
    reduction: [{ id: "cu-reduced", targetId: "cu2", label: "氧化剂 Cu²⁺ 被还原", side: "top" }],
    transfer: [{ id: "two-electrons", targetId: "main-arrow", label: "转移 2e⁻", side: "top" }],
    verify: [{ id: "sulfate", targetId: "main-arrow", label: "SO₄²⁻ 是旁观离子", side: "top" }],
  };
  return compileReactionLayout({
    packId: "chemistry-basic",
    reactionId: "zinc_copper_redox",
    reactants: [
      { id: "zn", formulaLatex: "Zn", label: "锌，0价", x: 18, y: 51 },
      { id: "cu2", formulaLatex: "Cu²⁺", label: "铜离子，+2价", x: 38, y: 51 },
    ],
    products: [
      { id: "zn2", formulaLatex: "Zn²⁺", label: "锌离子，+2价", x: 72, y: 51 },
      { id: "cu", formulaLatex: "Cu", label: "铜，0价", x: 88, y: 51 },
    ],
    arrows: [{ id: "main-arrow", semanticRole: "reaction_arrow", from: [47, 51], to: [63, 51], label: "发生氧化还原" }],
    electronFlows: showFlow
      ? [{ id: "zn-to-cu", semanticRole: "electron_flow", from: [21, 42], to: [36, 42], label: "2e⁻" }]
      : [],
    callouts: calloutsByStage[stage],
    formulaLatex: formulaByStage[stage],
    caption,
  });
}

export function buildRedoxGoldPlaybook(): PlaybookScript {
  const steps = [
    sceneStep(0, "redox-observe", "观察反应前后", "锌进入溶液，铜离子转化为铜单质；需要解释的是谁失去电子、谁得到电子。", redoxSnapshot("observe", "先把可观察变化对应到粒子 Zn、Cu²⁺、Zn²⁺、Cu。")),
    sceneStep(1, "redox-oxidation-states", "标出氧化数变化", "Zn 从 0 价升到 +2 价，Cu 从 +2 价降到 0 价；氧化数一升一降。", redoxSnapshot("states", "氧化数升高对应氧化，降低对应还原。")),
    sceneStep(2, "redox-oxidation-half", "写出氧化半反应", "Zn 失去 2 个电子形成 Zn²⁺：Zn → Zn²⁺ + 2e⁻，因此 Zn 是还原剂。", redoxSnapshot("oxidation", "Zn → Zn²⁺ + 2e⁻。")),
    sceneStep(3, "redox-reduction-half", "写出还原半反应", "Cu²⁺ 得到 2 个电子形成 Cu：Cu²⁺ + 2e⁻ → Cu，因此 Cu²⁺ 是氧化剂。", redoxSnapshot("reduction", "Cu²⁺ + 2e⁻ → Cu。")),
    sceneStep(4, "redox-electron-transfer", "配平并连接电子转移", "两个半反应的电子数都是 2，可以直接相加消去电子，得到净离子方程式 Zn + Cu²⁺ → Zn²⁺ + Cu。", redoxSnapshot("transfer", "电子由 Zn 转移给 Cu²⁺，转移数为 2。")),
    sceneStep(5, "redox-verify", "验证守恒并还原完整方程", "净离子方程两侧 Zn、Cu 原子各一个，总电荷都为 +2；补回旁观离子 SO₄²⁻，得到 Zn + CuSO₄ → ZnSO₄ + Cu。", redoxSnapshot("verify", "原子守恒、电荷守恒，SO₄²⁻ 在反应前后不变。")),
  ];
  return playbook(
    "chemistry",
    "氧化还原 · 电子转移",
    "从氧化数变化出发，用半反应配平电子并验证原子与电荷守恒。",
    "chemistry_zinc_copper_redox",
    steps,
  );
}

// ---------------------------------------------------------------------------
// Biology · DNA replication (schematic process renderer)

type DnaFocus = "both" | "leading" | "lagging";
type DnaStage = "question" | "unzip" | "pair" | "leading" | "lagging" | "verify";

function dnaSnapshot(stage: DnaStage, focus: DnaFocus, caption: string): BioProcessSceneSnapshot {
  const stageCallouts: Record<DnaStage, Array<{ id: string; targetId: string; label: string; side: "top" | "bottom" | "left" | "right" }>> = {
    question: [{ id: "parent-callout", targetId: "parent", label: "亲代双链 DNA", side: "top" }],
    unzip: [{ id: "fork-callout", targetId: "fork", label: "两条亲代链分开", side: "top" }],
    pair: [{ id: "pair-callout", targetId: "fork", label: "A-T、G-C 互补配对", side: "top" }],
    leading: [{ id: "leading-callout", targetId: "leading", label: "前导链连续合成，方向 5′→3′", side: "top" }],
    lagging: [{ id: "lagging-callout", targetId: "lagging", label: "后随链由冈崎片段连接", side: "bottom" }],
    verify: [
      { id: "daughter-a", targetId: "leading", label: "旧链 + 新链", side: "top" },
      { id: "daughter-b", targetId: "lagging", label: "旧链 + 新链", side: "bottom" },
    ],
  };
  const focusCallout = focus === "both" || stage === "verify"
    ? []
    : [{
        id: `${focus}-focus`,
        targetId: focus,
        label: focus === "leading" ? "当前聚焦前导链" : "当前聚焦后随链",
        side: focus === "leading" ? "right" as const : "left" as const,
      }];
  return compileBioProcessLayout({
    packId: "biology-basic",
    processId: "dna_replication",
    steps: [
      { id: "parent", semanticRole: "dna", label: "亲代 DNA", x: 15, y: 49, width: 13, height: 34, assetId: "dna-helix" },
      { id: "fork", semanticRole: "process_step", label: "复制叉", x: 42, y: 49, width: 20, height: 20, assetId: "replication-fork" },
      { id: "leading", semanticRole: "dna", label: "子代 DNA A", x: 68, y: 34, width: 13, height: 28, assetId: "dna-helix" },
      { id: "lagging", semanticRole: "dna", label: "子代 DNA B", x: 68, y: 65, width: 13, height: 28, assetId: "dna-helix" },
    ],
    connections: [
      { id: "parent-to-fork", from: "parent", to: "fork", semanticRole: "flow_arrow", label: "解旋" },
      { id: "fork-to-leading", from: "fork", to: "leading", semanticRole: "flow_arrow", label: "连续合成" },
      { id: "fork-to-lagging", from: "fork", to: "lagging", semanticRole: "flow_arrow", label: "片段合成" },
    ],
    callouts: [...stageCallouts[stage], ...focusCallout],
    caption,
  });
}

export function buildDnaReplicationGoldPlaybook(params: TemplatePreviewParams): PlaybookScript {
  const focus = stringParam(params, "strandFocus", ["both", "leading", "lagging"], "both") as DnaFocus;
  const steps = [
    sceneStep(0, "dna-question", "提出复制问题", "一个亲代 DNA 如何得到两个序列一致的子代 DNA，并让遗传信息保持稳定？", dnaSnapshot("question", focus, "本画面是过程结构示意，不展开到核苷酸级化学结构。")),
    sceneStep(1, "dna-unzip", "解开亲代双链", "解旋使两条亲代链分开；每一条旧链都将作为合成新链的模板。", dnaSnapshot("unzip", focus, "复制叉沿 DNA 推进，亲代双链在局部打开。")),
    sceneStep(2, "dna-base-pairing", "按互补规则配对", "游离核苷酸按 A-T、G-C 的互补规则加入；DNA 聚合酶只能让新链沿 5′→3′ 方向延伸。", dnaSnapshot("pair", focus, "互补配对把模板链的信息传给新链。")),
    sceneStep(3, "dna-leading", "理解前导链连续合成", "在与复制叉推进相容的一侧，新链可以沿 5′→3′ 方向连续延伸，称为前导链。", dnaSnapshot("leading", focus, "前导链连续合成；图中箭头表达过程关系，不代表分子比例。")),
    sceneStep(4, "dna-lagging", "理解后随链分段合成", "另一侧仍必须按 5′→3′ 合成，只能形成多个冈崎片段，再由 DNA 连接酶连成连续新链。", dnaSnapshot("lagging", focus, "后随链分段合成，冈崎片段最终被连接。")),
    sceneStep(5, "dna-verify", "验证半保留复制", "两个子代 DNA 都由一条亲代旧链和一条新合成链组成，这就是半保留复制；互补配对保证序列可核对。", dnaSnapshot("verify", focus, "结果：两条子代 DNA 各保留一条亲代链。")),
  ];
  return playbook(
    "biology",
    "DNA 复制",
    "用复制叉结构解释互补配对、5′→3′ 合成、前导链与后随链，并验证半保留结果。",
    "biology_dna_replication_schematic",
    steps,
    [{ id: "strandFocus", label: "关注链", value: focus, description: "同时观察、前导链或后随链" }],
  );
}

// ---------------------------------------------------------------------------
// Geography · East Asian monsoon

type MonsoonSeason = "summer" | "winter";

export interface MonsoonState {
  readonly season: MonsoonSeason;
  readonly landPressure: "high" | "low";
  readonly oceanPressure: "high" | "low";
  readonly flowFrom: readonly [number, number];
  readonly flowTo: readonly [number, number];
  readonly flowLabel: string;
  readonly moisture: "moist" | "dry";
}

export function monsoonState(season: MonsoonSeason): MonsoonState {
  return season === "summer"
    ? {
        season,
        landPressure: "low",
        oceanPressure: "high",
        flowFrom: [76, 64],
        flowTo: [38, 35],
        flowLabel: "夏季：海洋 → 陆地",
        moisture: "moist",
      }
    : {
        season,
        landPressure: "high",
        oceanPressure: "low",
        flowFrom: [38, 35],
        flowTo: [76, 64],
        flowLabel: "冬季：陆地 → 海洋",
        moisture: "dry",
      };
}

function monsoonSnapshot(
  season: MonsoonSeason,
  caption: string,
  flowLabel?: string,
): GeoMapSceneSnapshot {
  const state = monsoonState(season);
  const snapshot = compileGeoMapLayout({
    packId: "geography-earth-basic",
    mapRegion: "east_asia",
    flows: [{
      id: `${season}-monsoon`,
      semanticRole: "monsoon_flow",
      from: [...state.flowFrom],
      to: [...state.flowTo],
      label: flowLabel ?? state.flowLabel,
      strength: season === "summer" ? 1.15 : 1,
    }],
    pressureCenters: [
      { id: "land-pressure", kind: state.landPressure, x: 38, y: 35, label: `大陆${state.landPressure === "high" ? "高压" : "低压"}` },
      { id: "ocean-pressure", kind: state.oceanPressure, x: 76, y: 64, label: `海洋${state.oceanPressure === "high" ? "高压" : "低压"}` },
    ],
    particlePreset: season === "summer" ? "moisture_particles" : "wind_stream",
    caption,
  });
  const mapLayer = snapshot.layers.find((layer) => layer.id === "map");
  const coastlineLayer = snapshot.layers.find((layer) => layer.id === "coastline");
  return {
    ...snapshot,
    layers: [
      ...(mapLayer ? [{ ...mapLayer, id: "land", semantic_role: "land", label: "东亚大陆" }] : []),
      ...(coastlineLayer ? [{ ...coastlineLayer, label: "海岸线" }] : []),
    ],
  };
}

export function buildMonsoonGoldPlaybook(params: TemplatePreviewParams): PlaybookScript {
  const selected = stringParam(params, "season", ["summer", "winter"], "summer") as MonsoonSeason;
  const selectedLabel = selected === "summer" ? "夏季" : "冬季";
  const selectedState = monsoonState(selected);
  const steps = [
    sceneStep(0, "monsoon-question", "先定位大陆与海洋", "东亚位于世界最大大陆和最大海洋之间。问题是：为什么近地面风向会随季节反转？", monsoonSnapshot("summer", "先固定东亚大陆与西北太平洋的空间位置。", "海陆位置")),
    sceneStep(1, "monsoon-summer-observe", "观察夏季气压与风向", "夏季大陆升温较快，近地面形成相对低压；海洋相对高压，暖湿气流由海洋吹向大陆。", monsoonSnapshot("summer", "夏季风把海洋水汽输送到东亚大陆。")),
    sceneStep(2, "monsoon-summer-mechanism", "解释夏季风机制", "海陆热力差异建立水平气压梯度，空气从高压区流向低压区，并在地转偏向力作用下形成东亚夏季偏南风。", monsoonSnapshot("summer", "热力差异 → 气压差 → 近地面季风。", "暖湿偏南风")),
    sceneStep(3, "monsoon-winter-contrast", "切换到冬季作对照", "冬季大陆降温较快，形成强高压；海洋相对低压，冷空气由大陆吹向海洋，盛行偏北风。", monsoonSnapshot("winter", "冬季风向与夏季相反，东亚大陆多受冷干空气影响。")),
    sceneStep(4, "monsoon-rainfall", "把风向连接到水汽与降水", "夏季海洋到陆地的气流水汽较多，有利于暖季降水；冬季大陆来源气流通常较干，但越过海面后局地仍可能增湿降雪。", monsoonSnapshot("summer", "风向决定水汽来源，但地形和海面路径会造成区域差异。", "水汽输送")),
    sceneStep(5, "monsoon-verify", `验证当前选择：${selectedLabel}`, `当前选择${selectedLabel}：大陆为${selectedState.landPressure === "high" ? "高" : "低"}压、海洋为${selectedState.oceanPressure === "high" ? "高" : "低"}压，近地面风从${selected === "summer" ? "海洋吹向陆地" : "陆地吹向海洋"}，与海陆热力差异一致。`, monsoonSnapshot(selected, "用气压配置、风向和水汽来源三项共同检查季节判断。", selected === "summer" ? "海 → 陆" : "陆 → 海")),
  ];
  return playbook(
    "geography",
    "东亚季风",
    "比较冬夏海陆热力差异，推导气压配置、风向反转和水汽影响。",
    "geography_east_asia_monsoon",
    steps,
    [{ id: "season", label: "验证季节", value: selected, description: "选择夏季或冬季，重建最后的验证画面" }],
  );
}

// ---------------------------------------------------------------------------
// Ecology · Logistic population growth (university pilot)

function boundedNumber(
  params: TemplatePreviewParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(params[key]);
  const finite = Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, finite));
}

function fixed(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * Carlson (1913) hourly yeast-culture measurements, t = 0..18 h — the classic
 * dataset Pearl (1927) fitted with the logistic curve. The public case keeps
 * the observations fixed; r/K/N0 are the teacher's fitting knobs.
 */
const CARLSON_YEAST: readonly number[] = [
  9.6, 18.3, 29.0, 47.2, 71.1, 119.1, 174.6, 257.3, 350.7, 441.0,
  513.3, 559.7, 594.8, 629.4, 640.8, 651.1, 655.9, 659.6, 661.8,
];

/** Least-squares exponential fit `a·e^{b·t}` over the first `count` observations. */
function fitExponentialHead(data: readonly number[], count: number): { a: number; b: number } {
  const head = data.slice(0, count).map((value, hour) => [hour, Math.log(value)] as const);
  const tMean = head.reduce((sum, [t]) => sum + t, 0) / head.length;
  const lnMean = head.reduce((sum, [, ln]) => sum + ln, 0) / head.length;
  const b = head.reduce((sum, [t, ln]) => sum + (t - tMean) * (ln - lnMean), 0) /
    head.reduce((sum, [t]) => sum + (t - tMean) ** 2, 0);
  return { a: Math.exp(lnMean - b * tMean), b };
}

const CARLSON_EXP_FIT = fitExponentialHead(CARLSON_YEAST, 5);

/**
 * St. Matthew Island reindeer (Klein 1968, J. Wildl. Manage. 32:350-367),
 * thousands of animals over years since the 1944 introduction.
 */
const ST_MATTHEW_REINDEER = [
  { x: 0, y: 0.029, label: "29" },
  { x: 13, y: 1.35, label: "1350" },
  { x: 19, y: 6, label: "6000" },
  { x: 22, y: 0.042, label: "42" },
] as const;

/** Retrospective logistic "prediction" through the 1944/1957 counts with K guessed at 3,000. */
const ST_MATTHEW_GUESS_K = 3;
const ST_MATTHEW_GUESS_G = (ST_MATTHEW_GUESS_K - 0.029) / 0.029;
const ST_MATTHEW_GUESS_R =
  Math.log((ST_MATTHEW_GUESS_G * 1.35) / (ST_MATTHEW_GUESS_K - 1.35)) / 13;

export function buildLogisticGrowthGoldPlaybook(params: TemplatePreviewParams): PlaybookScript {
  const r = boundedNumber(params, "r", 0.55, 0.3, 0.9);
  const capacity = boundedNumber(params, "K", 663, 400, 900);
  const n0 = boundedNumber(params, "N0", 9.6, 4, 30);
  const effort = boundedNumber(params, "E", 0, 0, 0.9);
  // N0 <= 30 << K/2 keeps G > 1, so the inflection stays at t >= 0.
  const growthGap = (capacity - n0) / n0;
  const tInflection = Math.log(growthGap) / r;
  const maxRate = (r * capacity) / 4;
  // The observation window is fixed by the data; harvest steps get a longer run-out.
  const dataXMax = 19;
  const harvestXMax = 30;
  const yTop = Math.max(capacity * 1.15, 720);
  const observations = CARLSON_YEAST.map((value, hour) => ({
    x: hour,
    y: value,
    label: hour === 0 || hour === CARLSON_YEAST.length - 1 ? fixed(value, 1) : null,
    emphasis: "primary",
    semantic_role: "observed_population",
  }));
  const logisticCurve = {
    expression: `${fixed(capacity, 2)}/(1+${fixed(growthGap, 4)}*exp(-${fixed(r, 4)}*x))`,
    label: "Logistic",
    emphasis: "primary" as const,
    semantic_role: "population_curve",
  };
  const capacityLine = {
    expression: `${fixed(capacity, 2)}`,
    label: `K=${fixed(capacity)}`,
    emphasis: "secondary" as const,
    semantic_role: "carrying_capacity",
  };
  const exponentialCurve = {
    expression: `${fixed(CARLSON_EXP_FIT.a, 2)}*exp(${fixed(CARLSON_EXP_FIT.b, 4)}*x)`,
    label: "指数外推",
    emphasis: "secondary" as const,
    semantic_role: "exponential_reference",
  };
  // Constant-effort harvest keeps the model analytic: dN/dt = rN(1-N/K) - EN
  // folds into a logistic with r_eff = r-E and K_eff = K(1-E/r); past E = r the
  // exact solution still has closed form and decays to zero.
  const effectiveRate = r - effort;
  const effectiveCapacity = capacity * (1 - effort / r);
  const harvestedCurve = (() => {
    if (effort < 1e-9) return { ...logisticCurve, label: "无捕捞" };
    if (effectiveRate > 1e-9) {
      const gap = (effectiveCapacity - n0) / n0;
      return {
        expression: `${fixed(effectiveCapacity, 3)}/(1+${fixed(gap, 4)}*exp(-${fixed(effectiveRate, 4)}*x))`,
        label: `捕捞 E=${fixed(effort, 3)}`,
        emphasis: "primary" as const,
        semantic_role: "harvested_population",
      };
    }
    if (Math.abs(effectiveRate) <= 1e-9) {
      return {
        expression: `${fixed(n0, 3)}/(1+${fixed((r * n0) / capacity, 5)}*x)`,
        label: `捕捞 E=${fixed(effort, 3)}`,
        emphasis: "primary" as const,
        semantic_role: "harvested_population",
      };
    }
    const decay = effort - r;
    const crowd = r / capacity;
    return {
      expression: `${fixed(decay * n0, 4)}*exp(-${fixed(decay, 4)}*x)/(${fixed(decay, 4)}+${fixed(crowd * n0, 5)}*(1-exp(-${fixed(decay, 4)}*x)))`,
      label: `捕捞 E=${fixed(effort, 3)}`,
      emphasis: "primary" as const,
      semantic_role: "population_collapse",
    };
  })();
  const yieldCurve = {
    expression: `${fixed(capacity, 2)}*x*(1-x/${fixed(r, 4)})`,
    label: "Y(E)",
    emphasis: "primary" as const,
    semantic_role: "sustainable_yield",
  };
  const stMatthewPrediction = {
    expression: `${ST_MATTHEW_GUESS_K}/(1+${fixed(ST_MATTHEW_GUESS_G, 3)}*exp(-${fixed(ST_MATTHEW_GUESS_R, 4)}*x))`,
    label: "logistic 预测",
    emphasis: "secondary" as const,
    semantic_role: "model_prediction",
  };
  const plot = (args: {
    curves: MathPlotSnapshot["curves"];
    points?: MathPlotSnapshot["points"];
    marker?: number;
    shade?: readonly [number, number];
    caption: string;
    formula: string;
    window?: { xMax: number; yMax: number; xLabel: string; yLabel: string };
  }): MathPlotSnapshot => ({
    kind: "math_plot",
    pack_id: "math-basic",
    curves: args.curves,
    points: args.points,
    x_min: 0,
    x_max: args.window?.xMax ?? dataXMax,
    y_min: 0,
    y_max: args.window?.yMax ?? yTop,
    marker_x: args.marker ?? null,
    shade_from: args.shade?.[0] ?? null,
    shade_to: args.shade?.[1] ?? null,
    x_label: args.window?.xLabel ?? "时间 t（小时）",
    y_label: args.window?.yLabel ?? "酵母量 N",
    formula_latex: args.formula,
    caption: args.caption,
  });
  const steps = [
    sceneStep(0, "logistic-data-puzzle", "先看数据：增长为什么停了", "1913 年，生物学家 Carlson 每小时测一次培养瓶里的酵母量。前 5 个小时它每小时都涨六成以上——照这个势头外推，第 18 小时应该超过七万。可真实的记录在 663 附近停住了。是什么按住了它？", plot({
      curves: [exponentialCurve],
      points: observations,
      caption: "1913 年，Carlson 每小时记录一次培养瓶里的酵母量。",
      formula: String.raw`N(t)\overset{?}{=}${fixed(CARLSON_EXP_FIT.a, 1)}\,e^{${fixed(CARLSON_EXP_FIT.b, 3)}t}`,
    })),
    sceneStep(1, "logistic-density-dependence", "刹车项：密度制约", "是拥挤本身。瓶里的糖被越来越多的细胞分食，人均资源随 N 下降——写成最简单的形式：人均增长率从 r 线性降到 0，即给 rN 乘上刹车项 (1−N/K)。K 就是这瓶环境长期养得起的上限。", plot({
      curves: [exponentialCurve, capacityLine],
      points: observations,
      caption: "K：这瓶培养液长期养得起的最大数量。",
      formula: String.raw`\frac{dN}{dt}=rN\left(1-\frac NK\right)`,
    })),
    sceneStep(2, "logistic-s-curve", "S 曲线穿过数据", `方程解出的 S 形曲线，用三个数就穿过全部 19 个观测：r=${fixed(r, 2)}、K=${fixed(capacity)}、N₀=${fixed(n0, 1)}。前段贴着指数走，后段贴着 K 放平。把右侧参数拖离这组值，曲线会当着你的面离开数据点——拟合就是这种感觉。`, plot({
      curves: [logisticCurve, capacityLine, exponentialCurve],
      points: observations,
      caption: "数据点固定不动；r、K、N₀ 是你手里的拟合旋钮。",
      formula: String.raw`N(t)=\dfrac{K}{1+${fixed(growthGap, 1)}\,e^{-${fixed(r, 2)}t}}`,
    })),
    sceneStep(3, "logistic-inflection", "拐点：半满时最快", `增长最快的时刻不在种群最多的时候，而在恰好半满：N=K/2=${fixed(capacity / 2)} 时瞬时增长率到达最大值 rK/4=${fixed(maxRate, 1)}，对应 t≈${fixed(tInflection, 1)}。记住 rK/4 这个数——两步之后它会换一个身份出场。`, plot({
      curves: [logisticCurve, capacityLine],
      points: observations,
      marker: tInflection,
      shade: [Math.max(0, tInflection - 0.8), tInflection + 0.8],
      caption: "拐点：种群到达一半容量的时刻。",
      formula: String.raw`N=\frac K2\ \text{时}\ \frac{dN}{dt}\Big|_{\max}=\frac{rK}{4}=${fixed(maxRate, 1)}`,
    })),
    sceneStep(4, "logistic-harvest", "决策实验：开始捕捞", effort < 1e-9
      ? "现在把模型变成决策工具：以恒定努力捕捞，每小时捞走 E·N。方程只多一项 −EN，合并后仍是 logistic——增长率降为 r−E，平衡点从 K 降到 K(1−E/r)。把右侧的捕捞强度 E 拖起来，看看种群把新家安在哪里。"
      : effectiveRate > 1e-9
        ? `捕捞强度 E=${fixed(effort, 3)}：有效增长率降到 r−E=${fixed(effectiveRate, 3)}，种群不再回到 K=${fixed(capacity)}，而是停在更低的新平衡 K(1−E/r)≈${fixed(effectiveCapacity, 0)}。捞得越狠，家搬得越低——但只要 E<r，它仍能停住。`
        : `捕捞强度 E=${fixed(effort, 3)} 已不低于 r=${fixed(r, 2)}：增长追不上捕捞，方程失去正平衡点，任何起点都单调滑向 0。这不是运气差，是参数的必然。`, plot({
      curves: effort < 1e-9
        ? [harvestedCurve, capacityLine]
        : [harvestedCurve, { ...logisticCurve, emphasis: "secondary" as const, label: "无捕捞对照" }, capacityLine],
      window: { xMax: harvestXMax, yMax: yTop, xLabel: "时间 t", yLabel: "种群数量 N" },
      caption: "恒定努力捕捞：−EN 并入方程后仍可解析求解。",
      formula: String.raw`\frac{dN}{dt}=rN\left(1-\frac NK\right)-EN`,
    })),
    sceneStep(5, "logistic-msy", "最大可持续产量：rK/4 的第二次出场", `换个问题：长期每小时最多能捞走多少？平衡时的产量 Y=E·K(1−E/r) 是一条开口向下的抛物线，在 E=r/2=${fixed(r / 2, 3)} 处到顶，最大值恰好是 rK/4=${fixed(maxRate, 1)}——拐点处那个最大再生产速度，就是渔场的天花板。站在顶点还意味着：E 再大一点点，产量和种群就一起下坡。`, plot({
      curves: [yieldCurve, { expression: `${fixed(maxRate, 2)}`, label: `rK/4=${fixed(maxRate, 1)}`, emphasis: "secondary" as const, semantic_role: "yield_ceiling" }],
      marker: effort > 1e-9 && effort < r ? effort : r / 2,
      window: { xMax: r * 1.08, yMax: maxRate * 1.25, xLabel: "捕捞强度 E", yLabel: "可持续产量 Y" },
      caption: "第 4 步的 rK/4 在这里换了身份：可持续捕捞的上限。",
      formula: String.raw`Y_{\max}=\frac{rK}{4}=${fixed(maxRate, 1)}\ \text{在}\ E=\frac r2`,
    })),
    sceneStep(6, "logistic-st-matthew", "圣马修岛：模型的边界", "1944 年，29 只驯鹿被引入白令海的圣马修岛。按前 13 年的增长拟合 logistic、把 K 猜成 3000，模型预言种群平滑贴向天花板。现实是：1963 年夏数到 6000 只，随后一个严冬几乎全数饿死，1966 年只剩 42 只。不是方程算错了，是它的前提塌了——驯鹿吃光了再生要几十年的地衣，K 本身崩了，而模型假设 K 永远不变。", plot({
      curves: [stMatthewPrediction, { expression: `${ST_MATTHEW_GUESS_K}`, label: "K 的猜测", emphasis: "secondary" as const, semantic_role: "carrying_capacity" }],
      points: ST_MATTHEW_REINDEER.map((point) => ({ ...point, emphasis: "accent", semantic_role: "observed_population" })),
      window: { xMax: 28, yMax: 7, xLabel: "1944 年起算的年数", yLabel: "驯鹿数量（千只）" },
      caption: "数据：Klein (1968)。纵轴单位：千只。",
      formula: String.raw`K\neq\text{常数}`,
    })),
    sceneStep(7, "logistic-skeleton", "模型是骨架", "回到酵母。Logistic 抓住的是密度制约这一根骨架：数据里的波动、时滞，圣马修岛那样的过冲崩溃，都是骨架上的偏离项。会用模型的意思，是同时知道它何时成立、何时失效。下一课把时间切成一年一代——同一个方程，将一路通向混沌。", plot({
      curves: [logisticCurve, capacityLine],
      points: observations,
      caption: "骨架看清了，偏离才有处安放。下一课：离散时间与混沌。",
      formula: String.raw`\boxed{\dfrac{dN}{dt}=rN\left(1-\dfrac NK\right)}`,
    })),
  ];
  return playbook(
    "biology",
    "种群增长 · Logistic 模型",
    "从 Carlson 的酵母数据到捕捞决策：拟合、拐点、rK/4 与模型的边界。",
    "ecology_logistic_growth",
    steps,
    [
      { id: "r", label: "内禀增长率 r", value: fixed(r, 2), description: "0.3 到 0.9；拟合值 0.55" },
      { id: "K", label: "环境容量 K", value: fixed(capacity), description: "400 到 900；拟合值 663" },
      { id: "N0", label: "初始种群 N₀", value: fixed(n0, 1), description: "4 到 30；观测值 9.6" },
      { id: "E", label: "捕捞强度 E", value: fixed(effort, 3), description: "0 到 0.9；E≥r 时种群崩溃" },
    ],
  );
}

// ── 兔群与混沌：离散 logistic 映射 → 分岔图 → 洛伦兹 ─────────────────────────

const CHAOS_CAPACITY = 1000;
const CHAOS_YEARS_SHORT = 30;
const CHAOS_YEARS_MID = 40;
const CHAOS_YEARS_LONG = 60;
const RABBIT_MAP_FORMULA = String.raw`N_{t+1}=N_t+rN_t\left(1-\frac{N_t}{K}\right)`;

/** Discrete logistic map N_{t+1} = N + rN(1 − N/K), floored at zero. */
function iterateLogisticMap(r: number, n0: number, years: number): Array<[number, number]> {
  const path: Array<[number, number]> = [[0, n0]];
  let n = n0;
  for (let t = 1; t <= years; t += 1) {
    n = Math.max(0, n + r * n * (1 - n / CHAOS_CAPACITY));
    path.push([t, n]);
  }
  return path;
}

/**
 * Bifurcation diagram of the map above: long-run attractor samples per growth
 * rate, quantized and deduplicated per column so the scatter stays a few
 * thousand points. Parameter-independent, so cached after the first build.
 */
let bifurcationCache: NonNullable<MathPlotSnapshot["points"]> | null = null;
function bifurcationScatter(): NonNullable<MathPlotSnapshot["points"]> {
  if (bifurcationCache) return bifurcationCache;
  const samples: NonNullable<MathPlotSnapshot["points"]> = [];
  const columns = 320;
  for (let column = 0; column <= columns; column += 1) {
    const r = 0.5 + (2.5 * column) / columns;
    let n = 10;
    for (let i = 0; i < 300; i += 1) n = Math.max(0, n + r * n * (1 - n / CHAOS_CAPACITY));
    const seen = new Set<number>();
    for (let i = 0; i < 100; i += 1) {
      n = Math.max(0, n + r * n * (1 - n / CHAOS_CAPACITY));
      const bin = Math.round(n / 2.5);
      if (seen.has(bin)) continue;
      seen.add(bin);
      samples.push({ x: r, y: bin * 2.5, semantic_role: "attractor_sample" });
    }
  }
  bifurcationCache = samples;
  return samples;
}

/** Lorenz system (σ=10, ρ=28, β=8/3) integrated with RK4 from (x0, 1, 1). */
function lorenzRun(x0: number): { xz: Array<[number, number]>; tx: Array<[number, number]> } {
  const sigma = 10;
  const rho = 28;
  const beta = 8 / 3;
  const dt = 0.004;
  const steps = 10000;
  const deriv = (s: readonly [number, number, number]): [number, number, number] => [
    sigma * (s[1] - s[0]),
    s[0] * (rho - s[2]) - s[1],
    s[0] * s[1] - beta * s[2],
  ];
  let state: [number, number, number] = [x0, 1, 1];
  const xz: Array<[number, number]> = [];
  const tx: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    if (i % 2 === 0) xz.push([state[0], state[2]]);
    if (i % 5 === 0) tx.push([i * dt, state[0]]);
    const k1 = deriv(state);
    const k2 = deriv([
      state[0] + (dt / 2) * k1[0],
      state[1] + (dt / 2) * k1[1],
      state[2] + (dt / 2) * k1[2],
    ]);
    const k3 = deriv([
      state[0] + (dt / 2) * k2[0],
      state[1] + (dt / 2) * k2[1],
      state[2] + (dt / 2) * k2[2],
    ]);
    const k4 = deriv([state[0] + dt * k3[0], state[1] + dt * k3[1], state[2] + dt * k3[2]]);
    state = [
      state[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      state[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
      state[2] + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
    ];
  }
  return { xz, tx };
}

let lorenzCache: { a: ReturnType<typeof lorenzRun>; b: ReturnType<typeof lorenzRun> } | null = null;
function lorenzPair(): { a: ReturnType<typeof lorenzRun>; b: ReturnType<typeof lorenzRun> } {
  if (!lorenzCache) lorenzCache = { a: lorenzRun(1), b: lorenzRun(1.000001) };
  return lorenzCache;
}

export function buildRabbitChaosGoldPlaybook(params: TemplatePreviewParams): PlaybookScript {
  const r = boundedNumber(params, "r", 2.95, 0.5, 3);
  const n0 = boundedNumber(params, "N0", 10, 1, 100);
  const yTop = 1400;
  const capacityLine = {
    expression: `${CHAOS_CAPACITY}`,
    label: `K=${CHAOS_CAPACITY}`,
    emphasis: "secondary" as const,
    semantic_role: "carrying_capacity",
  };
  const mapPlot = (args: {
    lines: MathPlotSnapshot["polylines"];
    points?: MathPlotSnapshot["points"];
    curves?: MathPlotSnapshot["curves"];
    caption: string;
    formula: string;
    window?: { xMin?: number; xMax?: number; yMin?: number; yMax?: number; xLabel?: string; yLabel?: string };
  }): MathPlotSnapshot => ({
    kind: "math_plot",
    pack_id: "math-basic",
    curves: args.curves ?? [capacityLine],
    points: args.points,
    polylines: args.lines,
    x_min: args.window?.xMin ?? 0,
    x_max: args.window?.xMax ?? CHAOS_YEARS_SHORT,
    y_min: args.window?.yMin ?? 0,
    y_max: args.window?.yMax ?? yTop,
    x_label: args.window?.xLabel ?? "时间（年）",
    y_label: args.window?.yLabel ?? "兔群数量 N",
    formula_latex: args.formula,
    caption: args.caption,
  });
  const trajectory = (rate: number, start: number, years: number) => ({
    points: iterateLogisticMap(rate, start, years),
    label: `r=${fixed(rate, 2)}`,
    emphasis: "primary" as const,
    semantic_role: "rabbit_trajectory",
  });
  const yearDots = (line: { points: Array<[number, number]> }) =>
    line.points.map(([x, y]) => ({ x, y, semantic_role: "yearly_count" }));
  // Each teaching step pins its own r (that IS the lesson's axis); N0 follows
  // the slider everywhere so the transient responds while the attractor holds.
  const converge = trajectory(0.8, n0, CHAOS_YEARS_SHORT);
  const overshoot = trajectory(1.8, n0, CHAOS_YEARS_SHORT);
  const periodTwo = trajectory(2.2, n0, CHAOS_YEARS_MID);
  const periodFour = trajectory(2.5, n0, CHAOS_YEARS_MID);
  const deepChaos = trajectory(2.95, n0, CHAOS_YEARS_LONG);
  const butterflyA = { ...trajectory(2.95, n0, CHAOS_YEARS_LONG), label: `N₀=${fixed(n0, 1)}` };
  const butterflyB = {
    ...trajectory(2.95, n0 + 0.000001, CHAOS_YEARS_LONG),
    label: `N₀=${fixed(n0, 1)}+0.000001`,
    emphasis: "accent" as const,
    semantic_role: "rabbit_trajectory_twin",
  };
  const lorenz = lorenzPair();
  const steps = [
    sceneStep(0, "chaos-one-generation", "把时间切成一年一代", "换一种时间观：兔群一年繁殖一代，方程从微分变成迭代——明年的数量由今年一步算出。r=0.8 时它跟连续模型走同一条路，只慢半拍，最后同样贴向 K=1000。这半拍就是时滞的种子——现在看无伤大雅，对吧？", mapPlot({
      lines: [converge],
      points: yearDots(converge),
      curves: [
        {
          expression: `${CHAOS_CAPACITY}/(1+${fixed((CHAOS_CAPACITY - n0) / n0, 4)}*exp(-0.8*x))`,
          label: "连续模型",
          emphasis: "secondary",
          semantic_role: "continuous_reference",
        },
        capacityLine,
      ],
      caption: "同一个 logistic，只是把时间切成了离散的一代一代。",
      formula: RABBIT_MAP_FORMULA,
    })),
    sceneStep(1, "chaos-overshoot", "r=1.8：刹不住车", "把 r 提到 1.8：兔群冲过 K 再跌回来，振荡几年才安定。原因是时滞——今年的过剩要到明年才显形，方向盘打晚了一年。连续模型永远不会这样，它的反馈是即时的。", mapPlot({
      lines: [overshoot],
      points: yearDots(overshoot),
      caption: "一年的反馈延迟：过冲、回摆、逐渐安定。",
      formula: RABBIT_MAP_FORMULA,
    })),
    sceneStep(2, "chaos-period-two", "r=2.2：永不安定的秩序", "r=2.2：振荡不再衰减，兔群锁进高一年、低一年的两年循环。它永远到不了 K，却完全可预测——这是第一次分岔。", mapPlot({
      lines: [periodTwo],
      points: yearDots(periodTwo),
      window: { xMax: CHAOS_YEARS_MID },
      caption: "周期 2：平衡点失稳后出现的新秩序。",
      formula: RABBIT_MAP_FORMULA,
    })),
    sceneStep(3, "chaos-period-four", "r=2.5：周期加倍", "r=2.5：两年循环裂成四年循环。继续加大 r，周期以越来越快的速度翻倍：8、16、32……到 r≈2.57，翻倍塞满，秩序耗尽。", mapPlot({
      lines: [periodFour],
      points: yearDots(periodFour),
      window: { xMax: CHAOS_YEARS_MID },
      caption: "倍周期级联：通往混沌最经典的一条路。",
      formula: RABBIT_MAP_FORMULA,
    })),
    sceneStep(4, "chaos-deep", "r=2.95：混沌", "r=2.95：轨迹再也不重复自己。注意，方程里没有一个随机数——每一步都是确定的，但整体永不循环。这就是混沌：确定性系统生出的不可预测。", mapPlot({
      lines: [deepChaos],
      window: { xMax: CHAOS_YEARS_LONG },
      caption: "确定性方程，非周期轨道。",
      formula: RABBIT_MAP_FORMULA,
    })),
    sceneStep(5, "chaos-butterfly", "蝴蝶效应：0.000001 的分量", "两群兔子，初始只差百万分之一只：前三十多年两条轨迹完全重合，然后彻底分道扬镳。初值的微小误差按指数放大——超过一个期限，预测就失效了。这不是测量不够准，是系统本性。", mapPlot({
      lines: [butterflyA, butterflyB],
      window: { xMax: CHAOS_YEARS_LONG },
      caption: "初值差 10⁻⁶：重合三十多年，然后各奔东西。",
      formula: String.raw`\Delta_0=10^{-6}`,
    })),
    sceneStep(6, "chaos-bifurcation", "分岔图：整个故事的地图", `把每个 r 的长期归宿都画出来：左边一条线是安定，r=2 劈成两枝，再裂成四枝，然后是混沌的噪点带——带里还嵌着突然安静的白色窗口。你刚才走过的五步，是这张图上的五条竖线；此刻的竖线停在 r=${fixed(r, 2)}。`, mapPlot({
      lines: [{
        points: [[r, 0], [r, yTop]],
        label: `r=${fixed(r, 2)}`,
        emphasis: "accent",
        semantic_role: "current_rate_marker",
      }],
      points: bifurcationScatter(),
      curves: [],
      window: { xMin: 0.5, xMax: 3, xLabel: "年增长率 r", yLabel: "长期兔群数量" },
      caption: "横轴 r，纵轴长期归宿；白色窗口里秩序短暂回归。",
      formula: String.raw`r_\infty\approx2.57`,
    })),
    sceneStep(7, "chaos-lorenz-shape", "蝴蝶的本体：洛伦兹吸引子", "混沌不只住在兔群里。1963 年，气象学家洛伦兹在三条大气对流方程里看到同样的东西——轨迹永远绕着两翼盘旋，永不重复。你看到的交叉是三维轨迹拍进平面的投影假象，这恰好说明它活在三维里。", {
      kind: "phase_portrait_scene",
      trajectories: [{ points: lorenz.a.xz, emphasis: "primary" }],
      equilibria: [
        { x: Math.sqrt(72), y: 27, label: "C₊", stable: false },
        { x: -Math.sqrt(72), y: 27, label: "C₋", stable: false },
      ],
      x_min: -25,
      x_max: 25,
      y_min: 0,
      y_max: 52,
      formula_latex: String.raw`\sigma=10,\ \rho=28,\ \beta=\tfrac83`,
      caption: "洛伦兹三条对流方程的 x–z 投影；“交叉”是三维轨迹拍扁后的假象。",
    } satisfies PhasePortraitSceneSnapshot),
    sceneStep(8, "chaos-lorenz-divergence", "同一只蝴蝶，两条命运", "还是那个 0.000001：两条洛伦兹轨迹的 x 分量，前二十多秒完全重合，之后各自绕向不同的翼。天气预报的两周上限，就是这条曲线定的——不是仪器不行，是大气本身在放大误差。", mapPlot({
      lines: [
        { points: lorenz.a.tx, label: "x₀=1", emphasis: "primary", semantic_role: "lorenz_x" },
        { points: lorenz.b.tx, label: "x₀=1.000001", emphasis: "accent", semantic_role: "lorenz_x_twin" },
      ],
      curves: [],
      window: { xMax: 40, yMin: -25, yMax: 25, xLabel: "时间", yLabel: "x 分量" },
      caption: "初值差 10⁻⁶ 的两条洛伦兹轨迹：重合，然后分道。",
      formula: String.raw`\Delta(t)\approx\Delta_0e^{\lambda t}`,
    })),
    sceneStep(9, "chaos-sandbox", "沙盘：r 交给你", "旁白到此为止。右侧的 r 和 N₀ 现在归你：把 r 从 0.5 慢慢推到 3，找一找周期 8；进了混沌带再把 N₀ 挪一格，数一数轨迹几年后面目全非。这张图你已经会读了。", mapPlot({
      lines: [trajectory(r, n0, CHAOS_YEARS_LONG)],
      window: { xMax: CHAOS_YEARS_LONG },
      caption: "自由沙盘：参数归你，图你已经会读了。",
      formula: RABBIT_MAP_FORMULA,
    })),
  ];
  return playbook(
    "biology",
    "兔群与混沌 · 从秩序到蝴蝶效应",
    "离散 logistic 映射：倍周期、分岔图、洛伦兹吸引子与蝴蝶效应。",
    "ecology_rabbit_chaos",
    steps,
    [
      { id: "r", label: "年增长率 r", value: fixed(r, 2), description: "0.5 安定 → 3 深混沌" },
      { id: "N0", label: "初始兔群 N₀", value: fixed(n0, 1), description: "混沌区里挪一格即分道" },
    ],
  );
}

function standalone(args: {
  caseId: string;
  archetypeId: string;
  subject: "computer_science" | "high_school_chemistry" | "high_school_biology" | "high_school_geography" | "university_ecology";
  domain: string;
  topic: string;
  title: string;
  description: string;
  prompt: string;
  defaults: TemplatePreviewParams;
  controls: NonNullable<GoldTemplateManifest["parameterSchema"]>["controls"];
  requiredCapabilities: readonly string[];
  expectedFacts: GoldTemplateManifest["expectedFacts"];
  visualInvariants: GoldTemplateManifest["visualInvariants"];
  objective: string;
  builder: (params: TemplatePreviewParams) => PlaybookScript;
  mechanism: string;
  mechanismByStep?: Record<string, string>;
  transfer: string;
  posterStepIndex?: number;
  handsOn?: readonly string[];
}): GoldTemplateManifest {
  const defaultScript = args.builder(args.defaults);
  return defineStandaloneGoldTemplate({
    caseId: args.caseId,
    archetypeId: args.archetypeId,
    subject: args.subject,
    domain: args.domain,
    topic: args.topic,
    title: args.title,
    description: args.description,
    canonicalPrompt: args.prompt,
    parameterSchema: { defaults: args.defaults, controls: args.controls },
    poster: {
      url: `/template-previews/${args.caseId}/poster.webp`,
      alt: `${args.title}的 Playbook 代表画面`,
      frame: posterFrameForStep(defaultScript, args.posterStepIndex ?? defaultScript.steps.length - 1),
    },
    requiredCapabilities: args.requiredCapabilities,
    handsOnStepIds: args.handsOn,
    expectedFacts: args.expectedFacts,
    visualInvariants: args.visualInvariants,
    pedagogicalRubric: {
      objective: args.objective,
      requiredPhases: ["观察", "机制或推理", "验证", "总结"],
      minimumSteps: 6,
    },
    buildPublicPlaybook: args.builder,
    buildFollowups: (_params, script) => followups(
      script,
      (step) => args.mechanismByStep?.[step.step_id] ?? args.mechanism,
      args.transfer,
    ),
  });
}

export const CROSS_SUBJECT_PUBLIC_GOLD_TEMPLATES: readonly GoldTemplateManifest[] = Object.freeze([
  standalone({
    caseId: "two-sum",
    archetypeId: "code.hash-table.two-sum",
    subject: "computer_science",
    domain: "code",
    topic: "哈希表",
    title: "两数之和 · 哈希表",
    description: "同步观察源码行、扫描下标、补数和 seen 状态",
    prompt: "用 nums=[2,7,11,15] 讲解两数之和的哈希表解法，并验证返回下标。",
    defaults: { target: "9" },
    controls: [{ id: "target", kind: "select", label: "目标和", description: "三个目标均有确定解", resetPlayback: false, options: [
      { label: "9（2+7）", value: "9" },
      { label: "18（7+11）", value: "18" },
      { label: "26（11+15）", value: "26" },
    ] }],
    requiredCapabilities: ["code_trace_scene", "active_code_line", "array_scan_pointer", "variable_watch"],
    expectedFacts: [
      { id: "two-sum-result", description: "默认输入返回下标 [0,1]", anyOf: ["[0, 1]", "nums[0]+nums[1]=2+7=9"] },
      { id: "two-sum-invariant", description: "查找发生在写入当前值之前", anyOf: ["seen 只保存 i 之前", "先查补数，再返回"] },
      { id: "two-sum-complexity", description: "平均时间 O(n)，空间 O(n)", anyOf: ["时间复杂度平均 O(n)", "额外空间 O(n)"] },
    ],
    visualInvariants: [{ id: "two-sum-trace", description: "源码、当前数组元素和哈希状态同屏", requiredSemanticRoles: ["active_code_line", "scan_pointer", "hash_state"], requiredStateFields: ["lines", "active_line", "array_values", "pointers", "variables"] }],
    objective: "建立哈希表一次扫描的不变量，并验证返回的是两个不同下标。",
    builder: buildTwoSumGoldPlaybook,
    mechanism: "先查 complement，未命中后才写入当前值；seen 因而只包含更早的元素。",
    transfer: "代回 nums 检查两个下标不同且两数之和等于 target。",
    posterStepIndex: 4,
  }),
  standalone({
    caseId: "redox-electron",
    archetypeId: "chemistry.redox.zinc-copper-electron-transfer",
    subject: "high_school_chemistry",
    domain: "chemistry",
    topic: "氧化还原",
    title: "氧化还原 · 电子转移",
    description: "由氧化数变化写出半反应并检查电子、电荷和原子守恒",
    prompt: "讲解 Zn + CuSO₄ → ZnSO₄ + Cu，标出电子转移、氧化剂和还原剂。",
    defaults: {},
    controls: [],
    requiredCapabilities: ["reaction_scene", "reaction_participants", "electron_flow", "formula_card"],
    expectedFacts: [
      { id: "redox-oxidation", description: "Zn 失去两个电子并被氧化", anyOf: ["Zn → Zn²⁺ + 2e⁻", "Zn 从 0 价升到 +2 价"] },
      { id: "redox-reduction", description: "Cu2+ 得到两个电子并被还原", anyOf: ["Cu²⁺ + 2e⁻ → Cu", "Cu 从 +2 价降到 0 价"] },
      { id: "redox-balance", description: "净离子反应原子与电荷守恒", anyOf: ["Zn + Cu²⁺ → Zn²⁺ + Cu", "总电荷都为 +2"] },
    ],
    visualInvariants: [{ id: "redox-electron-flow", description: "反应物、生成物、反应箭头和电子流保持同一空间关系", requiredSemanticRoles: ["reaction_arrow", "electron_flow", "reactant", "product"], requiredStateFields: ["reactants", "products", "arrows", "electron_flows"] }],
    objective: "把宏观置换反应解释为可配平的电子得失过程。",
    builder: () => buildRedoxGoldPlaybook(),
    mechanism: "氧化数升高表示失电子，降低表示得电子；两个半反应必须消去相同数目的电子。",
    transfer: "分别核对 Zn、Cu 原子数与净电荷，再判断 SO₄²⁻ 是否在两侧保持不变。",
  }),
  standalone({
    caseId: "dna-replication",
    archetypeId: "biology.genetics.dna-replication",
    subject: "high_school_biology",
    domain: "biology",
    topic: "遗传信息复制",
    title: "DNA 复制",
    description: "结构示意复制叉、5′→3′ 合成、前导/后随链与半保留结果",
    prompt: "解释 DNA 半保留复制，区分前导链连续合成和后随链冈崎片段。",
    defaults: { strandFocus: "both" },
    controls: [{ id: "strandFocus", kind: "select", label: "关注链", description: "仅改变结构示意的关注对象", resetPlayback: false, options: [
      { label: "同时观察", value: "both" },
      { label: "前导链", value: "leading" },
      { label: "后随链", value: "lagging" },
    ] }],
    requiredCapabilities: ["bio_process_scene", "biology-basic:dna-helix", "biology-basic:replication-fork", "flow_arrow"],
    expectedFacts: [
      { id: "dna-direction", description: "新 DNA 链只能按 5-to-3 方向延伸", anyOf: ["5′→3′ 方向延伸", "仍必须按 5′→3′ 合成"] },
      { id: "dna-lagging", description: "后随链通过冈崎片段分段合成", anyOf: ["多个冈崎片段", "后随链分段合成"] },
      { id: "dna-semiconservative", description: "每个子代 DNA 含一条旧链和一条新链", anyOf: ["一条亲代旧链和一条新合成链", "各保留一条亲代链"] },
    ],
    visualInvariants: [{ id: "dna-process-structure", description: "亲代 DNA、复制叉和两条子代 DNA 由流程箭头连接", requiredSemanticRoles: ["dna", "process_step", "flow_arrow"], requiredStateFields: ["process_id", "steps", "connections", "callouts"] }],
    objective: "在结构示意能力边界内解释 DNA 半保留复制和两条新链的合成差异。",
    builder: buildDnaReplicationGoldPlaybook,
    mechanism: "互补配对复制模板信息，而 DNA 聚合酶的 5′→3′ 限制导致一条连续、一条分段合成。",
    transfer: "检查两个子代 DNA 是否都包含一条旧链和一条新链，并核对 A-T、G-C 配对。",
    posterStepIndex: 5,
  }),
  standalone({
    caseId: "monsoon",
    archetypeId: "geography.climate.east-asia-monsoon",
    subject: "high_school_geography",
    domain: "geography",
    topic: "季风气候",
    title: "东亚季风",
    description: "比较冬夏海陆气压配置、风向反转与水汽来源",
    prompt: "解释东亚季风：冬夏海陆热力差异如何驱动风向反转并影响降水。",
    defaults: { season: "summer" },
    controls: [{ id: "season", kind: "select", label: "验证季节", description: "重建最后的季节验证画面", resetPlayback: false, options: [
      { label: "夏季", value: "summer" },
      { label: "冬季", value: "winter" },
    ] }],
    requiredCapabilities: ["geo_map_scene", "geography-earth-basic:natural-earth", "pressure_centers", "monsoon_flow"],
    expectedFacts: [
      { id: "monsoon-summer", description: "夏季大陆低压、海洋高压，风由海洋吹向陆地", anyOf: ["大陆升温较快", "海洋吹向陆地"] },
      { id: "monsoon-winter", description: "冬季大陆高压、海洋低压，风由陆地吹向海洋", anyOf: ["大陆降温较快", "陆地吹向海洋"] },
      { id: "monsoon-rainfall", description: "水汽来源影响降水且存在区域差异", anyOf: ["夏季海洋到陆地", "局地仍可能增湿降雪"] },
    ],
    visualInvariants: [{ id: "monsoon-map", description: "同一东亚底图上保留大陆、海洋、气压中心和季风流向", requiredSemanticRoles: ["land", "ocean", "pressure_high", "pressure_low", "monsoon_flow"], requiredStateFields: ["map_region", "layers", "flows", "pressure_centers"] }],
    objective: "由海陆热力差异推导冬夏气压配置、近地面风向和水汽影响。",
    builder: buildMonsoonGoldPlaybook,
    mechanism: "海陆热容量差异造成季节性气压差，近地面气流受气压梯度与地转偏向共同组织。",
    transfer: "先判大陆与海洋谁是高压，再检查箭头是否由高压指向低压，并核对水汽来源。",
    posterStepIndex: 5,
  }),
  standalone({
    caseId: "logistic-growth",
    archetypeId: "ecology.population.logistic-growth",
    subject: "university_ecology",
    domain: "biology",
    topic: "种群生态学",
    title: "种群增长 · Logistic 模型",
    description: "Carlson 酵母数据、S 形拟合、捕捞决策与圣马修岛：从数据到模型边界",
    prompt: "从 Carlson 1913 年酵母数据出发讲解 Logistic 模型：检验指数假设、拟合 S 形曲线、定位 K/2 拐点，引入恒定努力捕捞推导最大可持续产量 rK/4，并用圣马修岛驯鹿说明模型失效的边界。",
    defaults: { r: 0.55, K: 663, N0: 9.6, E: 0 },
    controls: [
      { id: "r", kind: "range", label: "内禀增长率 r", description: "拟合值 0.55；决定坡度", min: 0.3, max: 0.9, step: 0.01, resetPlayback: false, steps: ["logistic-s-curve", "logistic-inflection", "logistic-harvest", "logistic-msy", "logistic-skeleton"] },
      { id: "K", kind: "range", label: "环境容量 K", description: "拟合值 663；数据的天花板", min: 400, max: 900, step: 1, resetPlayback: false, steps: ["logistic-density-dependence", "logistic-s-curve", "logistic-inflection", "logistic-harvest", "logistic-msy", "logistic-skeleton"] },
      { id: "N0", kind: "range", label: "初始种群 N₀", description: "观测值 9.6；只挪起点", min: 4, max: 30, step: 0.1, resetPlayback: false, steps: ["logistic-s-curve", "logistic-inflection", "logistic-harvest", "logistic-skeleton"] },
      { id: "E", kind: "range", label: "捕捞强度 E", description: "E=r/2 产量最大；E≥r 崩溃", min: 0, max: 0.9, step: 0.005, resetPlayback: false, steps: ["logistic-harvest", "logistic-msy"] },
    ],
    requiredCapabilities: ["math_plot", "expression_curve", "curve_marker", "data_points"],
    handsOn: ["logistic-s-curve", "logistic-harvest"],
    expectedFacts: [
      { id: "logistic-equation", description: "密度制约的增长方程", anyOf: ["rN(1−N/K)", "rN(1-N/K)", "dN/dt=rN"] },
      { id: "logistic-data-first", description: "以 Carlson 1913 酵母数据开场并检验指数假设", anyOf: ["Carlson", "1913", "酵母"] },
      { id: "logistic-capacity", description: "环境容量 K 的含义", anyOf: ["环境容量", "承载", "K"] },
      { id: "logistic-inflection", description: "拐点在 K/2，最大增长率 rK/4", anyOf: ["K 的一半", "K/2", "rK/4"] },
      { id: "logistic-msy", description: "最大可持续产量 rK/4 出现在 E=r/2", anyOf: ["rK/4", "E=r/2", "可持续产量"] },
      { id: "logistic-model-limits", description: "圣马修岛：K 非常数导致过冲—崩溃", anyOf: ["圣马修", "K 本身", "42"] },
      { id: "logistic-shape", description: "解曲线为 S 形", anyOf: ["S 形", "logistic", "Logistic"] },
    ],
    visualInvariants: [{
      id: "logistic-visual",
      description: "观测数据点、Logistic 曲线与环境容量线同屏可辨认",
      requiredSemanticRoles: ["population_curve", "carrying_capacity", "observed_population"],
      requiredStateFields: ["curves", "points", "x_min", "x_max", "marker_x"],
    }],
    objective: "从真实数据出发拟合 logistic，定位 K/2 拐点，推导最大可持续产量 rK/4，并识别模型失效的边界。",
    builder: buildLogisticGrowthGoldPlaybook,
    mechanism: "S 形来自两股力的接力：前期 rN 主导（加速），越过 K/2 后 (1−N/K) 主导（减速）。",
    mechanismByStep: {
      "logistic-data-puzzle": "对前 5 个点做 ln N 对 t 的最小二乘回归得 N≈10.4e^{0.495t}；它对前 6 小时误差很小，从第 7 小时起系统性高估——偏差单调放大，说明缺的不是精度，是机制。",
      "logistic-density-dependence": "资源人均份额随 N 下降，人均增长率 (1/N)dN/dt 近似线性递减为 r(1−N/K)——这是对数据最简的机制假设，也是仍能解析求解的形式。",
      "logistic-s-curve": "把 dN/dt=rN(1−N/K) 分离变量积分，得 N(t)=K/(1+Ge^{−rt})，G=(K−N₀)/N₀。三个参数各管一件事：N₀ 定起点，r 定坡度，K 定天花板。",
      "logistic-inflection": "dN/dt 是 N 的二次函数 rN−rN²/K，在 N=K/2 取极大 rK/4；换到时间轴上就是 t=ln G/r 处曲线最陡。",
      "logistic-harvest": "恒定努力收获项 −EN 与 rN 同形，合并后方程仍是 logistic：r_eff=r−E、K_eff=K(1−E/r)。E≥r 时增长项被吞掉，任何初值都单调衰减到 0，且仍有闭式解。",
      "logistic-msy": "平衡点 N*=K(1−E/r) 处产量 Y=EN*=KE(1−E/r)，对 E 求导得极值 E=r/2，代回得 Y_max=rK/4——与拐点最大增速同值并非巧合：可持续捕捞的上限就是种群的最大再生产速度。",
      "logistic-st-matthew": "logistic 假设 K 恒定且响应即时；驯鹿的食物（地衣）再生以十年计，种群冲过真实承载力时把 K 不可逆地压低，再叠加 1963-64 的极端积雪，于是出现过冲—崩溃而非渐近。数据出处 Klein (1968)。",
      "logistic-skeleton": "时滞（延迟方程）、随机扰动、Allee 效应、K(t) 动态，都是往骨架上加一项得到的扩展；判断模型的适用边界与会解方程同等重要。",
    },
    transfer: "先把 E 拖到 r/2 看产量到顶、拖过 r 看崩溃；再回第 3 步把 r、K 拖离拟合值，检查曲线怎样离开数据点。",
    posterStepIndex: 2,
  }),
  standalone({
    caseId: "rabbit-chaos",
    archetypeId: "ecology.population.rabbit-chaos",
    subject: "university_ecology",
    domain: "biology",
    topic: "种群生态学 · 动力系统",
    title: "兔群与混沌 · 从秩序到蝴蝶效应",
    description: "离散 logistic 映射：倍周期分岔、混沌、分岔图与洛伦兹蝴蝶效应",
    prompt: "用一年一代的离散 logistic 映射讲解兔群动力学：r 从 0.5 推到 3 经历收敛、过冲、周期 2、周期 4 与混沌，用初值差 0.000001 的双轨迹演示蝴蝶效应，再用分岔图给出全景，最后以洛伦兹吸引子说明连续系统同样的可预测性上限。",
    defaults: { r: 2.95, N0: 10 },
    controls: [
      { id: "r", kind: "range", label: "年增长率 r", description: "0.5 安定 → 3 深混沌", min: 0.5, max: 3, step: 0.01, resetPlayback: false, steps: ["chaos-bifurcation", "chaos-sandbox"] },
      { id: "N0", kind: "range", label: "初始兔群 N₀", description: "混沌区里挪一格即分道", min: 1, max: 100, step: 0.5, resetPlayback: false, steps: ["chaos-one-generation", "chaos-overshoot", "chaos-period-two", "chaos-period-four", "chaos-deep", "chaos-butterfly", "chaos-sandbox"] },
    ],
    requiredCapabilities: ["math_plot", "trajectory_polyline", "data_points", "phase_portrait_scene"],
    handsOn: ["chaos-bifurcation", "chaos-sandbox"],
    expectedFacts: [
      { id: "chaos-map", description: "一年一代的离散 logistic 映射", anyOf: ["N_{t+1}", "一年一代", "迭代"] },
      { id: "chaos-doubling", description: "倍周期级联在 r≈2.57 通向混沌", anyOf: ["倍周期", "2.57", "分岔"] },
      { id: "chaos-butterfly", description: "初值差 0.000001 被指数放大", anyOf: ["0.000001", "蝴蝶", "初值"] },
      { id: "chaos-bifurcation-map", description: "分岔图与周期窗口", anyOf: ["分岔图", "窗口", "地图"] },
      { id: "chaos-lorenz", description: "洛伦兹吸引子与可预测性上限", anyOf: ["洛伦兹", "两周", "吸引子"] },
    ],
    visualInvariants: [{
      id: "chaos-visual",
      description: "兔群轨迹、承载线与分岔图在同一模板内可辨认",
      requiredSemanticRoles: ["rabbit_trajectory", "carrying_capacity", "attractor_sample"],
      requiredStateFields: ["polylines", "points", "curves", "x_min", "x_max"],
    }],
    objective: "从离散化的时滞效应出发经历倍周期分岔到混沌，理解初值敏感性、分岔图全景与确定性系统的可预测性上限。",
    builder: buildRabbitChaosGoldPlaybook,
    mechanism: "离散反馈晚一代到账：r<2 时误差衰减，r>2 后平衡点失稳、周期翻倍，r≈2.57 之后进入混沌。",
    mechanismByStep: {
      "chaos-one-generation": "把 dN/dt 换成一年一步的差分 ΔN=rN(1−N/K)。r 远小于 2 时步长足够小，离散轨迹贴着连续解走，两种时间观看不出差别。",
      "chaos-overshoot": "反馈延迟一代：N 超过 K 的代价要下一年才兑现，于是过冲、回摆。在 K 处线性化得特征乘子 1−r，|1−r|<1（即 r<2）时振荡衰减、仍然稳定。",
      "chaos-period-two": "r>2 时 |1−r|>1，K 失稳；轨迹落进二阶迭代 f(f(N)) 的两个新不动点——高低两年交替，这是第一次倍周期分岔。",
      "chaos-period-four": "每个循环又在更高的 r 失稳再翻倍，分岔间隔按费根鲍姆常数 δ≈4.669 收缩，所以 8、16、32 全挤在 r≈2.57 前的极窄区间里。",
      "chaos-deep": "混沌区里轨道有界、确定、永不重复，且相邻轨道以正的李雅普诺夫指数分离——三个条件同时成立才叫混沌，缺一不可。",
      "chaos-butterfly": "两条轨迹的间距近似按 Δ₀e^{λt} 放大。重合期只取决于初始误差的对数：误差再缩小十倍，也只多争取 ln10/λ 那几年。",
      "chaos-bifurcation": "横轴 r、纵轴长期归宿：倍周期级联在 r≈2.57 完结进入混沌带；带内白色窗口是周期轨道短暂回归，窗口内部又是一套微缩的倍周期——自相似即分形。",
      "chaos-lorenz-shape": "洛伦兹方程是大气对流的三模截断，ρ=28 时平衡点 C± 失稳，轨迹被拉进奇怪吸引子；三维解曲线由唯一性定理保证永不相交，交叉只是投影假象。",
      "chaos-lorenz-divergence": "吸引子上误差按最大李雅普诺夫指数放大 Δ(t)≈Δ₀e^{λt}；对大气这对应约两周的可预测上限——是动力学性质，不是观测短板。",
      "chaos-sandbox": "读图口诀：r<2 安定，2 到 2.57 数周期，之后看混沌带与白窗口；改 N₀ 不改变吸引子本身，只改变你落在它上面的那条路径。",
    },
    transfer: "把 r 停在 2.45 与 2.55 之间找周期 4 和周期 8；进混沌带后把 N₀ 挪一格，数一数轨迹几年后面目全非。",
    posterStepIndex: 6,
  }),
]);
