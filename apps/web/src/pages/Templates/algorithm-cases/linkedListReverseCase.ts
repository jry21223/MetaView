import type {
  GraphSceneEdge,
  GraphSceneNode,
  GraphSceneSnapshot,
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

/**
 * 链表反转（迭代三指针）。
 *
 * 链表画成一排带箭头的节点，两端各放一个 ∅ 表示空指针。每一步只翻转一条
 * 指针：curr.next 从指向后继改为指向 prev。已翻转的前缀、当前节点、被保存
 * 的 next 各自用状态区分，箭头方向就是唯一需要盯住的东西。
 */
export const LINKED_LIST_LENGTHS = ["3", "4", "5"] as const;
export type LinkedListLength = (typeof LINKED_LIST_LENGTHS)[number];

const DEFAULT_LENGTH: LinkedListLength = "4";

export const LINKED_LIST_CODE = [
  "function reverseList(head: ListNode | null): ListNode | null {",
  "  let prev: ListNode | null = null;",
  "  let curr = head;",
  "  while (curr !== null) {",
  "    const next = curr.next;",
  "    curr.next = prev;",
  "    prev = curr;",
  "    curr = next;",
  "  }",
  "  return prev;",
  "}",
] as const;

export const HEAD_NULL_ID = "null-head";
export const TAIL_NULL_ID = "null-tail";

export function resolveLinkedListLength(params: TemplatePreviewParams): number {
  return Number(stringParam(params, "length", LINKED_LIST_LENGTHS, DEFAULT_LENGTH));
}

export interface LinkedListFrame {
  /** Node just processed (1-based value). */
  curr: number;
  /** `prev` before this step: 0 means null. */
  prevBefore: number;
  /** `next` saved at the top of this iteration: 0 means null. */
  next: number;
  /** Values whose pointer has been flipped after this step. */
  reversed: number[];
  /** Forward list read from the new head after this step. */
  order: number[];
}

/** Pure iterative reversal trace of the list 1 → 2 → … → n. */
export function linkedListReverseTrace(length: number): LinkedListFrame[] {
  const frames: LinkedListFrame[] = [];
  const reversed: number[] = [];
  let prev = 0;
  let curr = 1;
  while (curr !== 0 && curr <= length) {
    const next = curr === length ? 0 : curr + 1;
    reversed.push(curr);
    frames.push({
      curr,
      prevBefore: prev,
      next,
      reversed: [...reversed],
      order: [...reversed].reverse().concat(next === 0 ? [] : Array.from({ length: length - curr }, (_, i) => curr + 1 + i)),
    });
    prev = curr;
    curr = next;
  }
  return frames;
}

function nodeId(value: number): string {
  return value === 0 ? HEAD_NULL_ID : `n${value}`;
}

function nodeLabel(value: number): string {
  return value === 0 ? "∅" : String(value);
}

function listNodes(length: number): GraphSceneNode[] {
  const total = length + 2;
  const pitch = 6.4 / (total - 1);
  const nodes: GraphSceneNode[] = [];
  for (let slot = 0; slot < total; slot += 1) {
    const x = Number((-3.2 + slot * pitch).toFixed(3));
    if (slot === 0) nodes.push({ id: HEAD_NULL_ID, label: "∅", x, y: -0.2 });
    else if (slot === total - 1) nodes.push({ id: TAIL_NULL_ID, label: "∅", x, y: -0.2 });
    else nodes.push({ id: `n${slot}`, label: String(slot), x, y: -0.2 });
  }
  return nodes;
}

export function flippedEdgeId(value: number): string {
  return `n${value}-back`;
}

export function forwardEdgeId(value: number): string {
  return `n${value}-fwd`;
}

/** Edge set once the first `reversedCount` nodes have had their pointer flipped. */
export function listEdges(length: number, reversedCount: number): GraphSceneEdge[] {
  const edges: GraphSceneEdge[] = [];
  for (let value = 1; value <= length; value += 1) {
    if (value <= reversedCount) {
      edges.push({ id: flippedEdgeId(value), source: `n${value}`, target: nodeId(value - 1) });
    } else {
      edges.push({
        id: forwardEdgeId(value),
        source: `n${value}`,
        target: value === length ? TAIL_NULL_ID : `n${value + 1}`,
      });
    }
  }
  return edges;
}

function listSnapshot(args: {
  length: number;
  reversedCount: number;
  current: number | null;
  next?: number | null;
  activeEdges?: readonly string[];
  visited?: readonly number[];
  caption: string;
}): GraphSceneSnapshot {
  return {
    kind: "graph_scene",
    nodes: listNodes(args.length),
    edges: listEdges(args.length, args.reversedCount),
    directed: true,
    weighted: false,
    current_node_id: args.current == null ? null : `n${args.current}`,
    active_node_ids: [],
    active_edge_ids: [...(args.activeEdges ?? [])],
    visited_node_ids: (args.visited ?? []).map((value) => `n${value}`),
    queue_node_ids: [],
    frontier_node_ids: args.next ? [`n${args.next}`] : [],
    caption: args.caption,
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
    lines: [...LINKED_LIST_CODE],
    active_lines: activeLines,
    active_line: activeLine,
    variables,
    operation_label: operationLabel,
  };
}

function chain(values: readonly number[]): string {
  return [...values.map(String), "∅"].join(" → ");
}

export function buildLinkedListReverseScript(params: TemplatePreviewParams): PlaybookScript {
  const length = resolveLinkedListLength(params);
  const frames = linkedListReverseTrace(length);
  const original = Array.from({ length }, (_, index) => index + 1);

  const steps: MetaStep[] = [
    algorithmStep(0, {
      step_id: "list-intro",
      title: "三个指针：prev、curr、next",
      voiceover_text: `链表是 ${chain(original)}，每个节点只知道自己的后继。反转的目标是让每个 next 指针掉头。迭代法用三个指针：prev 指向已经反转好的部分（开始时为空），curr 指向正在处理的节点，next 提前保存后继，否则指针一掉头就找不到后面的节点了。`,
      snapshot: listSnapshot({
        length,
        reversedCount: 0,
        current: 1,
        next: length > 1 ? 2 : null,
        caption: `prev = ∅，curr = 1，链表 ${chain(original)}`,
      }),
      code_highlight: codeHighlight(
        2,
        { head: "1", prev: "null", curr: "1", list: chain(original) },
        "initialize prev and curr",
        [1, 2],
      ),
    }),
  ];

  frames.forEach((frame) => {
    const prevLabel = nodeLabel(frame.prevBefore);
    const nextLabel = nodeLabel(frame.next);
    steps.push(algorithmStep(steps.length, {
      step_id: `list-flip-${frame.curr}`,
      title: `翻转节点 ${frame.curr} 的指针：${frame.curr} → ${prevLabel}`,
      voiceover_text: `curr 在节点 ${frame.curr}。先把后继保存进 next（${nextLabel}），再让 ${frame.curr}.next 指向 prev，也就是 ${prevLabel}。指针掉头之后，prev 前进到 ${frame.curr}，curr 前进到保存好的 ${nextLabel}。${frame.next === 0 ? "next 为空，循环即将结束。" : `此刻已反转的前缀是 ${chain([...frame.reversed].reverse())}。`}`,
      snapshot: listSnapshot({
        length,
        reversedCount: frame.reversed.length,
        current: frame.curr,
        next: frame.next || null,
        activeEdges: [flippedEdgeId(frame.curr)],
        visited: frame.reversed.slice(0, -1),
        caption: `next = ${nextLabel}，${frame.curr}.next = ${prevLabel}；然后 prev = ${frame.curr}，curr = ${nextLabel}`,
      }),
      code_highlight: codeHighlight(
        5,
        {
          curr: String(frame.curr),
          next: frame.next === 0 ? "null" : String(frame.next),
          "curr.next": frame.prevBefore === 0 ? "null" : String(frame.prevBefore),
          prev: String(frame.curr),
        },
        `flip ${frame.curr}.next`,
        [4, 5, 6, 7],
      ),
    }));
  });

  const last = frames.at(-1)!;
  steps.push(algorithmStep(steps.length, {
    step_id: "list-result",
    title: `curr 为空，新头结点是 ${last.curr}`,
    voiceover_text: `curr 走到 ∅，循环结束。prev 停在原来的尾节点 ${last.curr}，它就是新的头结点，返回 prev。现在链表是 ${chain(last.order)}。每个节点恰好被访问一次、翻转一条指针，时间 O(n)，只用了三个指针的额外空间。`,
    snapshot: listSnapshot({
      length,
      reversedCount: length,
      current: null,
      visited: last.reversed,
      activeEdges: last.reversed.map((value) => flippedEdgeId(value)),
      caption: `返回 prev = ${last.curr}；新链表 ${chain(last.order)}`,
    }),
    code_highlight: codeHighlight(
      9,
      { prev: String(last.curr), curr: "null", result: chain(last.order), complexity: "O(n)" },
      "return new head",
    ),
  }));

  return buildAlgorithmPlaybook({
    title: "链表反转：一次只翻一条指针",
    summary: "用 prev、curr、next 三个指针迭代反转单链表，每一步只让一条 next 指针掉头，箭头方向就是全部状态。",
    algorithmId: "linked_list_reverse",
    steps,
    controls: [{
      id: "length",
      label: "链表长度",
      value: String(length),
      description: "调整节点数后重新演示反转过程。",
    }],
    initialData: {
      list: original.map(String),
      length: [String(length)],
      result: last.order.map(String),
    },
  });
}

export function buildLinkedListReverseFollowups(params: TemplatePreviewParams): TemplatePreviewFollowups {
  const length = resolveLinkedListLength(params);
  const frames = linkedListReverseTrace(length);
  const last = frames.at(-1)!;

  const followups: TemplatePreviewFollowups = {
    "list-intro": algorithmQuestions(
      "list-intro",
      ["为什么需要 next 这个指针？", "curr.next 一旦改成指向 prev，原来的后继就丢了；先保存 next 才能继续向后走。"],
      ["prev 一开始为什么是空？", "第一个节点反转后要成为尾节点，尾节点的 next 必须是 ∅，所以 prev 从 ∅ 开始。"],
      ["能不能用递归？", "可以：先反转 head.next 之后的部分，再把 head.next.next 指回 head；但递归深度是 O(n)。"],
    ),
  };

  frames.forEach((frame) => {
    const stepId = `list-flip-${frame.curr}`;
    followups[stepId] = algorithmQuestions(
      stepId,
      ["这一步改动了哪条指针？", `只有 ${frame.curr}.next：从 ${nodeLabel(frame.next)} 改为指向 ${nodeLabel(frame.prevBefore)}。`],
      ["四行代码的顺序能换吗？", "保存 next 必须最先做；改 curr.next 要在 prev 前进之前；prev 和 curr 的前进顺序不能颠倒，否则 prev 会跳过当前节点。"],
      ["此刻链表分成了哪两段？", `已反转段 ${chain([...frame.reversed].reverse())}，${frame.next === 0 ? "剩余段为空。" : `未处理段 ${chain(Array.from({ length: length - frame.curr }, (_, i) => frame.curr + 1 + i))}。`}`],
    );
  });

  followups["list-result"] = algorithmQuestions(
    "list-result",
    ["为什么返回 prev 而不是 curr？", "循环结束时 curr 已经是 ∅，prev 停在最后一个被处理的节点，也就是原尾、新头。"],
    ["最终链表是什么？", chain(last.order)],
    ["复杂度是多少？", `每个节点处理一次，共 ${length} 次迭代，时间 O(n)；额外空间只有三个指针，O(1)。`],
  );

  return followups;
}

export const LINKED_LIST_REVERSE_PREVIEW_CASE = defineAlgorithmPreviewCase({
  id: "linked-list-reverse",
  posterAlt: "链表反转：带箭头的节点排、已翻转的前缀与正在掉头的指针",
  posterStepIndex: 2,
  defaultParams: { length: DEFAULT_LENGTH },
  controls: [
    {
      id: "length",
      kind: "select",
      label: "链表长度",
      description: "调整节点数后重新演示反转。",
      resetPlayback: true,
      options: LINKED_LIST_LENGTHS.map((value) => ({ label: `${value} 个节点`, value })),
    },
  ],
  buildScript: buildLinkedListReverseScript,
  buildFollowups: buildLinkedListReverseFollowups,
});
