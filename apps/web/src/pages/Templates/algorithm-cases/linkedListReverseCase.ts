import type {
  GraphSceneEdge,
  GraphSceneNode,
  GraphSceneSnapshot,
} from "../../../features/playbook/engine/types";
import {
  graphSceneSnapshot,
  pointerMarkers,
  pointerMarkerId,
  rowLayout,
} from "../../../features/playbook/engine/kits/algorithm/graphScene";
import { SPOKEN_NULL, spokenList } from "../../../shared/lib/spokenText";
import type { TemplatePreviewParams } from "../templatePreviewCases";
import {
  codeHighlightFor,
  defineAlgorithmCase,
  definePresetParam,
  type AlgorithmCaseFrame,
  type AlgorithmStepDraft,
} from "./helpers";

/**
 * 链表反转（迭代三指针）。
 *
 * 链表画成一排带箭头的节点，两端各放一个 ∅ 表示空指针。每一步只翻转一条
 * 指针：curr->next 从指向后继改为指向 prev。已翻转的前缀、当前节点、被保存
 * 的 next 各自用状态区分，箭头方向就是唯一需要盯住的东西。
 */
export const LINKED_LIST_LENGTHS = ["3", "4", "5"] as const;
export type LinkedListLength = (typeof LINKED_LIST_LENGTHS)[number];

const DEFAULT_LENGTH: LinkedListLength = "4";

const LENGTH_PARAM = definePresetParam<LinkedListLength>({
  id: "length",
  label: "链表长度",
  description: "调整节点数后重新演示反转。",
  playbookDescription: "调整节点数后重新演示反转过程。",
  options: LINKED_LIST_LENGTHS.map((value) => ({ value, label: `${value} 个节点` })),
  defaultValue: DEFAULT_LENGTH,
});

export const LINKED_LIST_CODE = [
  "ListNode *reverseList(ListNode *head) {",
  "  ListNode *prev = NULL;",
  "  ListNode *curr = head;",
  "  while (curr != NULL) {",
  "    ListNode *next = curr->next;  /* 先保存后继 */",
  "    curr->next = prev;            /* 指针掉头 */",
  "    prev = curr;",
  "    curr = next;",
  "  }",
  "  return prev;  /* 原尾节点成为新头 */",
  "}",
] as const;

export const HEAD_NULL_ID = "null-head";
export const TAIL_NULL_ID = "null-tail";

