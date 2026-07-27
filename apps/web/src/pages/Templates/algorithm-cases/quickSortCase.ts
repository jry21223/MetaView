import type { MetaStep, PlaybookScript } from "../../../features/playbook/engine/types";
import type {
  TemplatePreviewFollowups,
  TemplatePreviewParams,
} from "../templatePreviewCases";
import {
  algorithmQuestions,
  algorithmStep,
  buildAlgorithmPlaybook,
  defineAlgorithmPreviewCase,
  stringParam,
} from "./helpers";

/** Catalog sample array from the quick-sort template prompt. */
export const QUICK_SORT_VALUES = [3, 6, 1, 8, 2, 5, 4, 7] as const;

const PIVOT_STRATEGIES = ["last"] as const;
export type QuickSortPivotStrategy = (typeof PIVOT_STRATEGIES)[number];

const QUICK_SORT_CODE = [
  "function quickSort(a, lo, hi) {",
  "  if (lo >= hi) return;",
  "  const p = partition(a, lo, hi);",
  "  quickSort(a, lo, p - 1);",
  "  quickSort(a, p + 1, hi);",
  "}",
  "function partition(a, lo, hi) { // Lomuto, pivot=a[hi]",
  "  const pivot = a[hi];",
  "  let i = lo - 1;",
  "  for (let j = lo; j < hi; j++) {",
  "    if (a[j] <= pivot) { i++; swap(a, i, j); }",
  "  }",
  "  swap(a, i + 1, hi);",
  "  return i + 1; // left <= pivot < right",
  "}",
];

export interface LomutoPartitionResult {
  array: number[];
  pivotIndex: number;
  pivotValue: number;
}

function swapInPlace(arr: number[], left: number, right: number): void {
  if (left === right) return;
  const tmp = arr[left]!;
  arr[left] = arr[right]!;
  arr[right] = tmp;
}

/**
 * Lomuto partition with last-element pivot.
 * Invariant after return: array[lo..pivotIndex-1] <= pivotValue,
 * array[pivotIndex] === pivotValue, array[pivotIndex+1..hi] > pivotValue.
 */
export function lomutoPartition(
  values: readonly number[],
  lo: number,
  hi: number,
): LomutoPartitionResult {
  if (lo < 0 || hi >= values.length || lo > hi) {
    throw new Error(`Invalid partition bounds lo=${lo} hi=${hi} n=${values.length}`);
  }
  const array = [...values];
  const pivotValue = array[hi]!;
  let i = lo - 1;
  for (let j = lo; j < hi; j++) {
    if (array[j]! <= pivotValue) {
      i += 1;
      swapInPlace(array, i, j);
    }
  }
  const pivotIndex = i + 1;
  swapInPlace(array, pivotIndex, hi);
  return { array, pivotIndex, pivotValue };
}

/** Full in-place Lomuto quick sort (last-element pivot). Returns a new sorted array. */
export function quickSortLomuto(values: readonly number[]): number[] {
  const array = [...values];
  const sortRange = (lo: number, hi: number): void => {
    if (lo >= hi) return;
    const pivotValue = array[hi]!;
    let i = lo - 1;
    for (let j = lo; j < hi; j++) {
      if (array[j]! <= pivotValue) {
        i += 1;
        swapInPlace(array, i, j);
      }
    }
    const p = i + 1;
    swapInPlace(array, p, hi);
    sortRange(lo, p - 1);
    sortRange(p + 1, hi);
  };
  sortRange(0, array.length - 1);
  return array;
}

type TraceKind =
  | "intro"
  | "choose_pivot"
  | "compare"
  | "swap"
  | "place_pivot"
  | "done";

export interface QuickSortTraceEvent {
  kind: TraceKind;
  array: number[];
  lo: number;
  hi: number;
  i: number | null;
  j: number | null;
  pivotIndex: number | null;
  pivotValue: number | null;
  sorted: number[];
  swapPair: [number, number] | null;
  comparedLe: boolean | null;
  depth: number;
  partitionId: number;
}

function sortedList(sorted: ReadonlySet<number>): number[] {
  return [...sorted].sort((a, b) => a - b);
}

/**
 * Deterministic Lomuto quick-sort event trace for teaching snapshots.
 * Emits choose/compare/swap/place events in FIFO partition order.
 */
