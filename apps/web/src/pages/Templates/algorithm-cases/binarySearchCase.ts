import type {
  AlgorithmBarsSnapshot,
  MetaStep,
} from "../../../features/playbook/engine/types";
import type { TemplatePreviewParams } from "../templatePreviewCases";
import {
  defineAlgorithmCase,
  finiteNumber,
  type AlgorithmCaseFrame,
  type AlgorithmStepDraft,
} from "./helpers";

/**
 * 二分查找：区间如何收敛。
 *
 * 固定升序数组上按 low / mid / high 收缩搜索区间，命中或落空都在同一条
 * 轨迹上解释 O(log n)。被排除的下标用 sorted 状态标出，当前候选闭区间是
 * 共享的 search_range 覆盖层。
 */
export const BINARY_VALUES = [2, 4, 7, 11, 15, 19, 22, 28, 33, 40];

const DEFAULT_TARGET = 22;

export const BINARY_CODE = [
  "let low = 0, high = values.length - 1;",
  "while (low <= high) {",
  "  const mid = Math.floor((low + high) / 2);",
  "  if (values[mid] === target) return mid;",
  "  if (values[mid] < target) low = mid + 1;",
  "  else high = mid - 1;",
  "}",
  "return -1;",
];

export interface BinaryComparison {
  low: number;
  high: number;
  mid: number;
  value: number;
  direction: "found" | "right" | "left";
}

export function resolveBinaryTarget(params: TemplatePreviewParams): number {
  return Math.round(finiteNumber(params, "target", DEFAULT_TARGET));
}

/** Pure binary-search trace: one entry per midpoint comparison. */
export function binaryTrace(target: number): BinaryComparison[] {
  const result: BinaryComparison[] = [];
  let low = 0;
  let high = BINARY_VALUES.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = BINARY_VALUES[mid];
    const direction = value === target ? "found" : value < target ? "right" : "left";
    result.push({ low, high, mid, value, direction });
    if (direction === "found") break;
    if (direction === "right") low = mid + 1;
    else high = mid - 1;
  }
  return result;
}

function binarySnapshot(
  low: number,
  high: number,
  mid: number | null,
): AlgorithmBarsSnapshot {
  const discarded = BINARY_VALUES.map((_, index) => index).filter(
    (index) => index < low || index > high,
  );
  const pointers: Record<string, number> = {};
  if (low <= high) {
    pointers.low = low;
    pointers.high = high;
  }
  if (mid != null) pointers.mid = mid;
  const ranges = low <= high
    ? [{
        id: "search-range",
        start: low,
        end: high,
        role: "search_range" as const,
        label: `search [${low}, ${high}]`,
        emphasis: "primary" as const,
      }]
    : [];
  return {
    kind: "algorithm_bars",
    array_values: BINARY_VALUES.map(String),
    numeric_values: BINARY_VALUES,
    active_indices: mid == null ? [] : [mid],
    swap_indices: [],
    sorted_indices: discarded,
    pointers,
    ranges,
  };
}

function codeHighlight(
  activeLine: number,
  variables: Record<string, string>,
  operationLabel: string,
  activeLines: number[] = [activeLine],
): NonNullable<MetaStep["code_highlight"]> {
  return {
    language: "typescript",
    lines: BINARY_CODE,
    active_lines: activeLines,
    active_line: activeLine,
    variables,
    operation_label: operationLabel,
  };
}

