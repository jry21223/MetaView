import type {
  GraphSceneEdge,
  GraphSceneNode,
  GraphSceneSnapshot,
  MetaStep,
  PlaybookScript,
} from "../../features/playbook/engine/types";
import { MERGE_SORT_PREVIEW_CASE } from "./algorithm-cases/mergeSortCase";
import { QUICK_SORT_PREVIEW_CASE } from "./algorithm-cases/quickSortCase";
import { SLIDING_WINDOW_PREVIEW_CASE } from "./algorithm-cases/slidingWindowCase";
import { PUBLIC_GOLD_TEMPLATES } from "./gold-templates/publicGoldTemplates";
import { manifestToPreviewCase } from "./gold-templates/manifest";
import type { ConicFollowupCommand } from "../../features/playbook/interaction/types";
import type { InteractionAdapter } from "../../features/playbook/interaction/types";
import { applyNarrationTimeline, posterFrameForStep } from "./narrationTiming";

export type TemplatePreviewCaseId = string;

export type TemplatePreviewParamValue = number | string;
export type TemplatePreviewParams = Record<string, TemplatePreviewParamValue>;

export interface TemplatePreviewQuestion {
  id: string;
  question: string;
  answer: string;
  operation?: ConicFollowupCommand;
}

export type TemplatePreviewFollowups = Record<string, TemplatePreviewQuestion[]>;

interface BaseTemplatePreviewControl {
  id: string;
  label: string;
  description: string;
  resetPlayback: boolean;
  /**
   * Step ids where dragging this control visibly changes the picture.
   * Omitted = the control applies on every step (no per-step badges shown).
   */
  steps?: readonly string[];
}

export interface NumberTemplatePreviewControl extends BaseTemplatePreviewControl {
  kind: "number" | "range";
  min: number;
  max: number;
  step: number;
}

export interface SelectTemplatePreviewControl extends BaseTemplatePreviewControl {
  kind: "select";
  options: Array<{ label: string; value: string }>;
}

export type TemplatePreviewControl =
  | NumberTemplatePreviewControl
  | SelectTemplatePreviewControl;

export interface TemplatePreviewCase {
  /** Curated hands-on moments whose timeline dots get the ring (1–3 ids). */
  handsOnStepIds?: readonly string[];
  id: TemplatePreviewCaseId;
  templateId: TemplatePreviewCaseId;
  posterUrl: string;
  posterAlt: string;
  posterFrame: number;
  defaultParams: TemplatePreviewParams;
  controls: TemplatePreviewControl[];
  buildScript: (params: TemplatePreviewParams) => PlaybookScript;
  buildFollowups: (
    params: TemplatePreviewParams,
    script: PlaybookScript,
  ) => TemplatePreviewFollowups;
  interactionAdapters?: readonly InteractionAdapter[];
}

const FPS = 30;
const STEP_FRAMES = 90;

function step<T extends MetaStep["snapshot"]>(
  index: number,
  value: Omit<MetaStep<T>, "end_frame" | "tokens">,
): MetaStep<T> {
  return {
    ...value,
    end_frame: (index + 1) * STEP_FRAMES,
    tokens: [],
  };
}

function questions(
  stepId: string,
  first: [string, string],
  second: [string, string],
  third?: [string, string],
): TemplatePreviewQuestion[] {
  return [first, second, ...(third ? [third] : [])].map(([question, answer], index) => ({
    id: `${stepId}-q${index + 1}`,
    question,
    answer,
  }));
}

function finiteNumber(params: TemplatePreviewParams, key: string, fallback: number): number {
  const value = Number(params[key]);
  return Number.isFinite(value) ? value : fallback;
}

// ── Binary search ──────────────────────────────────────────────────────────

const BINARY_VALUES = [2, 4, 7, 11, 15, 19, 22, 28, 33, 40];
const BINARY_CODE = [
  "let low = 0, high = values.length - 1;",
  "while (low <= high) {",
  "  const mid = Math.floor((low + high) / 2);",
  "  if (values[mid] === target) return mid;",
  "  if (values[mid] < target) low = mid + 1;",
  "  else high = mid - 1;",
  "}",
  "return -1;",
];

interface BinaryComparison {
  low: number;
  high: number;
  mid: number;
  value: number;
  direction: "found" | "right" | "left";
}