export function buildQuickSortTrace(values: readonly number[]): QuickSortTraceEvent[] {
  const array = [...values];
  const events: QuickSortTraceEvent[] = [];
  const sorted = new Set<number>();
  let partitionId = 0;

  events.push({
    kind: "intro",
    array: [...array],
    lo: 0,
    hi: array.length - 1,
    i: null,
    j: null,
    pivotIndex: null,
    pivotValue: null,
    sorted: [],
    swapPair: null,
    comparedLe: null,
    depth: 0,
    partitionId: -1,
  });

  const partition = (lo: number, hi: number, depth: number): number => {
    const id = partitionId;
    partitionId += 1;
    const pivotIndex = hi;
    const pivotValue = array[hi]!;
    events.push({
      kind: "choose_pivot",
      array: [...array],
      lo,
      hi,
      i: lo - 1,
      j: null,
      pivotIndex,
      pivotValue,
      sorted: sortedList(sorted),
      swapPair: null,
      comparedLe: null,
      depth,
      partitionId: id,
    });

    let i = lo - 1;
    for (let j = lo; j < hi; j++) {
      const comparedLe = array[j]! <= pivotValue;
      events.push({
        kind: "compare",
        array: [...array],
        lo,
        hi,
        i,
        j,
        pivotIndex,
        pivotValue,
        sorted: sortedList(sorted),
        swapPair: null,
        comparedLe,
        depth,
        partitionId: id,
      });
      if (comparedLe) {
        i += 1;
        if (i !== j) {
          swapInPlace(array, i, j);
          events.push({
            kind: "swap",
            array: [...array],
            lo,
            hi,
            i,
            j,
            pivotIndex,
            pivotValue,
            sorted: sortedList(sorted),
            swapPair: [i, j],
            comparedLe: true,
            depth,
            partitionId: id,
          });
        }
      }
    }

    const finalPivot = i + 1;
    if (finalPivot !== hi) {
      swapInPlace(array, finalPivot, hi);
    }
    sorted.add(finalPivot);
    events.push({
      kind: "place_pivot",
      array: [...array],
      lo,
      hi,
      i,
      j: null,
      pivotIndex: finalPivot,
      pivotValue,
      sorted: sortedList(sorted),
      swapPair: finalPivot === hi ? null : [finalPivot, hi],
      comparedLe: null,
      depth,
      partitionId: id,
    });
    return finalPivot;
  };

  const recurse = (lo: number, hi: number, depth: number): void => {
    if (lo > hi) return;
    if (lo === hi) {
      sorted.add(lo);
      return;
    }
    const p = partition(lo, hi, depth);
    recurse(lo, p - 1, depth + 1);
    recurse(p + 1, hi, depth + 1);
  };

  if (array.length > 0) {
    recurse(0, array.length - 1, 0);
  }

  events.push({
    kind: "done",
    array: [...array],
    lo: 0,
    hi: array.length - 1,
    i: null,
    j: null,
    pivotIndex: null,
    pivotValue: null,
    sorted: sortedList(sorted),
    swapPair: null,
    comparedLe: null,
    depth: 0,
    partitionId: -1,
  });

  return events;
}

function sanitizePointers(pointers: Record<string, number>): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(pointers)) {
    if (Number.isInteger(value) && value >= 0) {
      next[key] = value;
    }
  }
  return next;
}

function barsSnapshot(args: {
  array: readonly number[];
  active?: readonly number[];
  swap?: readonly number[];
  sorted?: readonly number[];
  pointers?: Record<string, number>;
}): MetaStep["snapshot"] {
  const pointers = sanitizePointers(args.pointers ?? {});
  const lo = pointers.lo;
  const hi = pointers.hi;
  const ranges =
    lo != null && hi != null && lo <= hi
      ? [{
          id: "active-partition",
          start: lo,
          end: hi,
          role: "partition" as const,
          label: `partition [${lo}, ${hi}]`,
          emphasis: "primary" as const,
        }]
      : [];
  return {
    kind: "algorithm_bars",
    array_values: args.array.map(String),
    numeric_values: [...args.array],
    active_indices: [...(args.active ?? [])],
    swap_indices: [...(args.swap ?? [])],
    sorted_indices: [...(args.sorted ?? [])],
    pointers,
    ranges,
  };
}

