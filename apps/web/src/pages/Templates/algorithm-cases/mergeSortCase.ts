import type {
  AlgorithmBarsSnapshot,
  MetaStep,
  PlaybookScript,
} from "../../../features/playbook/engine/types";
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

/** Catalog prompt array: 分治与合并全程可读，步数可控。 */
export const MERGE_SORT_VALUES = [5, 2, 8, 1, 9, 3, 7, 4] as const;

export const MERGE_SORT_SORTED = [1, 2, 3, 4, 5, 7, 8, 9] as const;

export const MERGE_SORT_CODE = [
  "function mergeSort(arr) {",
  "  if (arr.length <= 1) return arr;",
  "  const mid = Math.floor(arr.length / 2);",
  "  const left = mergeSort(arr.slice(0, mid));",
  "  const right = mergeSort(arr.slice(mid));",
  "  return merge(left, right);",
  "}",
  "function merge(left, right) {",
  "  const out = [];",
  "  while (left.length && right.length) {",
  "    out.push(left[0] <= right[0] ? left.shift() : right.shift());",
  "  }",
  "  return out.concat(left, right);",
  "}",
] as const;

const ORDER_OPTIONS = ["ascending"] as const;

export type MergeSortOrder = (typeof ORDER_OPTIONS)[number];

export function resolveMergeSortOrder(params: TemplatePreviewParams): MergeSortOrder {
  return stringParam(params, "order", ORDER_OPTIONS, "ascending") as MergeSortOrder;
}

function indices(from: number, toExclusive: number): number[] {
  const out: number[] = [];
  for (let i = from; i < toExclusive; i += 1) out.push(i);
  return out;
}

export function barsSnapshot(
  values: readonly number[],
  opts: {
    active?: readonly number[];
    sorted?: readonly number[];
    swap?: readonly number[];
    pointers?: Record<string, number>;
  } = {},
): AlgorithmBarsSnapshot {
  return {
    kind: "algorithm_bars",
    array_values: values.map(String),
    numeric_values: [...values],
    active_indices: [...(opts.active ?? [])],
    swap_indices: [...(opts.swap ?? [])],
    sorted_indices: [...(opts.sorted ?? [])].sort((a, b) => a - b),
    pointers: { ...(opts.pointers ?? {}) },
  };
}

/** 合并两段已排序子数组，返回写入过程中的数组快照序列。 */
export function mergeRangeSteps(
  source: readonly number[],
  lo: number,
  mid: number,
  hi: number,
): number[][] {
  const arr = [...source];
  const left = arr.slice(lo, mid);
  const right = arr.slice(mid, hi);
  const frames: number[][] = [];
  let i = 0;
  let j = 0;
  let k = lo;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) {
      arr[k] = left[i];
      i += 1;
    } else {
      arr[k] = right[j];
      j += 1;
    }
    frames.push([...arr]);
    k += 1;
  }
  while (i < left.length) {
    arr[k] = left[i];
    i += 1;
    frames.push([...arr]);
    k += 1;
  }
  while (j < right.length) {
    arr[k] = right[j];
    j += 1;
    frames.push([...arr]);
    k += 1;
  }
  return frames;
}

interface ScriptBeat {
  step_id: string;
  title: string;
  voiceover_text: string;
  values: readonly number[];
  active: readonly number[];
  sorted: readonly number[];
  pointers: Record<string, number>;
  active_line: number;
  active_lines: number[];
  variables: Record<string, string>;
  operation_label: string;
}

/**
 * 将完整递归压成「整段划分 → 成对归并 → 半区归并 → 最终归并」代表步，
 * 保证正确性与可读步数（约 12–14 步）。
 */
