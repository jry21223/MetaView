import type {
  AlgorithmBarsSnapshot,
  MetaStep,
} from "../../../features/playbook/engine/types";
import { spokenList } from "../../../shared/lib/spokenText";
import type { TemplatePreviewParams } from "../templatePreviewCases";
import {
  defineAlgorithmCase,
  stringParam,
  type AlgorithmCaseFrame,
  type AlgorithmStepDraft,
} from "./helpers";

/**
 * 单调栈 · 下一个更大元素。
 *
 * 柱状数组表达数值大小，右侧的竖直栈列保存“还没找到答案”的下标（自底向上
 * 对应值单调递减），下方的结果轨道逐格填入答案。三种预设数组分别展示典型混合、全递减（栈只涨不落）
 * 与全递增（每步都弹出）三种行为。
 */
export const MONOTONIC_STACK_PRESETS = [
  { id: "mixed", values: [4, 2, 5, 1, 3, 6], label: "[4,2,5,1,3,6]  混合" },
  { id: "descending", values: [6, 5, 4, 3, 2, 1], label: "[6,5,4,3,2,1]  全递减" },
  { id: "ascending", values: [1, 2, 3, 4, 5, 6], label: "[1,2,3,4,5,6]  全递增" },
] as const;

export type MonotonicStackPresetId = (typeof MONOTONIC_STACK_PRESETS)[number]["id"];

const PRESET_IDS = MONOTONIC_STACK_PRESETS.map((preset) => preset.id);
const DEFAULT_PRESET: MonotonicStackPresetId = "mixed";

export const MONOTONIC_STACK_CODE = [
  "function nextGreater(nums: number[]): number[] {",
  "  const answer = new Array(nums.length).fill(-1);",
  "  const stack: number[] = [];",
  "  for (let i = 0; i < nums.length; i++) {",
  "    while (stack.length && nums[stack.at(-1)!] < nums[i]) {",
  "      answer[stack.pop()!] = nums[i];",
  "    }",
  "    stack.push(i);",
  "  }",
  "  return answer;",
  "}",
] as const;

export interface MonotonicStackFrame {
  /** Index just processed. */
  index: number;
  value: number;
  /** Indices popped by this element, bottom-most last (pop order). */
  popped: number[];
  /** Stack (indices, bottom → top) after pushing `index`. */
  stack: number[];
  /** Answers known after this frame; -1 = not yet resolved. */
  answer: number[];
}

export function resolveMonotonicPreset(params: TemplatePreviewParams): MonotonicStackPresetId {
  return stringParam(params, "preset", PRESET_IDS, DEFAULT_PRESET) as MonotonicStackPresetId;
}

export function monotonicValues(presetId: MonotonicStackPresetId): number[] {
  return [...MONOTONIC_STACK_PRESETS.find((preset) => preset.id === presetId)!.values];
}

/** Pure O(n) next-greater-element trace with a decreasing monotonic stack of indices. */
export function monotonicStackTrace(values: readonly number[]): MonotonicStackFrame[] {
  const answer = values.map(() => -1);
  const stack: number[] = [];
  const frames: MonotonicStackFrame[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    const popped: number[] = [];
    while (stack.length > 0 && values[stack[stack.length - 1]!]! < value) {
      const top = stack.pop()!;
      answer[top] = value;
      popped.push(top);
    }
    stack.push(index);
    frames.push({ index, value, popped, stack: [...stack], answer: [...answer] });
  }
  return frames;
}