function codeOverlay(args: {
  activeLine: number;
  activeLines?: number[];
  variables: Record<string, string>;
  operation: string;
}): NonNullable<MetaStep["code_highlight"]> {
  const activeLines = args.activeLines ?? [args.activeLine];
  return {
    language: "typescript",
    lines: QUICK_SORT_CODE,
    active_lines: activeLines,
    active_line: args.activeLine,
    variables: args.variables,
    operation_label: args.operation,
  };
}

interface ScriptStepDraft {
  step_id: string;
  title: string;
  voiceover_text: string;
  snapshot: MetaStep["snapshot"];
  code_highlight: NonNullable<MetaStep["code_highlight"]>;
  questions: Array<[string, string]>;
}

function pickTeachingEvents(trace: readonly QuickSortTraceEvent[]): QuickSortTraceEvent[] {
  const firstPartition = trace.filter((event) => event.partitionId === 0);
  const firstCompares = firstPartition.filter((event) => event.kind === "compare");
  const firstSwaps = firstPartition.filter((event) => event.kind === "swap");
  const firstFailCompare =
    firstCompares.find((event) => event.comparedLe === false) ?? firstCompares[0] ?? null;
  const firstSwap = firstSwaps[0] ?? null;
  const lastSwap = firstSwaps.at(-1) ?? null;
  const midSwap =
    firstSwaps.length > 2 ? firstSwaps[Math.floor(firstSwaps.length / 2)]! : null;

  const placeEvents = trace.filter((event) => event.kind === "place_pivot");
  const chooseEvents = trace.filter((event) => event.kind === "choose_pivot");

  const selected: QuickSortTraceEvent[] = [];
  const pushUnique = (event: QuickSortTraceEvent | null | undefined): void => {
    if (!event) return;
    if (selected.includes(event)) return;
    selected.push(event);
  };

  pushUnique(trace.find((event) => event.kind === "intro"));
  pushUnique(chooseEvents[0]);
  pushUnique(firstFailCompare);
  pushUnique(firstSwap);
  if (midSwap && midSwap !== firstSwap && midSwap !== lastSwap) {
    pushUnique(midSwap);
  }
  if (lastSwap && lastSwap !== firstSwap) {
    pushUnique(lastSwap);
  }
  pushUnique(placeEvents[0]);
  pushUnique(chooseEvents[1]);
  for (const place of placeEvents.slice(1)) {
    pushUnique(place);
  }
  pushUnique(trace.find((event) => event.kind === "done"));

  return selected;
}