function buildBinarySearchSteps(
  params: TemplatePreviewParams,
): AlgorithmCaseFrame<AlgorithmBarsSnapshot> {
  const target = resolveBinaryTarget(params);
  const trace = binaryTrace(target);
  const found = trace.find((item) => item.direction === "found") ?? null;

  const steps: Array<AlgorithmStepDraft<AlgorithmBarsSnapshot>> = [
    {
      step_id: "binary-intro",
      title: "建立有序区间",
      voiceover_text: `数组已经升序排列。目标是 ${target}，搜索从完整区间开始。`,
      snapshot: binarySnapshot(0, BINARY_VALUES.length - 1, null),
      code_highlight: codeHighlight(
        0,
        { target: String(target), low: "0", high: "9" },
        "initialize search window",
      ),
      questions: [
        ["为什么数组必须有序？", "只有有序时，中点与目标的大小关系才能安全排除整整一半区间。"],
        ["low 和 high 表示什么？", "它们共同界定当前仍可能包含目标的闭区间。"],
        ["什么时候说明目标不存在？", "当 low 大于 high 时，候选闭区间为空，可以返回 -1。"],
      ],
    },
  ];

  trace.forEach((comparison, traceIndex) => {
    const directionText = comparison.direction === "found"
      ? "正好等于目标，搜索结束"
      : comparison.direction === "right"
        ? "小于目标，因此舍弃左半区"
        : "大于目标，因此舍弃右半区";
    const activeLine = comparison.direction === "found" ? 3 : comparison.direction === "right" ? 4 : 5;
    steps.push({
      step_id: `binary-compare-${traceIndex + 1}`,
      title: `比较中点 ${comparison.value}`,
      voiceover_text: `区间 [${comparison.low}, ${comparison.high}] 的中点是 ${comparison.mid}，值为 ${comparison.value}；${directionText}。`,
      snapshot: binarySnapshot(comparison.low, comparison.high, comparison.mid),
      code_highlight: codeHighlight(
        activeLine,
        {
          target: String(target),
          low: String(comparison.low),
          mid: String(comparison.mid),
          high: String(comparison.high),
          value: String(comparison.value),
        },
        comparison.direction,
        [2, activeLine],
      ),
      questions: [
        ["这一轮为什么能缩小区间？", `中点值是 ${comparison.value}，与目标 ${target} 的大小关系证明另一半不可能包含目标。`],
        ["下一轮会检查哪里？", comparison.direction === "found"
          ? `已经在索引 ${comparison.mid} 命中，不需要下一轮。`
          : comparison.direction === "right"
            ? `下一轮只保留索引 ${comparison.mid + 1} 到 ${comparison.high}。`
            : `下一轮只保留索引 ${comparison.low} 到 ${comparison.mid - 1}。`],
        ["这一轮排除了多少候选？", comparison.direction === "found"
          ? "已经命中目标，不再排除候选。"
          : `从 ${comparison.high - comparison.low + 1} 个候选缩小到不超过一半。`],
      ],
    });
  });

  const last = trace.at(-1);
  const resultLow = found?.mid ?? (last?.direction === "right" ? last.mid + 1 : last?.low ?? 0);
  const resultHigh = found?.mid ?? (last?.direction === "left" ? last.mid - 1 : last?.high ?? -1);
  steps.push({
    step_id: "binary-result",
    title: found ? "定位目标" : "确认不存在",
    voiceover_text: found
      ? `目标 ${target} 位于索引 ${found.mid}。每轮都排除一半候选，因此时间复杂度是 O(log n)。`
      : `搜索区间已经为空，目标 ${target} 不在数组中。二分查找同样只进行了 ${trace.length} 轮比较。`,
    snapshot: binarySnapshot(resultLow, resultHigh, found?.mid ?? null),
    code_highlight: codeHighlight(
      found ? 3 : 7,
      {
        target: String(target),
        result: found ? String(found.mid) : "-1",
        comparisons: String(trace.length),
      },
      found ? "target found" : "target absent",
    ),
    questions: [
      ["最终结果是什么？", found ? `目标 ${target} 位于索引 ${found.mid}。` : `目标 ${target} 不在这个数组中。`],
      ["为什么是 O(log n)？", `每轮候选数量约减半，本例经过 ${trace.length} 轮比较就得到结论。`],
      ["结束条件是什么？", found ? "中点值等于目标，立即返回该索引。" : "low 已经大于 high，候选区间为空。"],
    ],
  });

  return {
    steps,
    controls: [{
      id: "target",
      label: "目标值",
      value: String(target),
      description: "修改后在固定有序数组中重新执行二分查找。",
    }],
    initialData: { array: BINARY_VALUES.map(String), target: [String(target)] },
  };
}

export const BINARY_SEARCH_PREVIEW_CASE = defineAlgorithmCase({
  id: "binary-search",
  posterAlt: "二分查找区间逐步收敛的 Playbook 画面",
  posterStepIndex: 4,
  defaultParams: { target: DEFAULT_TARGET },
  controls: [{
    id: "target",
    kind: "number",
    label: "目标值",
    description: "固定数组中重新查找",
    min: 0,
    max: 50,
    step: 1,
    resetPlayback: true,
  }],
  title: "二分查找：区间如何收敛",
  summary: "用 low、mid、high 的连续变化解释二分查找为何每轮排除一半候选。",
  algorithmId: "binary_search",
  buildSteps: buildBinarySearchSteps,
});

export const buildBinarySearchScript = BINARY_SEARCH_PREVIEW_CASE.buildScript;
export const buildBinaryFollowups = BINARY_SEARCH_PREVIEW_CASE.buildFollowups;
