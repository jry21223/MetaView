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
  finiteNumber,
} from "./helpers";

/** Classic fixed-window demo array. */
export const SLIDING_WINDOW_VALUES = [1, 3, -1, -3, 5, 3, 6, 7] as const;

export const SLIDING_WINDOW_SIZES = [2, 3, 4] as const;
export type SlidingWindowSize = (typeof SLIDING_WINDOW_SIZES)[number];

const DEFAULT_WINDOW_SIZE: SlidingWindowSize = 3;

const SLIDING_WINDOW_CODE = [
  "function maxSlidingWindow(nums: number[], k: number): number[] {",
  "  const deque: number[] = [];",
  "  const result: number[] = [];",
  "  for (let i = 0; i < nums.length; i++) {",
  "    while (deque.length && deque[0] <= i - k) deque.shift();",
  "    while (deque.length && nums[deque.at(-1)!] <= nums[i]) deque.pop();",
  "    deque.push(i);",
  "    if (i >= k - 1) result.push(nums[deque[0]]);",
  "  }",
  "  return result;",
  "}",
];

export interface SlidingWindowFrame {
  /** Inclusive left bound of the current window. */
  left: number;
  /** Inclusive right bound of the current window. */
  right: number;
  /** Index of the current window maximum (deque front). */
  maxIndex: number;
  /** Current window maximum value. */
  maxValue: number;
  /** Maxima collected so far (one per completed window). */
  maxima: number[];
  /** Monotonic deque of indices (decreasing values). */
  deque: number[];
}

function isAllowedWindowSize(value: number): value is SlidingWindowSize {
  return (SLIDING_WINDOW_SIZES as readonly number[]).includes(value);
}

/** Resolve and clamp `windowSize` from preview params. */
export function resolveWindowSize(params: TemplatePreviewParams): SlidingWindowSize {
  const raw = Math.round(finiteNumber(params, "windowSize", DEFAULT_WINDOW_SIZE));
  return isAllowedWindowSize(raw) ? raw : DEFAULT_WINDOW_SIZE;
}

/**
 * Pure O(n) sliding-window maximum trace using a monotonic decreasing deque of indices.
 * Emits one frame per completed window (when right >= k - 1).
 */
export function slidingWindowTrace(
  values: readonly number[],
  windowSize: number,
): SlidingWindowFrame[] {
  const k = Math.max(1, Math.min(windowSize, values.length));
  const deque: number[] = [];
  const maxima: number[] = [];
  const frames: SlidingWindowFrame[] = [];

  for (let right = 0; right < values.length; right += 1) {
    while (deque.length > 0 && deque[0]! <= right - k) {
      deque.shift();
    }
    while (deque.length > 0 && values[deque[deque.length - 1]!]! <= values[right]!) {
      deque.pop();
    }
    deque.push(right);

    if (right >= k - 1) {
      const left = right - k + 1;
      const maxIndex = deque[0]!;
      const maxValue = values[maxIndex]!;
      maxima.push(maxValue);
      frames.push({
        left,
        right,
        maxIndex,
        maxValue,
        maxima: [...maxima],
        deque: [...deque],
      });
    }
  }

  return frames;
}

function slidingSnapshot(args: {
  left: number | null;
  right: number | null;
  maxIndex: number | null;
  deque?: readonly number[];
  maxima?: readonly number[];
  enteringIndex?: number;
  leavingIndex?: number;
}): MetaStep["snapshot"] {
  const values = [...SLIDING_WINDOW_VALUES];
  const { left, right, maxIndex } = args;

  const pointers: Record<string, number> = {};
  if (left != null) pointers.left = left;
  if (right != null) pointers.right = right;
  if (maxIndex != null) pointers.max = maxIndex;

  const elementStates: Record<number, Array<"entering" | "leaving" | "maximum">> = {};
  const addElementState = (
    index: number | undefined | null,
    state: "entering" | "leaving" | "maximum",
  ) => {
    if (index == null || index < 0 || index >= values.length) return;
    elementStates[index] = [...(elementStates[index] ?? []), state];
  };
  addElementState(args.enteringIndex, "entering");
  addElementState(args.leavingIndex, "leaving");
  addElementState(maxIndex, "maximum");

  const ranges =
    left != null && right != null && left <= right
      ? [{
          id: "active-window",
          start: left,
          end: right,
          role: "window" as const,
          label: `window k=${right - left + 1}`,
          emphasis: "primary" as const,
        }]
      : [];
  const deque = args.deque ?? [];
  const maxima = args.maxima ?? [];

  return {
    kind: "algorithm_array",
    array_values: values.map(String),
    active_indices: maxIndex == null ? [] : [maxIndex],
    swap_indices: [],
    sorted_indices: [],
    pointers,
    ranges,
    element_states: elementStates,
    auxiliary_lanes: [
      {
        id: "monotonic-deque",
        role: "deque",
        label: "MONOTONIC DEQUE · indices",
        items: deque.map((index, position) => ({
          id: `deque-${position}-${index}`,
          label: `i=${index}`,
          value: `nums[i]=${values[index]}`,
          index,
          emphasis: position === 0 ? "primary" : "secondary",
        })),
      },
      {
        id: "window-maxima",
        role: "result",
        label: "RESULT",
        items: maxima.map((value, index) => ({
          id: `result-${index}`,
          label: String(value),
          emphasis: index === maxima.length - 1 ? "accent" : "muted",
        })),
      },
    ],
  };
}