function draftFromEvent(event: QuickSortTraceEvent, index: number): ScriptStepDraft {
  const sorted = event.sorted;
  const rangeText = `[${event.lo}, ${event.hi}]`;

  if (event.kind === "intro") {
    return {
      step_id: "quick-intro",
      title: "认识待排序数组",
      voiceover_text:
        "快速排序用分治：选一个 pivot，把数组分成左右两段，再对两段递归。本例数组是 [3,6,1,8,2,5,4,7]，采用 Lomuto 分区，pivot 固定取区间最后一个元素。",
      snapshot: barsSnapshot({
        array: event.array,
        active: event.array.map((_, itemIndex) => itemIndex),
        sorted: [],
        pointers: {
          lo: event.lo,
          hi: event.hi,
        },
      }),
      code_highlight: codeOverlay({
        activeLine: 0,
        variables: {
          array: `[${event.array.join(",")}]`,
          strategy: "last (Lomuto)",
          n: String(event.array.length),
        },
        operation: "introduce array",
      }),
      questions: [
        ["快速排序的核心思想是什么？", "选 pivot 分区，使左侧都不大于 pivot、右侧都大于 pivot，再递归处理两侧。"],
        ["本模板用哪种分区？", "Lomuto 分区，pivot 取当前区间最后一个元素（pivotStrategy=last）。"],
        ["和归并排序最大的差别是什么？", "快排主要开销在分区与交换，合并阶段几乎不需要额外数组；归并则显式拆分再合并。"],
      ],
    };
  }

  if (event.kind === "choose_pivot") {
    return {
      step_id: index === 1 ? "quick-pivot-1" : `quick-pivot-${event.partitionId + 1}`,
      title: `选定 pivot = ${event.pivotValue}`,
      voiceover_text:
        `当前处理区间 ${rangeText}。Lomuto 取 a[${event.pivotIndex}] = ${event.pivotValue} 作为 pivot，扫描指针 j 从 ${event.lo} 走到 ${event.hi - 1}，i 从 ${event.lo - 1} 起步。`,
      snapshot: barsSnapshot({
        array: event.array,
        active: event.pivotIndex == null ? [] : [event.pivotIndex],
        sorted,
        pointers: {
          lo: event.lo,
          hi: event.hi,
          pivot: event.pivotIndex ?? event.hi,
          i: event.i ?? event.lo - 1,
        },
      }),
      code_highlight: codeOverlay({
        activeLine: 7,
        activeLines: [6, 7, 8],
        variables: {
          lo: String(event.lo),
          hi: String(event.hi),
          pivotIndex: String(event.pivotIndex),
          pivot: String(event.pivotValue),
          i: String(event.i ?? event.lo - 1),
        },
        operation: "choose pivot",
      }),
      questions: [
        ["pivot 现在在哪？", `索引 ${event.pivotIndex}，值 ${event.pivotValue}，即区间右端 a[hi]。`],
        ["i 初始为什么是 lo-1？", "i 指向“已确认 ≤ pivot 区域”的右边界；尚未确认任何元素时，右边界在 lo 左侧。"],
        ["分区结束后 pivot 会怎样？", "pivot 会被换到最终下标 p，满足左侧 ≤ pivot，右侧 > pivot。"],
      ],
    };
  }

  if (event.kind === "compare") {
    const value = event.j == null ? "?" : String(event.array[event.j]);
    const decision = event.comparedLe
      ? `a[${event.j}] = ${value} ≤ pivot ${event.pivotValue}，因此扩展 ≤ 区（i 前进，必要时交换）`
      : `a[${event.j}] = ${value} > pivot ${event.pivotValue}，留在右侧，只推进 j`;
    return {
      step_id: `quick-compare-${event.partitionId + 1}-${event.j}`,
      title: `比较 a[${event.j}] 与 pivot`,
      voiceover_text: `区间 ${rangeText} 上 j=${event.j}：${decision}。`,
      snapshot: barsSnapshot({
        array: event.array,
        active: [event.j!, event.pivotIndex!],
        sorted,
        pointers: {
          lo: event.lo,
          hi: event.hi,
          pivot: event.pivotIndex!,
          i: event.i ?? event.lo - 1,
          j: event.j!,
        },
      }),
      code_highlight: codeOverlay({
        activeLine: 10,
        activeLines: [9, 10],
        variables: {
          lo: String(event.lo),
          hi: String(event.hi),
          i: String(event.i ?? event.lo - 1),
          j: String(event.j),
          pivot: String(event.pivotValue),
          a_j: value,
          decision: event.comparedLe ? "<=" : ">",
        },
        operation: event.comparedLe ? "expand left side" : "skip greater element",
      }),
      questions: [
        ["这一步比较的是谁？", `扫描下标 j=${event.j} 的值 ${value}，与 pivot ${event.pivotValue} 比较。`],
        ["为什么用 ≤ 而不是 <？", "Lomuto 经典写法把等于 pivot 的元素也收进左侧，最终不变式是左侧 ≤ pivot、右侧 > pivot。"],
        ["j 的职责是什么？", "j 依次检查 [lo, hi) 中每个元素，决定它是否应进入 ≤ pivot 的前缀。"],
      ],
    };
  }

  if (event.kind === "swap") {
    const [left, right] = event.swapPair ?? [event.i ?? 0, event.j ?? 0];
    return {
      step_id: `quick-swap-${event.partitionId + 1}-${left}-${right}`,
      title: `交换 a[${left}] 与 a[${right}]`,
      voiceover_text:
        `因为 a[${right}] ≤ pivot，i 增至 ${event.i} 后与 j=${event.j} 交换，把较小（或相等）的元素收进左侧前缀。当前数组变为 [${event.array.join(", ")}]。`,
      snapshot: barsSnapshot({
        array: event.array,
        active: [left, right],
        swap: [left, right],
        sorted,
        pointers: {
          lo: event.lo,
          hi: event.hi,
          pivot: event.pivotIndex ?? event.hi,
          i: event.i ?? left,
          j: event.j ?? right,
        },
      }),
      code_highlight: codeOverlay({
        activeLine: 10,
        activeLines: [10],
        variables: {
          i: String(event.i),
          j: String(event.j),
          pivot: String(event.pivotValue),
          swapped: `${left}<->${right}`,
          array: `[${event.array.join(",")}]`,
        },
        operation: "swap into left partition",
      }),
      questions: [
        ["这次交换保证了什么？", `下标 ${left} 进入 ≤ pivot 前缀，较大元素被推到更右侧等待后续处理。`],
        ["如果 i 已经等于 j 还要交换吗？", "不需要。元素已在前缀边界上，原地即可。"],
        ["pivot 此时移动了吗？", "没有。pivot 仍停在 hi，真正归位发生在扫描结束后的最后一次交换。"],
      ],
    };
  }

  if (event.kind === "place_pivot") {
    const leftEnd = (event.pivotIndex ?? 0) - 1;
    const rightStart = (event.pivotIndex ?? 0) + 1;
    const leftDesc =
      leftEnd >= event.lo
        ? `a[${event.lo}..${leftEnd}] 均 ≤ ${event.pivotValue}`
        : "左侧为空";
    const rightDesc =
      rightStart <= event.hi
        ? `a[${rightStart}..${event.hi}] 均 > ${event.pivotValue}`
        : "右侧为空";
    return {
      step_id: `quick-place-${event.partitionId + 1}`,
      title: `pivot ${event.pivotValue} 归位到索引 ${event.pivotIndex}`,
      voiceover_text:
        `扫描结束，把 pivot 与 a[i+1] 交换，归位到索引 ${event.pivotIndex}。不变式：${leftDesc}；pivot 就位；${rightDesc}。已固定位置记入 sorted。`,
      snapshot: barsSnapshot({
        array: event.array,
        active: event.pivotIndex == null ? [] : [event.pivotIndex],
        swap: event.swapPair ?? [],
        sorted,
        pointers: {
          lo: event.lo,
          hi: event.hi,
          pivot: event.pivotIndex ?? event.hi,
          i: event.i ?? event.lo - 1,
        },
      }),
      code_highlight: codeOverlay({
        activeLine: 12,
        activeLines: [12, 13],
        variables: {
          lo: String(event.lo),
          hi: String(event.hi),
          pivotIndex: String(event.pivotIndex),
          pivot: String(event.pivotValue),
          invariant: "left<=pivot < right",
        },
        operation: "place pivot",
      }),
      questions: [
        ["pivot 的最终下标是多少？", `p = ${event.pivotIndex}，值 ${event.pivotValue} 已在最终有序位置上。`],
        ["分区不变式如何表述？", "对 Lomuto（比较用 ≤）：左侧 ≤ pivot，右侧 > pivot，pivot 位于 p。"],
        ["接下来递归谁？", `先递归 [${event.lo}, ${(event.pivotIndex ?? 0) - 1}]，再递归 [${(event.pivotIndex ?? 0) + 1}, ${event.hi}]。`],
      ],
    };
  }

  // done
  return {
    step_id: "quick-result",
    title: "排序完成与复杂度",
    voiceover_text:
      `数组已完全有序：[${event.array.join(", ")}]。平均时间 O(n log n)，因每层分区合计约 O(n)、递归深度约 log n；若 pivot 总是极端值，递归退化成链，最坏 O(n²)。空间主要是递归栈。`,
    snapshot: barsSnapshot({
      array: event.array,
      active: [],
      sorted: event.array.map((_, idx) => idx),
      pointers: {},
    }),
    code_highlight: codeOverlay({
      activeLine: 1,
      activeLines: [0, 1, 2, 3, 4],
      variables: {
        result: `[${event.array.join(",")}]`,
        average: "O(n log n)",
        worst: "O(n^2)",
        strategy: "Lomuto / last",
      },
      operation: "sorted summary",
    }),
    questions: [
      ["最终结果是什么？", `升序结果为 [${event.array.join(", ")}]。`],
      ["为什么平均是 O(n log n)？", "若 pivot 大致均匀切开，递归树高度约 log n，每层分区扫描合计 O(n)。"],
      ["最坏 O(n²) 何时出现？", "pivot 长期取到最小或最大元素时，一边为空，递归深度变成 n。"],
    ],
  };
}