export function buildMergeSortBeats(): ScriptBeat[] {
  const n = MERGE_SORT_VALUES.length;
  let values: number[] = [...MERGE_SORT_VALUES];

  const beats: ScriptBeat[] = [
    {
      step_id: "merge-intro",
      title: "观察无序数组",
      voiceover_text:
        "归并排序先分治再合并。当前数组是 [5, 2, 8, 1, 9, 3, 7, 4]，长度 8，先把它看成一整段。",
      values,
      active: indices(0, n),
      sorted: [],
      pointers: { left: 0, right: n - 1 },
      active_line: 0,
      active_lines: [0],
      variables: { n: String(n), array: values.join(",") },
      operation_label: "observe input",
    },
    {
      step_id: "merge-first-split",
      title: "第一次对半划分",
      voiceover_text:
        "取中点 mid = 4，左半区索引 [0, 4)，右半区 [4, 8)。两侧之后各自递归排序，再合并。",
      values,
      active: [],
      sorted: [],
      pointers: { left: 0, mid: 4, right: n - 1 },
      active_line: 2,
      active_lines: [2, 3, 4],
      variables: { left: "[5,2,8,1]", right: "[9,3,7,4]", mid: "4" },
      operation_label: "split full range",
    },
    {
      step_id: "merge-left-depth",
      title: "左半区继续下探",
      voiceover_text:
        "左半 [5, 2, 8, 1] 再分成 [5, 2] 与 [8, 1]。再往下就是长度为 1 的有序单点，可以开始两两合并。",
      values,
      active: indices(0, 4),
      sorted: [],
      pointers: { left: 0, mid: 2, right: 3 },
      active_line: 3,
      active_lines: [1, 2, 3],
      variables: { range: "[0,4)", left: "[5,2]", right: "[8,1]" },
      operation_label: "split left half",
    },
  ];

  // 合并 [5,2] → [2,5]
  {
    const frames = mergeRangeSteps(values, 0, 1, 2);
    values = frames.at(-1)!;
    beats.push({
      step_id: "merge-pair-02",
      title: "合并相邻单点 [5,2]",
      voiceover_text:
        "比较 5 与 2，较小的 2 先写入，再写入 5，得到局部有序 [2, 5]。不变量：合并结果覆盖原区间且有序。",
      values,
      active: [0, 1],
      sorted: indices(0, 2),
      pointers: { left: 0, mid: 1, right: 1 },
      active_line: 10,
      active_lines: [7, 9, 10],
      variables: { left: "5", right: "2", written: "2,5" },
      operation_label: "merge pair [0,2)",
    });
  }

  // 合并 [8,1] → [1,8]
  {
    const frames = mergeRangeSteps(values, 2, 3, 4);
    values = frames.at(-1)!;
    beats.push({
      step_id: "merge-pair-18",
      title: "合并相邻单点 [8,1]",
      voiceover_text:
        "同样比较 8 与 1，写入顺序为 1、8，左半区现在是两段有序子数组 [2, 5] 与 [1, 8]。",
      values,
      active: [2, 3],
      sorted: indices(0, 4),
      pointers: { left: 2, mid: 3, right: 3 },
      active_line: 10,
      active_lines: [7, 9, 10],
      variables: { left: "8", right: "1", written: "1,8" },
      operation_label: "merge pair [2,4)",
    });
  }

  // 合并左半 [2,5] + [1,8] → [1,2,5,8]
  {
    const frames = mergeRangeSteps(values, 0, 2, 4);
    // 取中间一帧展示比较中的 active，再取终态
    const midFrame = frames[Math.min(1, frames.length - 1)];
    beats.push({
      step_id: "merge-left-progress",
      title: "合并左半区：比较写入",
      voiceover_text:
        "双指针比较两段有序头元素：1 小于 2，先写 1；再比较 2 与 8，写 2。已写入位置成为局部有序前缀。",
      values: midFrame,
      active: [0, 1],
      sorted: indices(0, 2),
      pointers: { i: 1, j: 2, k: 2 },
      active_line: 10,
      active_lines: [9, 10],
      variables: { leftHead: "2", rightHead: "1", outPrefix: midFrame.slice(0, 2).join(",") },
      operation_label: "merge left half progress",
    });
    values = frames.at(-1)!;
    beats.push({
      step_id: "merge-left-done",
      title: "左半区已有序",
      voiceover_text:
        "左半区合并完成，得到 [1, 2, 5, 8]。右侧 [9, 3, 7, 4] 用同样的分治与合并处理。",
      values,
      active: [],
      sorted: indices(0, 4),
      pointers: { left: 0, mid: 4, right: 3 },
      active_line: 5,
      active_lines: [5, 12],
      variables: { leftSorted: "1,2,5,8", rightPending: "9,3,7,4" },
      operation_label: "left half sorted",
    });
  }

  // 右半成对合并
  {
    const frames = mergeRangeSteps(values, 4, 5, 6);
    values = frames.at(-1)!;
    beats.push({
      step_id: "merge-pair-93",
      title: "右半：合并 [9,3]",
      voiceover_text: "右半先处理 [9, 3]：3 小于 9，写入后得到局部有序 [3, 9]。",
      values,
      active: [4, 5],
      sorted: [...indices(0, 4), ...indices(4, 6)],
      pointers: { left: 4, mid: 5, right: 5 },
      active_line: 10,
      active_lines: [7, 10],
      variables: { pair: "9,3", written: "3,9" },
      operation_label: "merge pair [4,6)",
    });
  }

  {
    const frames = mergeRangeSteps(values, 6, 7, 8);
    values = frames.at(-1)!;
    beats.push({
      step_id: "merge-pair-74",
      title: "右半：合并 [7,4]",
      voiceover_text: "再合并 [7, 4] 为 [4, 7]。右半现为两段有序子数组 [3, 9] 与 [4, 7]。",
      values,
      active: [6, 7],
      sorted: [...indices(0, 4), ...indices(4, 8)],
      pointers: { left: 6, mid: 7, right: 7 },
      active_line: 10,
      active_lines: [7, 10],
      variables: { pair: "7,4", written: "4,7" },
      operation_label: "merge pair [6,8)",
    });
  }

  {
    const frames = mergeRangeSteps(values, 4, 6, 8);
    const written = Math.min(3, frames.length);
    const midFrame = frames[written - 1];
    beats.push({
      step_id: "merge-right-progress",
      title: "合并右半区：比较写入",
      voiceover_text:
        "比较 3 与 4、9 与 4 等头元素，按升序写回右半区。合并只线性扫描两边，不回头打乱已排序子段。",
      values: midFrame,
      active: [4, 5, 6],
      sorted: [...indices(0, 4), ...indices(4, 4 + written)],
      pointers: { i: 5, j: 6, k: 4 + written },
      active_line: 10,
      active_lines: [9, 10],
      variables: {
        leftHead: "3",
        rightHead: "4",
        outPrefix: midFrame.slice(4, 4 + written).join(","),
      },
      operation_label: "merge right half progress",
    });
    values = frames.at(-1)!;
    beats.push({
      step_id: "merge-right-done",
      title: "右半区已有序",
      voiceover_text:
        "右半区合并完成，得到 [3, 4, 7, 9]。现在左右两大段都已有序，只差最后一次全局合并。",
      values,
      active: [],
      sorted: indices(0, 8),
      pointers: { left: 0, mid: 4, right: 7 },
      active_line: 5,
      active_lines: [4, 5],
      variables: { leftSorted: "1,2,5,8", rightSorted: "3,4,7,9" },
      operation_label: "right half sorted",
    });
  }

  // 最终合并
  {
    const frames = mergeRangeSteps(values, 0, 4, 8);
    const early = frames[Math.min(2, frames.length - 1)];
    beats.push({
      step_id: "merge-final-progress",
      title: "最终合并：双指针推进",
      voiceover_text:
        "比较左段头 1 与右段头 3，写入更小的 1，再比较 2 与 3。sorted 前缀不断扩大，这是归并的核心不变量。",
      values: early,
      active: [0, 1, 2],
      sorted: indices(0, 3),
      pointers: { i: 2, j: 4, k: 3 },
      active_line: 10,
      active_lines: [9, 10, 12],
      variables: {
        left: "1,2,5,8",
        right: "3,4,7,9",
        outPrefix: early.slice(0, 3).join(","),
      },
      operation_label: "final merge progress",
    });

    const late = frames[Math.min(5, frames.length - 1)];
    beats.push({
      step_id: "merge-final-tail",
      title: "最终合并：收尾写回",
      voiceover_text:
        "一侧耗尽后，把另一侧剩余元素依次接上。整段 [0, 8) 被写回为完全有序序列。",
      values: late,
      active: [5, 6],
      sorted: indices(0, 6),
      pointers: { k: 6, right: 7 },
      active_line: 12,
      active_lines: [11, 12],
      variables: {
        remaining: late.slice(6).join(","),
        outPrefix: late.slice(0, 6).join(","),
      },
      operation_label: "final merge tail",
    });

    values = frames.at(-1)!;
  }

  beats.push({
    step_id: "merge-result",
    title: "得到完全有序数组",
    voiceover_text:
      "排序完成：[1, 2, 3, 4, 5, 7, 8, 9]。每层合并都保证子区间有序，上层合并才能正确拼接。",
    values,
    active: [],
    sorted: indices(0, n),
    pointers: {},
    active_line: 5,
    active_lines: [5, 12],
    variables: { result: values.join(","), n: String(n) },
    operation_label: "sorted result",
  });

  beats.push({
    step_id: "merge-complexity",
    title: "复杂度：O(n log n)",
    voiceover_text:
      "划分深度约 log n 层，每层合并总共扫描 n 个元素，因此时间复杂度 O(n log n)；额外数组带来 O(n) 空间。",
    values,
    active: [],
    sorted: indices(0, n),
    pointers: {},
    active_line: 2,
    active_lines: [2, 5, 10],
    variables: {
      time: "O(n log n)",
      space: "O(n)",
      levels: String(Math.log2(n)),
    },
    operation_label: "complexity summary",
  });

  return beats;
}