function codeHighlight(
  activeLine: number,
  variables: Record<string, string>,
  operationLabel: string,
  activeLines: number[] = [activeLine],
) {
  return {
    language: "typescript",
    lines: SLIDING_WINDOW_CODE,
    active_lines: activeLines,
    active_line: activeLine,
    variables,
    operation_label: operationLabel,
  };
}

export function buildSlidingWindowScript(params: TemplatePreviewParams): PlaybookScript {
  const windowSize = resolveWindowSize(params);
  const values = [...SLIDING_WINDOW_VALUES];
  const frames = slidingWindowTrace(values, windowSize);
  const first = frames[0];
  const last = frames.at(-1);

  const steps: MetaStep[] = [
    algorithmStep(0, {
      step_id: "sliding-intro",
      title: "固定窗口最大值",
      voiceover_text: `给定数组 [${values.join(", ")}]，窗口大小 k 等于 ${windowSize}。目标是求每个连续长度为 k 的子数组的最大值。`,
      snapshot: slidingSnapshot({
        left: 0,
        right: windowSize - 1,
        maxIndex: null,
        deque: [],
        maxima: [],
      }),
      code_highlight: codeHighlight(
        0,
        { k: String(windowSize), n: String(values.length) },
        "define sliding window max",
      ),
    }),
  ];

  if (first) {
    steps.push(
      algorithmStep(steps.length, {
        step_id: "sliding-first-window",
        title: "形成第一个窗口",
        voiceover_text: `右指针推进到 ${first.right}，窗口覆盖 [${first.left}, ${first.right}]。单调队列前端给出当前最大值 ${first.maxValue}。`,
        snapshot: slidingSnapshot({
          left: first.left,
          right: first.right,
          maxIndex: first.maxIndex,
          deque: first.deque,
          maxima: first.maxima,
        }),
        code_highlight: codeHighlight(
          7,
          {
            k: String(windowSize),
            left: String(first.left),
            right: String(first.right),
            max: String(first.maxValue),
            result: `[${first.maxima.join(", ")}]`,
          },
          "record first window max",
          [4, 5, 6, 7],
        ),
      }),
    );
  }

  frames.slice(1).forEach((frame, index) => {
    const slideNumber = index + 1;
    steps.push(
      algorithmStep(steps.length, {
        step_id: `sliding-slide-${slideNumber}`,
        title: `窗口右移到 ${frame.right}`,
        voiceover_text: `窗口整体右移一格，变为 [${frame.left}, ${frame.right}]。过期下标离开队列，新元素入队后，当前最大值是 ${frame.maxValue}。`,
        snapshot: slidingSnapshot({
          left: frame.left,
          right: frame.right,
          maxIndex: frame.maxIndex,
          deque: frame.deque,
          maxima: frame.maxima,
          enteringIndex: frame.right,
          leavingIndex: frames[index]?.left,
        }),
        code_highlight: codeHighlight(
          7,
          {
            k: String(windowSize),
            left: String(frame.left),
            right: String(frame.right),
            max: String(frame.maxValue),
            result: `[${frame.maxima.join(", ")}]`,
          },
          "slide and record max",
          [4, 5, 6, 7],
        ),
      }),
    );
  });

  const resultMaxima = last?.maxima ?? [];
  steps.push(
    algorithmStep(steps.length, {
      step_id: "sliding-result",
      title: "汇总全部窗口最大值",
      voiceover_text: `所有窗口最大值依次是 [${resultMaxima.join(", ")}]。每个下标最多进出单调队列一次，因此整体时间复杂度是 O(n)。`,
      snapshot: slidingSnapshot({
        left: last?.left ?? null,
        right: last?.right ?? null,
        maxIndex: last?.maxIndex ?? null,
        deque: last?.deque ?? [],
        maxima: resultMaxima,
      }),
      code_highlight: codeHighlight(
        9,
        {
          k: String(windowSize),
          result: `[${resultMaxima.join(", ")}]`,
          windows: String(frames.length),
        },
        "return result",
      ),
    }),
  );

  return buildAlgorithmPlaybook({
    title: "滑动窗口最大值：固定窗口如何滑动",
    summary: "用单调队列维护当前窗口候选最大值，解释固定窗口右移时如何在 O(n) 内得到每个窗口的答案。",
    algorithmId: "sliding_window_maximum",
    steps,
    controls: [
      {
        id: "windowSize",
        label: "窗口大小 k",
        value: String(windowSize),
        description: "修改后在固定数组上重新计算每个窗口的最大值。",
      },
    ],
    initialData: {
      array: values.map(String),
      windowSize: [String(windowSize)],
      result: resultMaxima.map(String),
    },
  });
}