function resolvePivotStrategy(params: TemplatePreviewParams): QuickSortPivotStrategy {
  return stringParam(params, "pivotStrategy", PIVOT_STRATEGIES, "last") as QuickSortPivotStrategy;
}

export function buildQuickSortScript(params: TemplatePreviewParams = {}): PlaybookScript {
  const pivotStrategy = resolvePivotStrategy(params);
  void pivotStrategy; // v1 only supports last/Lomuto; param kept for catalog controls
  const values = [...QUICK_SORT_VALUES];
  const trace = buildQuickSortTrace(values);
  const teachingEvents = pickTeachingEvents(trace);
  const drafts = teachingEvents.map((event, index) => draftFromEvent(event, index));

  // Ensure unique step ids even if picker collides on labels.
  const usedIds = new Set<string>();
  const steps: MetaStep[] = drafts.map((draft, index) => {
    let stepId = draft.step_id;
    if (usedIds.has(stepId)) {
      stepId = `${draft.step_id}-n${index}`;
    }
    usedIds.add(stepId);
    return algorithmStep(index, {
      step_id: stepId,
      title: draft.title,
      voiceover_text: draft.voiceover_text,
      snapshot: draft.snapshot,
      code_highlight: draft.code_highlight,
    });
  });

  return buildAlgorithmPlaybook({
    domain: "algorithm",
    title: "快速排序：Lomuto 分区与递归",
    summary:
      "用 last-element pivot 的 Lomuto 分区演示 [3,6,1,8,2,5,4,7]：选 pivot、扫描交换、pivot 归位，再递归左右区间。平均 O(n log n)，最坏 O(n²)。",
    algorithmId: "quick_sort",
    steps,
    controls: [
      {
        id: "pivotStrategy",
        label: "pivot 策略",
        value: pivotStrategy,
        description: "v1 仅支持 last（Lomuto：取区间最后一个元素为 pivot）。",
      },
    ],
    initialData: {
      array: values.map(String),
      pivotStrategy: [pivotStrategy],
      scene_blueprint: ["quick_sort"],
      teaching_phases: ["观察", "分区", "递归", "总结"],
    },
  });
}