function beatToStep(index: number, beat: ScriptBeat): MetaStep {
  return algorithmStep(index, {
    step_id: beat.step_id,
    title: beat.title,
    voiceover_text: beat.voiceover_text,
    snapshot: barsSnapshot(beat.values, {
      active: beat.active,
      sorted: beat.sorted,
      pointers: beat.pointers,
    }),
    code_highlight: {
      language: "typescript",
      lines: [...MERGE_SORT_CODE],
      active_line: beat.active_line,
      active_lines: beat.active_lines,
      variables: beat.variables,
      operation_label: beat.operation_label,
    },
  });
}

export function buildMergeSortScript(params: TemplatePreviewParams): PlaybookScript {
  const order = resolveMergeSortOrder(params);
  const beats = buildMergeSortBeats();
  const steps = beats.map((beat, index) => beatToStep(index, beat));

  return buildAlgorithmPlaybook({
    domain: "algorithm",
    title: "归并排序：分治与合并",
    summary:
      "用固定数组展示划分、两两合并、半区合并与最终归并，强调合并后子区间保持有序。",
    algorithmId: "merge_sort",
    steps,
    controls: [
      {
        id: "order",
        label: "排序方向",
        value: order,
        description: "当前示例固定为升序归并，后续可扩展降序对照。",
      },
    ],
    initialData: {
      array: MERGE_SORT_VALUES.map(String),
      order: [order],
      scene_blueprint: ["merge_sort"],
      teaching_phases: ["观察", "划分", "合并", "总结"],
    },
  });
}