export function buildSlidingWindowFollowups(
  params: TemplatePreviewParams,
): TemplatePreviewFollowups {
  const windowSize = resolveWindowSize(params);
  const values = [...SLIDING_WINDOW_VALUES];
  const frames = slidingWindowTrace(values, windowSize);
  const first = frames[0];
  const last = frames.at(-1);
  const resultMaxima = last?.maxima ?? [];

  const followups: TemplatePreviewFollowups = {
    "sliding-intro": algorithmQuestions(
      "sliding-intro",
      [
        "固定窗口最大值要求什么？",
        `对长度为 ${values.length} 的数组，依次求每个长度为 ${windowSize} 的连续子数组的最大值。`,
      ],
      [
        "为什么叫固定窗口？",
        `窗口长度始终等于 k=${windowSize}，只是整体向右平移，不会伸缩。`,
      ],
      [
        "一共会产出多少个答案？",
        `答案个数等于 n-k+1，这里是 ${values.length - windowSize + 1} 个。`,
      ],
    ),
  };

  if (first) {
    followups["sliding-first-window"] = algorithmQuestions(
      "sliding-first-window",
      [
        "第一个窗口覆盖哪些下标？",
        `覆盖闭区间 [${first.left}, ${first.right}]，对应元素 [${values
          .slice(first.left, first.right + 1)
          .join(", ")}]。`,
      ],
      [
        "当前最大值为什么是这个数？",
        `窗口内最大值是 ${first.maxValue}，对应下标 ${first.maxIndex}，由单调队列前端给出。`,
      ],
      [
        "单调队列里存什么？",
        "存下标，并保持对应值单调递减，这样队头始终是当前窗口最大值的候选。",
      ],
    );
  }

  frames.slice(1).forEach((frame, index) => {
    const slideNumber = index + 1;
    const stepId = `sliding-slide-${slideNumber}`;
    const prev = frames[index]!;
    followups[stepId] = algorithmQuestions(
      stepId,
      [
        "这一步窗口如何变化？",
        `左边界从 ${prev.left} 移到 ${frame.left}，右边界从 ${prev.right} 移到 ${frame.right}。`,
      ],
      [
        "为什么要弹出过期下标？",
        `任何小于等于 ${frame.right - windowSize} 的下标已经不在窗口内，必须从队头移除。`,
      ],
      [
        "这一轮写入的最大值是？",
        `写入 ${frame.maxValue}，目前结果序列是 [${frame.maxima.join(", ")}]。`,
      ],
    );
  });

  followups["sliding-result"] = algorithmQuestions(
    "sliding-result",
    [
      "最终答案是什么？",
      `窗口大小 ${windowSize} 时，最大值序列为 [${resultMaxima.join(", ")}]。`,
    ],
    [
      "为什么时间复杂度是 O(n)？",
      "每个下标最多入队一次、出队一次，摊还复杂度与数组长度成线性关系。",
    ],
    [
      "如果改成暴力扫窗口会怎样？",
      `每个窗口单独找最大值大约是 O(nk)，窗口很多时会明显慢于单调队列的 O(n)。`,
    ],
  );

  return followups;
}

const DEFAULT_SCRIPT = buildSlidingWindowScript({ windowSize: DEFAULT_WINDOW_SIZE });
const POSTER_FRAME = Math.min(
  4 * 90 + 45,
  Math.max(0, (DEFAULT_SCRIPT.total_frames ?? 1) - 1),
);

export const SLIDING_WINDOW_PREVIEW_CASE = defineAlgorithmPreviewCase({
  id: "sliding-window",
  posterAlt: "滑动窗口最大值：固定窗口在数组上右移并维护当前最大值",
  posterFrame: POSTER_FRAME,
  defaultParams: { windowSize: DEFAULT_WINDOW_SIZE },
  controls: [
    {
      id: "windowSize",
      kind: "select",
      label: "窗口大小 k",
      description: "切换固定窗口长度，重新计算每个窗口的最大值序列。",
      resetPlayback: true,
      options: SLIDING_WINDOW_SIZES.map((size) => ({
        label: String(size),
        value: String(size),
      })),
    },
  ],
  buildScript: buildSlidingWindowScript,
  buildFollowups: buildSlidingWindowFollowups,
});