export function resolveLinkedListLength(params: TemplatePreviewParams): number {
  return Number(LENGTH_PARAM.resolve(params));
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
  /** List read from the new head after this step (the untouched suffix is no longer reachable from it). */
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
      order: [...reversed].reverse(),
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

/** The row is `∅ → 1 → … → n → ∅`, so both null sentinels get a slot of their own. */
const LIST_ROW_Y = -0.2;

function listNodes(length: number): GraphSceneNode[] {
  return rowLayout(
    Array.from({ length: length + 2 }, (_, slot) => {
      if (slot === 0) return { id: HEAD_NULL_ID, label: "∅" };
      if (slot === length + 1) return { id: TAIL_NULL_ID, label: "∅" };
      return { id: `n${slot}`, label: String(slot) };
    }),
    { y: LIST_ROW_Y },
  );
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

export type PointerName = "prev" | "curr" | "next";

export { pointerMarkerId };

/** The prev / curr / next markers sit on their own row above the list. */
const POINTER_ROW_Y = -1.75;

function listSnapshot(args: {
  length: number;
  reversedCount: number;
  current: number | null;
  next?: number | null;
  pointers: Partial<Record<PointerName, string>>;
  activeEdges?: readonly string[];
  visited?: readonly number[];
  active?: readonly number[];
  caption: string;
}): GraphSceneSnapshot {
  const nodes = listNodes(args.length);
  const markers = pointerMarkers(
    nodes,
    // `curr` is the pointer the step is actually moving, so only it is accented.
    (["prev", "curr", "next"] as const).map((name) => ({
      name,
      target: args.pointers[name],
      accent: name === "curr",
    })),
    POINTER_ROW_Y,
  );
  return graphSceneSnapshot({
    nodes: [...nodes, ...markers.nodes],
    edges: [...listEdges(args.length, args.reversedCount), ...markers.edges],
    directed: true,
    currentNodeId: args.current == null ? null : `n${args.current}`,
    activeNodeIds: (args.active ?? []).map((value) => `n${value}`),
    activeEdgeIds: args.activeEdges,
    visitedNodeIds: (args.visited ?? []).map((value) => `n${value}`),
    frontierNodeIds: args.next ? [`n${args.next}`] : [],
    caption: args.caption,
  });
}

const codeHighlight = codeHighlightFor(LINKED_LIST_CODE, "c");

function chain(values: readonly number[]): string {
  return [...values.map(String), "∅"].join(" → ");
}

/** The same chain for narration: TTS cannot read arrows or the null glyph. */
function chainSpoken(values: readonly number[]): string {
  return values.length ? `${spokenList(values)}，末尾指向${SPOKEN_NULL}` : SPOKEN_NULL;
}

function spokenNode(value: number): string {
  return value === 0 ? SPOKEN_NULL : String(value);
}

function buildLinkedListReverseSteps(
  params: TemplatePreviewParams,
): AlgorithmCaseFrame<GraphSceneSnapshot> {
  const length = resolveLinkedListLength(params);
  const frames = linkedListReverseTrace(length);
  const original = Array.from({ length }, (_, index) => index + 1);

  const steps: Array<AlgorithmStepDraft<GraphSceneSnapshot>> = [
    {
      step_id: "list-intro",
      title: "三个指针：prev、curr、next",
      voiceover_text: `链表依次是 ${chainSpoken(original)}，每个节点只知道自己的后继。反转的目标是让每个 next 指针掉头。迭代法用三个指针：prev 指向已经反转好的部分（开始时为空），curr 指向正在处理的节点，next 提前保存后继，否则指针一掉头就找不到后面的节点了。`,
      snapshot: listSnapshot({
        length,
        reversedCount: 0,
        current: 1,
        next: length > 1 ? 2 : null,
        pointers: { prev: HEAD_NULL_ID, curr: "n1" },
        caption: `prev = ∅，curr = 1，链表 ${chain(original)}`,
      }),
      code_highlight: codeHighlight(
        2,
        { head: "1", prev: "NULL", curr: "1", list: chain(original) },
        "initialize prev and curr",
        [1, 2],
      ),
      questions: [
        ["为什么需要 next 这个指针？", "curr->next 一旦改成指向 prev，原来的后继就丢了；先保存 next 才能继续向后走。"],
        ["prev 一开始为什么是空？", "第一个节点反转后要成为尾节点，尾节点的 next 必须是 ∅，所以 prev 从 ∅ 开始。"],
        ["能不能用递归？", "可以：先反转 head->next 之后的部分，再令 head->next->next = head、head->next = NULL；但递归深度是 O(n)。"],
      ],
    },
  ];

  frames.forEach((frame) => {
    const prevLabel = nodeLabel(frame.prevBefore);
    const nextLabel = nodeLabel(frame.next);
    const prevSpoken = spokenNode(frame.prevBefore);
    const nextSpoken = spokenNode(frame.next);
    steps.push({
      step_id: `list-flip-${frame.curr}`,
      title: `翻转节点 ${frame.curr} 的指针：${frame.curr} → ${prevLabel}`,
      voiceover_text: `curr 在节点 ${frame.curr}。先把后继保存进 next，也就是 ${nextSpoken}；再让节点 ${frame.curr} 的 next 指向 prev，也就是 ${prevSpoken}。指针掉头之后，prev 前进到 ${frame.curr}，curr 前进到保存好的 ${nextSpoken}。${frame.next === 0 ? "next 为空，循环即将结束。" : `此刻已反转的前缀依次是 ${chainSpoken([...frame.reversed].reverse())}。`}`,
      snapshot: listSnapshot({
        length,
        reversedCount: frame.reversed.length,
        current: frame.curr,
        next: frame.next || null,
        pointers: {
          prev: nodeId(frame.prevBefore),
          curr: `n${frame.curr}`,
          next: frame.next === 0 ? TAIL_NULL_ID : `n${frame.next}`,
        },
        activeEdges: [flippedEdgeId(frame.curr)],
        visited: frame.reversed.slice(0, -1),
        caption: `next = ${nextLabel}，${frame.curr}.next = ${prevLabel}；然后 prev = ${frame.curr}，curr = ${nextLabel}`,
      }),
      code_highlight: codeHighlight(
        5,
        {
          curr: String(frame.curr),
          next: frame.next === 0 ? "NULL" : String(frame.next),
          "curr->next": frame.prevBefore === 0 ? "NULL" : String(frame.prevBefore),
          prev: String(frame.curr),
        },
        `flip ${frame.curr}.next`,
        [4, 5, 6, 7],
      ),
      questions: [
        ["这一步改动了哪条指针？", `只有 ${frame.curr}.next：从 ${nodeLabel(frame.next)} 改为指向 ${nodeLabel(frame.prevBefore)}。`],
        ["四行代码的顺序能换吗？", "保存 next 必须最先做；改 curr->next 要在 prev 前进之前；prev 和 curr 的前进顺序不能颠倒，否则 prev 会跳过当前节点。"],
        ["此刻链表分成了哪两段？", `已反转段 ${chain([...frame.reversed].reverse())}，${frame.next === 0 ? "剩余段为空。" : `未处理段 ${chain(Array.from({ length: length - frame.curr }, (_, i) => frame.curr + 1 + i))}。`}`],
      ],
    });
  });

  const last = frames.at(-1)!;
  steps.push({
    step_id: "list-result",
    title: `curr 为空，新头结点是 ${last.curr}`,
    voiceover_text: `curr 走到空，循环结束。prev 停在原来的尾节点 ${last.curr}，它就是新的头结点，返回 prev。现在链表依次是 ${chainSpoken(last.order)}。每个节点恰好被访问一次、翻转一条指针，时间 O(n)，只用了三个指针的额外空间。`,
    snapshot: listSnapshot({
      length,
      reversedCount: length,
      current: null,
      pointers: { prev: `n${last.curr}`, curr: TAIL_NULL_ID },
      visited: last.reversed,
      active: [last.curr],
      activeEdges: last.reversed.map((value) => flippedEdgeId(value)),
      caption: `返回 prev = ${last.curr}；新链表 ${chain(last.order)}`,
    }),
    code_highlight: codeHighlight(
      9,
      { prev: String(last.curr), curr: "NULL", result: chain(last.order), complexity: "O(n)" },
      "return new head",
    ),
    questions: [
      ["为什么返回 prev 而不是 curr？", "循环结束时 curr 已经是 ∅，prev 停在最后一个被处理的节点，也就是原尾、新头。"],
      ["最终链表是什么？", chain(last.order)],
      ["复杂度是多少？", `每个节点处理一次，共 ${length} 次迭代，时间 O(n)；额外空间只有三个指针，O(1)。`],
    ],
  });

  return {
    steps,
    controls: [LENGTH_PARAM.playbookControl(String(length) as LinkedListLength)],
    initialData: {
      list: original.map(String),
      length: [String(length)],
      result: last.order.map(String),
    },
  };
}

export const LINKED_LIST_REVERSE_PREVIEW_CASE = defineAlgorithmCase({
  id: "linked-list-reverse",
  posterAlt: "链表反转：带箭头的节点排、已翻转的前缀与正在掉头的指针",
  posterStepIndex: 2,
  defaultParams: { length: DEFAULT_LENGTH },
  controls: [LENGTH_PARAM.control],
  title: "链表反转：一次只翻一条指针",
  summary: "用 prev、curr、next 三个指针迭代反转单链表，每一步只让一条 next 指针掉头，箭头方向就是全部状态。",
  algorithmId: "linked_list_reverse",
  buildSteps: buildLinkedListReverseSteps,
});

export const buildLinkedListReverseScript = LINKED_LIST_REVERSE_PREVIEW_CASE.buildScript;
export const buildLinkedListReverseFollowups = LINKED_LIST_REVERSE_PREVIEW_CASE.buildFollowups;