export function buildMergeSortFollowups(
  _params: TemplatePreviewParams,
  script: PlaybookScript,
): TemplatePreviewFollowups {
  const followups: TemplatePreviewFollowups = {
    "merge-intro": algorithmQuestions(
      "merge-intro",
      ["归并排序的基本思路是什么？", "先把区间对半划分，递归排序两侧，再把两段有序序列合并。"],
      ["为什么先观察整段数组？", "先建立问题规模与无序现状，后续每一步都对照同一数组下标。"],
      ["长度为 1 时为什么不用再分？", "单元素天然有序，是递归的基本情况。"],
    ),
    "merge-first-split": algorithmQuestions(
      "merge-first-split",
      ["mid 为什么取 4？", "长度 8 时 mid = floor(8/2) = 4，左右各 4 个元素。"],
      ["左右半区各自会做什么？", "各自递归执行同样的划分与合并，直到长度为 1。"],
      ["划分本身会排序吗？", "不会。划分只缩小问题，真正产生有序性的是合并阶段。"],
    ),
    "merge-left-depth": algorithmQuestions(
      "merge-left-depth",
      ["左半区如何继续划分？", "把 [5,2,8,1] 再分成 [5,2] 与 [8,1]。"],
      ["何时开始合并？", "当子区间已经是有序段（含单点）时，回溯过程中开始 merge。"],
      ["指针 left/mid/right 表示什么？", "当前关注的子区间端点与中点，方便对照数组下标。"],
    ),
    "merge-pair-02": algorithmQuestions(
      "merge-pair-02",
      ["这一步写入顺序为什么是 2、5？", "2 小于 5，升序合并时较小头元素先进入结果。"],
      ["合并后的不变量是什么？", "区间 [0,2) 被覆盖为有序，且包含原有全部元素。"],
      ["sorted_indices 标出了什么？", "已经完成合并、在当前子问题中保持有序的下标。"],
    ),
    "merge-pair-18": algorithmQuestions(
      "merge-pair-18",
      ["[8,1] 合并后为何是 [1,8]？", "1 更小先写，再写 8，得到升序局部结果。"],
      ["左半区现在处于什么状态？", "两段长度为 2 的有序子数组，等待更高层合并。"],
      ["active_indices 为何指向 2 和 3？", "本步正在处理并写回的是这两个位置。"],
    ),
    "merge-left-progress": algorithmQuestions(
      "merge-left-progress",
      ["双指针如何选择下一个写入值？", "比较两段当前头元素，取较小者写入并推进该侧指针。"],
      ["为什么可以相信合并结果正确？", "两侧输入已有序，头元素比较就能决定全局下一最小值。"],
      ["这一步展示了什么教学重点？", "合并过程是线性扫描，而不是重新排序整个半区。"],
    ),
    "merge-left-done": algorithmQuestions(
      "merge-left-done",
      ["左半最终结果是什么？", "[1, 2, 5, 8]，覆盖原下标 [0,4)。"],
      ["右半为什么还没动完？", "分治是先深入一侧或按递归回溯顺序处理，本示意先完成左半代表路径。"],
      ["代码高亮为何落在 return merge？", "左半递归与合并已经得到返回值，准备处理右半。"],
    ),
    "merge-pair-93": algorithmQuestions(
      "merge-pair-93",
      ["右半第一步合并了谁？", "相邻单点 9 与 3，结果为 [3, 9]。"],
      ["与左半的成对合并有何相同？", "都是把两个有序段（此处是单点）合成更长有序段。"],
      ["为何左侧 sorted 仍然保留？", "已完成的左半有序段在后续步骤中继续标记，便于对照进度。"],
    ),
    "merge-pair-74": algorithmQuestions(
      "merge-pair-74",
      ["[7,4] 合并结果是什么？", "[4, 7]。"],
      ["右半此时有几段有序子数组？", "两段：[3,9] 与 [4,7]，长度均为 2。"],
      ["下一步要做什么？", "把这两段合并成完整右半区 [3,4,7,9]。"],
    ),
    "merge-right-progress": algorithmQuestions(
      "merge-right-progress",
      ["合并右半时扫描次数与区间长度关系？", "每个元素最多被读写常数次，总工作量与区间长度成正比。"],
      ["active 下标在强调什么？", "当前正在比较或刚写入的位置，帮助学生跟踪双指针。"],
      ["能否打乱左半已排序结果？", "不能。合并只写回当前目标区间，左半已完成段保持不变。"],
    ),
    "merge-right-done": algorithmQuestions(
      "merge-right-done",
      ["右半最终结果是什么？", "[3, 4, 7, 9]。"],
      ["为何现在可以做全局合并？", "因为左右两大段都已各自有序，满足 merge 的前置条件。"],
      ["若缺了右半排序会怎样？", "最终 merge 不能保证正确的全局升序。"],
    ),
    "merge-final-progress": algorithmQuestions(
      "merge-final-progress",
      ["最终合并比较的是哪两个头？", "左段头 1 与右段头 3，先写入 1。"],
      ["sorted 前缀扩大说明什么？", "已经确定最终位置的元素在增多，结果逐步稳定。"],
      ["这一层合并的代价大约是多少？", "大约 O(n)，因为要扫描全部 n 个元素一次。"],
    ),
    "merge-final-tail": algorithmQuestions(
      "merge-final-tail",
      ["一侧耗尽后如何处理？", "把另一侧剩余元素按原顺序追加到结果。"],
      ["为什么剩余段可以直接接上？", "剩余段内部已有序，且不小于已写入的所有值。"],
      ["收尾阶段还需要比较吗？", "不需要，直接拷贝剩余元素即可。"],
    ),
    "merge-result": algorithmQuestions(
      "merge-result",
      ["最终数组是什么？", "[1, 2, 3, 4, 5, 7, 8, 9]。"],
      ["归并排序正确性依赖什么？", "递归子问题正确，加上 merge 能把两段有序序列合成更长有序序列。"],
      ["与原地交换类排序相比特点是什么？", "主要靠额外缓冲做稳定合并，而不是元素两两交换。"],
    ),
    "merge-complexity": algorithmQuestions(
      "merge-complexity",
      ["为什么时间是 O(n log n)？", "约 log n 层划分，每层合并总量为 O(n)，相乘得到 O(n log n)。"],
      ["空间为什么是 O(n)？", "合并时通常需要与区间等长的辅助数组存放写回结果。"],
      ["层数从哪里来？", "每次对半划分，深度约为 log2(n)；本例 n=8，约 3 层。"],
    ),
  };

  // 保证 script 中每个 step 都有 follow-up（防止漏配）
  for (const step of script.steps) {
    if (!followups[step.step_id]) {
      followups[step.step_id] = algorithmQuestions(
        step.step_id,
        ["这一步在做什么？", step.voiceover_text],
        ["和前后步骤如何衔接？", "延续分治或合并的同一条执行路径。"],
        ["需要记住的不变量是什么？", "已合并子区间保持有序。"],
      );
    }
  }

  return followups;
}

export const MERGE_SORT_PREVIEW_CASE = defineAlgorithmPreviewCase({
  id: "merge-sort",
  posterAlt: "归并排序分治与合并过程示意",
  posterFrame: 495,
  defaultParams: { order: "ascending" },
  controls: [
    {
      id: "order",
      kind: "select",
      label: "排序方向",
      description: "v1 仅提供升序演示，参数用于对齐控件协议。",
      resetPlayback: true,
      options: [{ label: "升序", value: "ascending" }],
    },
  ],
  buildScript: buildMergeSortScript,
  buildFollowups: buildMergeSortFollowups,
});