function binaryTrace(target: number): BinaryComparison[] {
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
): MetaStep["snapshot"] {
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

function buildBinarySearchScript(params: TemplatePreviewParams): PlaybookScript {
  const target = Math.round(finiteNumber(params, "target", 22));
  const trace = binaryTrace(target);
  const found = trace.find((item) => item.direction === "found") ?? null;
  const steps: MetaStep[] = [
    step(0, {
      step_id: "binary-intro",
      title: "建立有序区间",
      voiceover_text: `数组已经升序排列。目标是 ${target}，搜索从完整区间开始。`,
      snapshot: binarySnapshot(0, BINARY_VALUES.length - 1, null),
      code_highlight: {
        language: "typescript",
        lines: BINARY_CODE,
        active_lines: [0],
        active_line: 0,
        variables: { target: String(target), low: "0", high: "9" },
        operation_label: "initialize search window",
      },
    }),
  ];

  trace.forEach((comparison, traceIndex) => {
    const directionText = comparison.direction === "found"
      ? "正好等于目标，搜索结束"
      : comparison.direction === "right"
        ? "小于目标，因此舍弃左半区"
        : "大于目标，因此舍弃右半区";
    const activeLine = comparison.direction === "found" ? 3 : comparison.direction === "right" ? 4 : 5;
    steps.push(step(steps.length, {
      step_id: `binary-compare-${traceIndex + 1}`,
      title: `比较中点 ${comparison.value}`,
      voiceover_text: `区间 [${comparison.low}, ${comparison.high}] 的中点是 ${comparison.mid}，值为 ${comparison.value}；${directionText}。`,
      snapshot: binarySnapshot(comparison.low, comparison.high, comparison.mid),
      code_highlight: {
        language: "typescript",
        lines: BINARY_CODE,
        active_lines: [2, activeLine],
        active_line: activeLine,
        variables: {
          target: String(target),
          low: String(comparison.low),
          mid: String(comparison.mid),
          high: String(comparison.high),
          value: String(comparison.value),
        },
        operation_label: comparison.direction,
      },
    }));
  });

  const last = trace.at(-1);
  const resultLow = found?.mid ?? (last?.direction === "right" ? last.mid + 1 : last?.low ?? 0);
  const resultHigh = found?.mid ?? (last?.direction === "left" ? last.mid - 1 : last?.high ?? -1);
  steps.push(step(steps.length, {
    step_id: "binary-result",
    title: found ? "定位目标" : "确认不存在",
    voiceover_text: found
      ? `目标 ${target} 位于索引 ${found.mid}。每轮都排除一半候选，因此时间复杂度是 O(log n)。`
      : `搜索区间已经为空，目标 ${target} 不在数组中。二分查找同样只进行了 ${trace.length} 轮比较。`,
    snapshot: binarySnapshot(resultLow, resultHigh, found?.mid ?? null),
    code_highlight: {
      language: "typescript",
      lines: BINARY_CODE,
      active_lines: [found ? 3 : 7],
      active_line: found ? 3 : 7,
      variables: {
        target: String(target),
        result: found ? String(found.mid) : "-1",
        comparisons: String(trace.length),
      },
      operation_label: found ? "target found" : "target absent",
    },
  }));

  const timed = applyNarrationTimeline(steps, FPS);
  return {
    schema_version: "2.0.0",
    fps: FPS,
    total_frames: timed.at(-1)?.end_frame ?? 0,
    domain: "algorithm",
    title: "二分查找：区间如何收敛",
    summary: "用 low、mid、high 的连续变化解释二分查找为何每轮排除一半候选。",
    steps: timed,
    parameter_controls: [{
      id: "target",
      label: "目标值",
      value: String(target),
      description: "修改后在固定有序数组中重新执行二分查找。",
    }],
    algorithm_id: "binary_search",
    initial_data: { array: BINARY_VALUES.map(String), target: [String(target)] },
  };
}

function buildBinaryFollowups(params: TemplatePreviewParams): TemplatePreviewFollowups {
  const target = Math.round(finiteNumber(params, "target", 22));
  const trace = binaryTrace(target);
  const found = trace.find((item) => item.direction === "found") ?? null;
  const followups: TemplatePreviewFollowups = {
    "binary-intro": questions(
      "binary-intro",
      ["为什么数组必须有序？", "只有有序时，中点与目标的大小关系才能安全排除整整一半区间。"],
      ["low 和 high 表示什么？", "它们共同界定当前仍可能包含目标的闭区间。"],
      ["什么时候说明目标不存在？", "当 low 大于 high 时，候选闭区间为空，可以返回 -1。"],
    ),
  };
  trace.forEach((item, index) => {
    followups[`binary-compare-${index + 1}`] = questions(
      `binary-compare-${index + 1}`,
      ["这一轮为什么能缩小区间？", `中点值是 ${item.value}，与目标 ${target} 的大小关系证明另一半不可能包含目标。`],
      ["下一轮会检查哪里？", item.direction === "found"
        ? `已经在索引 ${item.mid} 命中，不需要下一轮。`
        : item.direction === "right"
          ? `下一轮只保留索引 ${item.mid + 1} 到 ${item.high}。`
          : `下一轮只保留索引 ${item.low} 到 ${item.mid - 1}。`],
      ["这一轮排除了多少候选？", item.direction === "found"
        ? "已经命中目标，不再排除候选。"
        : `从 ${item.high - item.low + 1} 个候选缩小到不超过一半。`],
    );
  });
  followups["binary-result"] = questions(
    "binary-result",
    ["最终结果是什么？", found ? `目标 ${target} 位于索引 ${found.mid}。` : `目标 ${target} 不在这个数组中。`],
    ["为什么是 O(log n)？", `每轮候选数量约减半，本例经过 ${trace.length} 轮比较就得到结论。`],
    ["结束条件是什么？", found ? "中点值等于目标，立即返回该索引。" : "low 已经大于 high，候选区间为空。"],
  );
  return followups;
}

// ── Breadth-first search ──────────────────────────────────────────────────

const BFS_NODES: GraphSceneNode[] = [
  { id: "1", label: "1", x: 0, y: -2.4 },
  { id: "2", label: "2", x: -2.2, y: -0.5 },
  { id: "3", label: "3", x: 2.2, y: -0.5 },
  { id: "4", label: "4", x: -3.2, y: 1.8 },
  { id: "5", label: "5", x: -1.2, y: 1.8 },
  { id: "6", label: "6", x: 1.2, y: 1.8 },
  { id: "7", label: "7", x: 3.2, y: 1.8 },
];

const BFS_EDGE_PAIRS: Array<[string, string]> = [
  ["1", "2"], ["1", "3"], ["2", "4"], ["2", "5"], ["3", "6"], ["3", "7"],
];

const BFS_EDGES: GraphSceneEdge[] = BFS_EDGE_PAIRS.map(([source, target]) => ({
  id: `${source}-${target}`,
  source,
  target,
}));

const BFS_CODE = [
  "const queue = [start];",
  "const visited = new Set([start]);",
  "while (queue.length) {",
  "  const current = queue.shift();",
  "  for (const next of graph[current]) {",
  "    if (visited.has(next)) continue;",
  "    visited.add(next); queue.push(next);",
  "  }",
  "}",
];

function bfsNeighbors(nodeId: string): string[] {
  return BFS_EDGE_PAIRS.flatMap(([left, right]) =>
    left === nodeId ? [right] : right === nodeId ? [left] : [],
  ).sort((left, right) => Number(left) - Number(right));
}

interface BfsState {
  current: string;
  queue: string[];
  visited: string[];
  frontier: string[];
  activeEdges: string[];
}

function bfsTrace(startNode: string): BfsState[] {
  const queue = [startNode];
  const discovered = new Set([startNode]);
  const visited: string[] = [];
  const result: BfsState[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited.push(current);
    const frontier: string[] = [];
    const activeEdges: string[] = [];
    for (const next of bfsNeighbors(current)) {
      if (discovered.has(next)) continue;
      discovered.add(next);
      queue.push(next);
      frontier.push(next);
      const edge = BFS_EDGES.find(
        (item) => (item.source === current && item.target === next) ||
          (item.source === next && item.target === current),
      );
      if (edge?.id) activeEdges.push(edge.id);
    }
    result.push({ current, queue: [...queue], visited: [...visited], frontier, activeEdges });
  }
  return result;
}

function graphSnapshot(
  current: string | null,
  queue: string[],
  visited: string[],
  frontier: string[],
  activeEdges: string[],
  caption: string,
): GraphSceneSnapshot {
  return {
    kind: "graph_scene",
    pack_id: "algorithm-code-basic",
    asset_id: "bfs-graph-preset",
    nodes: BFS_NODES,
    edges: BFS_EDGES,
    directed: false,
    weighted: false,
    current_node_id: current,
    active_node_ids: current ? [current] : [],
    active_edge_ids: activeEdges,
    visited_node_ids: visited,
    queue_node_ids: queue,
    frontier_node_ids: frontier,
    caption,
  };
}

function buildBfsScript(params: TemplatePreviewParams): PlaybookScript {
  const requestedStart = String(params.startNode ?? "1");
  const startNode = BFS_NODES.some((node) => node.id === requestedStart) ? requestedStart : "1";
  const trace = bfsTrace(startNode);
  const steps: MetaStep[] = [
    step(0, {
      step_id: "bfs-intro",
      title: "起点进入队列",
      voiceover_text: `从节点 ${startNode} 开始，把它加入先进先出的队列。`,
      snapshot: graphSnapshot(null, [startNode], [], [startNode], [], `队列初始化为 [${startNode}]。`),
      code_highlight: {
        language: "typescript",
        lines: BFS_CODE,
        active_lines: [0, 1],
        active_line: 0,
        variables: { start: startNode, queue: `[${startNode}]`, visited: `{${startNode}}` },
        operation_label: "initialize queue",
      },
    }),
  ];

  trace.forEach((state) => {
    steps.push(step(steps.length, {
      step_id: `bfs-visit-${state.current}`,
      title: `访问节点 ${state.current}`,
      voiceover_text: state.frontier.length > 0
        ? `节点 ${state.current} 出队，将未发现的相邻节点 ${state.frontier.join("、")} 依次加入队列。`
        : `节点 ${state.current} 出队，它没有尚未发现的相邻节点。`,
      snapshot: graphSnapshot(
        state.current,
        state.queue,
        state.visited,
        state.frontier,
        state.activeEdges,
        `访问顺序：${state.visited.join(" → ")}；队列：[${state.queue.join(", ")}]`,
      ),
      code_highlight: {
        language: "typescript",
        lines: BFS_CODE,
        active_lines: state.frontier.length > 0 ? [3, 4, 6] : [3, 4, 5],
        active_line: state.frontier.length > 0 ? 6 : 5,
        variables: {
          current: state.current,
          queue: `[${state.queue.join(", ")}]`,
          visited: `{${state.visited.join(", ")}}`,
          frontier: `[${state.frontier.join(", ")}]`,
        },
        operation_label: `visit ${state.current}`,
      },
    }));
  });

  steps.push(step(steps.length, {
    step_id: "bfs-result",
    title: "完成逐层遍历",
    voiceover_text: `队列变空，BFS 完成。访问顺序是 ${trace.map((item) => item.current).join("、")}。`,
    snapshot: graphSnapshot(
      null,
      [],
      trace.map((item) => item.current),
      [],
      [],
      `BFS 顺序：${trace.map((item) => item.current).join(" → ")}`,
    ),
    code_highlight: {
      language: "typescript",
      lines: BFS_CODE,
      active_lines: [2, 8],
      active_line: 8,
      variables: { queue: "[]", order: trace.map((item) => item.current).join(" → ") },
      operation_label: "queue exhausted",
    },
  }));

  const timed = applyNarrationTimeline(steps, FPS);
  return {
    schema_version: "2.0.0",
    fps: FPS,
    total_frames: timed.at(-1)?.end_frame ?? 0,
    domain: "algorithm",
    title: "二叉树 BFS：队列驱动的层序遍历",
    summary: "逐步展示出队、发现邻接节点、入队和访问集合的同步变化。",
    steps: timed,
    parameter_controls: [{
      id: "startNode",
      label: "起始节点",
      value: startNode,
      description: "选择后在固定树结构上重新执行 BFS。",
    }],
    algorithm_id: "bfs_graph",
    initial_data: { start_node: [startNode], nodes: BFS_NODES.map((node) => node.id) },
  };
}

function buildBfsFollowups(params: TemplatePreviewParams): TemplatePreviewFollowups {
  const requestedStart = String(params.startNode ?? "1");
  const startNode = BFS_NODES.some((node) => node.id === requestedStart) ? requestedStart : "1";
  const trace = bfsTrace(startNode);
  const followups: TemplatePreviewFollowups = {
    "bfs-intro": questions(
      "bfs-intro",
      ["为什么先把起点放进队列？", "队列保存已经发现、但还没有展开邻居的节点。"],
      ["为什么使用先进先出？", "先进先出保证先发现的浅层节点先被处理，因此形成逐层遍历。"],
      ["visited 集合有什么作用？", "它记录已经发现的节点，避免同一个节点被重复入队和访问。"],
    ),
  };
  trace.forEach((state) => {
    followups[`bfs-visit-${state.current}`] = questions(
      `bfs-visit-${state.current}`,
      ["当前队列里有什么？", state.queue.length ? `当前队列是 [${state.queue.join(", ")}]。` : "当前队列已经为空。"],
      ["哪些节点刚被发现？", state.frontier.length ? `刚发现 ${state.frontier.join("、")}，并按这个顺序入队。` : "这一轮没有发现新节点。"],
      ["visited 此时防止了什么？", "它阻止已经发现的节点再次进入队列，避免重复遍历。"],
    );
  });
  followups["bfs-result"] = questions(
    "bfs-result",
    ["最终访问顺序是什么？", trace.map((item) => item.current).join(" → ")],
    ["怎样判断 BFS 结束？", "队列为空，说明所有已发现节点都已经完成展开。"],
    ["为什么结果是层序的？", "队列先进先出，因此较浅层节点总会先于更深层节点出队。"],
  );
  return followups;
}

const TEMPLATE_PREVIEW_CASES: Record<TemplatePreviewCaseId, TemplatePreviewCase> = {
  ...Object.fromEntries(PUBLIC_GOLD_TEMPLATES.map((item) => [
    item.caseId,
    manifestToPreviewCase(item),
  ])),
  "sliding-window": SLIDING_WINDOW_PREVIEW_CASE,
  "merge-sort": MERGE_SORT_PREVIEW_CASE,
  "quick-sort": QUICK_SORT_PREVIEW_CASE,
  "binary-search": {
    id: "binary-search",
    templateId: "binary-search",
    posterUrl: "/template-previews/binary-search/poster.webp",
    posterAlt: "二分查找区间逐步收敛的 Playbook 画面",
    posterFrame: posterFrameForStep(buildBinarySearchScript({ target: 22 }), 4),
    defaultParams: { target: 22 },
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
    buildScript: buildBinarySearchScript,
    buildFollowups: (params) => buildBinaryFollowups(params),
  },
  "bfs-tree": {
    id: "bfs-tree",
    templateId: "bfs-tree",
    posterUrl: "/template-previews/bfs-tree/poster.webp",
    posterAlt: "二叉树 BFS 队列与访问顺序的 Playbook 画面",
    posterFrame: posterFrameForStep(buildBfsScript({ startNode: "1" }), 4),
    defaultParams: { startNode: "1" },
    controls: [{
      id: "startNode",
      kind: "select",
      label: "起始节点",
      description: "更换起点后重新遍历",
      options: BFS_NODES.map((node) => ({ label: `节点 ${node.id}`, value: node.id })),
      resetPlayback: true,
    }],
    buildScript: buildBfsScript,
    buildFollowups: (params) => buildBfsFollowups(params),
  },
};

export const TEMPLATE_PREVIEW_CASE_IDS = Object.freeze(
  Object.keys(TEMPLATE_PREVIEW_CASES),
);

export function isTemplatePreviewCaseId(value: string): value is TemplatePreviewCaseId {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_PREVIEW_CASES, value);
}

export function getTemplatePreviewCase(value: string): TemplatePreviewCase | null {
  return isTemplatePreviewCaseId(value) ? TEMPLATE_PREVIEW_CASES[value] : null;
}

export function buildDefaultTemplatePreviewScripts(): Record<TemplatePreviewCaseId, PlaybookScript> {
  return Object.fromEntries(TEMPLATE_PREVIEW_CASE_IDS.map((id) => {
    const item = TEMPLATE_PREVIEW_CASES[id];
    return [id, item.buildScript(item.defaultParams)];
  }));
}
