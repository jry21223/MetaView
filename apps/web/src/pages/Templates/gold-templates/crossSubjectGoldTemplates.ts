import type {
  BioProcessSceneSnapshot,
  CodeTraceSceneSnapshot,
  GeoMapSceneSnapshot,
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

function standalone(args: {
  caseId: string;
  archetypeId: string;
  subject: "computer_science" | "high_school_chemistry" | "high_school_biology" | "high_school_geography";
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
      () => args.mechanism,
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
]);
