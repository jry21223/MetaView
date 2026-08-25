import type {
  BioProcessSceneSnapshot,
  CodeTraceSceneSnapshot,
  GeoMapSceneSnapshot,
  MathPlotSnapshot,
  MetaStep,
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
    sceneStep(7, "logistic-skeleton", "模型是骨架", "回到酵母。Logistic 抓住的是密度制约这一根骨架：数据里长出的波动、时滞，圣马修岛那样的过冲崩溃，都是骨架上的偏离项。会用模型的意思，是同时知道它何时成立、何时失效。下一课把时间切成一年一代——同一个方程，会自己长出混沌。", plot({
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
      { id: "r", kind: "range", label: "内禀增长率 r", description: "拟合值 0.55；决定坡度", min: 0.3, max: 0.9, step: 0.01, resetPlayback: false },
      { id: "K", kind: "range", label: "环境容量 K", description: "拟合值 663；数据的天花板", min: 400, max: 900, step: 1, resetPlayback: false },
      { id: "N0", kind: "range", label: "初始种群 N₀", description: "观测值 9.6；只挪起点", min: 4, max: 30, step: 0.1, resetPlayback: false },
      { id: "E", kind: "range", label: "捕捞强度 E", description: "E=r/2 产量最大；E≥r 崩溃", min: 0, max: 0.9, step: 0.005, resetPlayback: false },
    ],
    requiredCapabilities: ["math_plot", "expression_curve", "curve_marker", "data_points"],
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
]);