function monotonicSnapshot(args: {
  values: readonly number[];
  cursor: number | null;
  stack: readonly number[];
  answer: readonly number[];
  resolvedNow?: readonly number[];
  entering?: number | null;
  /** Result step: unresolved answers are final and read as -1, not "?". */
  final?: boolean;
}): AlgorithmBarsSnapshot {
  const elementStates: Record<number, Array<"entering">> = {};
  if (args.entering != null) elementStates[args.entering] = ["entering"];
  // A bar whose answer is known is settled: it keeps the ✓ mark from here on,
  // so progress accumulates instead of flashing for one step.
  const settled = args.answer
    .map((value, index) => (value !== -1 || args.final ? index : -1))
    .filter((index) => index >= 0);
  const pointers: Record<string, number> = {};
  if (args.cursor != null) pointers.i = args.cursor;
  const topIndex = args.stack.at(-1);
  const resolvedNow = new Set(args.resolvedNow ?? []);

  return {
    kind: "algorithm_bars",
    array_values: args.values.map(String),
    numeric_values: [...args.values],
    active_indices: args.cursor == null ? [] : [args.cursor],
    swap_indices: [],
    sorted_indices: settled,
    pointers,
    element_states: elementStates,
    auxiliary_lanes: [
      {
        id: "monotonic-stack",
        role: "stack",
        label: "STACK · 自底向上递减",
        items: args.stack.map((index) => ({
          id: `stack-${index}`,
          label: `i=${index}`,
          value: `nums[i]=${args.values[index]}`,
          index,
          emphasis: index === topIndex ? "primary" : "secondary",
        })),
      },
      {
        id: "next-greater",
        role: "result",
        label: "ANSWER",
        items: args.answer.map((value, index) => ({
          id: `answer-${index}`,
          label: value === -1 ? (args.final ? "-1" : "?") : String(value),
          value: `i=${index}`,
          index,
          emphasis: resolvedNow.has(index) ? "accent" : value === -1 && !args.final ? "muted" : "secondary",
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
): NonNullable<MetaStep["code_highlight"]> {
  return {
    language: "typescript",
    lines: [...MONOTONIC_STACK_CODE],
    active_lines: activeLines,
    active_line: activeLine,
    variables,
    operation_label: operationLabel,
  };
}

function answerText(answer: readonly number[]): string {
  return `[${answer.map((value) => (value === -1 ? "?" : String(value))).join(", ")}]`;
}

/** Resolved answers in spoken form: no placeholder glyphs reach the narration. */
function answerSpoken(answer: readonly number[]): string {
  const resolved = answer
    .map((value, index) => ({ value, index }))
    .filter((item) => item.value !== -1);
  const pending = answer.length - resolved.length;
  const known = spokenList(resolved.map((item) => `下标 ${item.index} 是 ${item.value}`));
  return pending > 0 ? `${known}，其余 ${pending} 个还在等待` : known;
}

function stackText(stack: readonly number[], values: readonly number[]): string {
  return stack.length ? `[${stack.map((index) => values[index]).join(", ")}]` : "[]";
}

function buildMonotonicStackSteps(
  params: TemplatePreviewParams,
): AlgorithmCaseFrame<AlgorithmBarsSnapshot> {
  const presetId = resolveMonotonicPreset(params);
  const values = monotonicValues(presetId);
  const frames = monotonicStackTrace(values);
  const initialAnswer = values.map(() => -1);

  const steps: Array<AlgorithmStepDraft<AlgorithmBarsSnapshot>> = [
    {
      step_id: "monotonic-intro",
      title: "为每个元素找右侧第一个更大值",
      voiceover_text: `给定数组 [${values.join(", ")}]，要为每个元素找到它右边第一个比它大的数，找不到记为 -1。暴力做法对每个元素向右扫描，是 O(n²)。单调栈的思路是：把“还在等答案”的下标存进栈，栈里对应的值保持递减。`,
      snapshot: monotonicSnapshot({
        values,
        cursor: 0,
        stack: [],
        answer: initialAnswer,
      }),
      code_highlight: codeHighlight(
        2,
        { nums: `[${values.join(",")}]`, answer: answerText(initialAnswer), stack: "[]" },
        "initialize answer and stack",
        [1, 2],
      ),
      questions: [
        ["暴力解法慢在哪里？", "每个元素都要向右扫描到第一个更大值，最坏每次扫到结尾，总共 O(n²)。"],
        ["栈里存的是下标还是值？", "存下标。答案要按下标写回，同时通过 nums[下标] 随时能查到值。"],
        ["为什么栈内的值会保持递减？", "只要新元素比栈顶大，栈顶就会被弹出；留下来的必然都不小于新元素，于是自底向上递减。"],
      ],
    },
  ];

  frames.forEach((frame) => {
    const previous = frames[frame.index - 1];
    const stackBefore = previous?.stack ?? [];
    const stepId = `monotonic-visit-${frame.index}`;
    if (frame.popped.length === 0) {
      steps.push({
        step_id: stepId,
        title: `读入 ${frame.value}，直接入栈`,
        voiceover_text: stackBefore.length === 0
          ? `下标 ${frame.index} 的值是 ${frame.value}。栈是空的，没有谁在等它，把下标 ${frame.index} 压入栈。`
          : `下标 ${frame.index} 的值是 ${frame.value}，不大于栈顶的 ${values[stackBefore.at(-1)!]}，栈里的元素都还等不到答案。把下标 ${frame.index} 压入栈，栈内的值继续保持递减：${stackText(frame.stack, values)}。`,
        snapshot: monotonicSnapshot({
          values,
          cursor: frame.index,
          stack: frame.stack,
          answer: frame.answer,
          entering: frame.index,
        }),
        code_highlight: codeHighlight(
          7,
          {
            i: String(frame.index),
            "nums[i]": String(frame.value),
            top: stackBefore.length ? String(values[stackBefore.at(-1)!]) : "—",
            stack: stackText(frame.stack, values),
          },
          "push index",
          [4, 7],
        ),
        questions: [
          ["为什么这一步没有弹出？", frame.index === 0 ? "栈是空的，没有元素在等待答案。" : `栈顶的值 ${values[frame.stack.at(-2)!]} 不小于 ${frame.value}，${frame.value} 不是它的“更大值”。`],
          ["它自己的答案什么时候确定？", `要等右边第一个比 ${frame.value} 大的元素出现，把它从栈里弹出时才写答案。`],
          ["此时栈里的值是什么？", `${stackText(frame.stack, values)}，从底到顶递减。`],
        ],
      });
      return;
    }
    const poppedValues = frame.popped.map((index) => values[index]);
    steps.push({
      step_id: stepId,
      title: `读入 ${frame.value}，弹出 ${frame.popped.length} 个更小的元素`,
      voiceover_text: `下标 ${frame.index} 的值是 ${frame.value}，比栈顶的 ${poppedValues[0]} 大。栈顶等的“右侧第一个更大值”就是它：弹出并写下答案。${frame.popped.length > 1 ? `新的栈顶 ${poppedValues.slice(1).join("、")} 也比 ${frame.value} 小，同样依次弹出记答案。` : ""}直到栈顶不再小于 ${frame.value}，再把下标 ${frame.index} 压入。目前已确定的答案：${answerSpoken(frame.answer)}。`,
      snapshot: monotonicSnapshot({
        values,
        cursor: frame.index,
        stack: frame.stack,
        answer: frame.answer,
        resolvedNow: frame.popped,
        entering: frame.index,
      }),
      code_highlight: codeHighlight(
        5,
        {
          i: String(frame.index),
          "nums[i]": String(frame.value),
          popped: `[${poppedValues.join(",")}]`,
          answer: answerText(frame.answer),
          stack: stackText(frame.stack, values),
        },
        "pop smaller, record answer, push",
        [4, 5, 7],
      ),
      questions: [
        ["为什么弹出的元素答案就是当前值？", `它们在栈里等的是右侧第一个更大值；从它们入栈到现在没有更大的数出现过，${frame.value} 是第一个。`],
        ["为什么可以连续弹出多个？", "栈内值递减，栈顶最小；只要栈顶小于当前值就弹，直到遇到不小于当前值的元素为止。"],
        ["这一步之后答案数组是什么？", answerText(frame.answer)],
      ],
    });
  });

  const last = frames.at(-1);
  const finalAnswer = last?.answer ?? initialAnswer;
  const unresolved = last?.stack ?? [];
  steps.push({
    step_id: "monotonic-result",
    title: "扫描结束，栈里的元素答案为 -1",
    voiceover_text: `数组扫描完毕。${unresolved.length ? `栈里还剩 ${stackText(unresolved, values)}，它们右边再没有更大的数，答案保持 -1。` : "栈已清空，每个元素都找到了答案。"}最终答案是 [${finalAnswer.join(", ")}]。每个下标只入栈一次、出栈最多一次，整体是 O(n)，而不是暴力的 O(n²)。`,
    snapshot: monotonicSnapshot({
      values,
      cursor: null,
      stack: unresolved,
      answer: finalAnswer,
      resolvedNow: unresolved,
      final: true,
    }),
    code_highlight: codeHighlight(
      9,
      {
        answer: `[${finalAnswer.join(",")}]`,
        unresolved: stackText(unresolved, values),
        complexity: "O(n)",
      },
      "return answer",
    ),
    questions: [
      ["最终答案是什么？", `[${(last?.answer ?? []).join(", ")}]`],
      ["为什么留在栈里的元素是 -1？", "扫描结束都没有元素把它们弹出，说明右边不存在更大的数。"],
      ["为什么总时间是 O(n)？", "每个下标恰好入栈一次、出栈最多一次，两项操作合计不超过 2n 次。"],
    ],
  });

  return {
    steps,
    controls: [{
      id: "preset",
      label: "输入数组",
      value: presetId,
      description: "切换数组后重新执行单调栈扫描。",
    }],
    initialData: {
      array: values.map(String),
      preset: [presetId],
      result: finalAnswer.map(String),
    },
  };
}

export const MONOTONIC_STACK_PREVIEW_CASE = defineAlgorithmCase({
  id: "monotonic-stack",
  posterAlt: "单调栈求下一个更大元素：柱状数组、递减栈轨道与逐格填入的答案",
  posterStepIndex: 3,
  defaultParams: { preset: DEFAULT_PRESET },
  controls: [
    {
      id: "preset",
      kind: "select",
      label: "输入数组",
      description: "切换输入数组，对比栈只涨不落与每步都弹出两种极端。",
      resetPlayback: true,
      options: MONOTONIC_STACK_PRESETS.map((preset) => ({
        label: preset.label,
        value: preset.id,
      })),
    },
  ],
  title: "单调栈：下一个更大元素",
  summary: "用一条值递减的下标栈保存“还在等答案”的元素，解释为什么每个元素只需入栈出栈各一次就能在 O(n) 内找到右侧第一个更大值。",
  algorithmId: "monotonic_stack_next_greater",
  buildSteps: buildMonotonicStackSteps,
});

export const buildMonotonicStackScript = MONOTONIC_STACK_PREVIEW_CASE.buildScript;
export const buildMonotonicStackFollowups = MONOTONIC_STACK_PREVIEW_CASE.buildFollowups;