export function buildQuickSortFollowups(
  params: TemplatePreviewParams = {},
  script?: PlaybookScript,
): TemplatePreviewFollowups {
  const pivotStrategy = resolvePivotStrategy(params);
  void pivotStrategy;
  const resolved = script ?? buildQuickSortScript(params);
  const values = [...QUICK_SORT_VALUES];
  const trace = buildQuickSortTrace(values);
  const teachingEvents = pickTeachingEvents(trace);
  const drafts = teachingEvents.map((event, index) => draftFromEvent(event, index));

  const followups: TemplatePreviewFollowups = {};
  resolved.steps.forEach((step, index) => {
    const draft = drafts[index];
    const triples = draft?.questions ?? [
      ["这一步在做什么？", step.voiceover_text],
      ["pivot 策略是什么？", "Lomuto，pivot 取区间最后一个元素。"],
      ["复杂度如何？", "平均 O(n log n)，最坏 O(n²)。"],
    ];
    const [first, second, third] = triples;
    followups[step.step_id] = algorithmQuestions(
      step.step_id,
      first ?? ["这一步在做什么？", step.voiceover_text],
      second ?? ["pivot 策略是什么？", "Lomuto，pivot 取区间最后一个元素。"],
      third,
    );
  });
  return followups;
}

export const QUICK_SORT_PREVIEW_CASE = defineAlgorithmPreviewCase({
  id: "quick-sort",
  posterAlt: "快速排序 Lomuto 分区演示：pivot、扫描指针与归位",
  posterFrame: 225,
  defaultParams: {
    pivotStrategy: "last",
  },
  controls: [
    {
      id: "pivotStrategy",
      kind: "select",
      label: "pivot 策略",
      description: "v1 仅开放 last（Lomuto 取末元素）。",
      resetPlayback: true,
      options: [{ label: "末元素 (Lomuto)", value: "last" }],
    },
  ],
  buildScript: buildQuickSortScript,
  buildFollowups: buildQuickSortFollowups,
});
