import type {
  GraphSceneEdge,
  GraphSceneNode,
  GraphSceneSnapshot,
} from "../../../features/playbook/engine/types";
import { graphSceneSnapshot } from "../../../features/playbook/engine/kits/algorithm/graphScene";
import type { TemplatePreviewParams } from "../templatePreviewCases";
import {
  codeHighlightFor,
  defineAlgorithmCase,
  definePresetParam,
  type AlgorithmCaseFrame,
  type AlgorithmStepDraft,
} from "./helpers";

/**
 * 二叉树 BFS：队列驱动的层序遍历。
 *
 * 七节点满二叉树，起点可选。每一步让一个节点出队、把尚未发现的邻接节点
 * 入队，队列、访问集合和活动边同步更新。
 */
export const BFS_NODES: GraphSceneNode[] = [
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

export const BFS_EDGES: GraphSceneEdge[] = BFS_EDGE_PAIRS.map(([source, target]) => ({
  id: `${source}-${target}`,
  source,
  target,
}));

const DEFAULT_START_NODE = "1";

const START_NODE_PARAM = definePresetParam({
  id: "startNode",
  label: "起始节点",
  description: "更换起点后重新遍历",
  playbookDescription: "选择后在固定树结构上重新执行 BFS。",
  options: BFS_NODES.map((node) => ({ value: node.id, label: `节点 ${node.id}` })),
  defaultValue: DEFAULT_START_NODE,
});

export const BFS_CODE = [
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

export interface BfsState {
  current: string;
  queue: string[];
  visited: string[];
  frontier: string[];
  activeEdges: string[];
}

export const resolveBfsStartNode = START_NODE_PARAM.resolve;

/** Pure BFS trace: one entry per dequeued node. */
export function bfsTrace(startNode: string): BfsState[] {
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
  return graphSceneSnapshot({
    packId: "algorithm-code-basic",
    assetId: "bfs-graph-preset",
    nodes: BFS_NODES,
    edges: BFS_EDGES,
    currentNodeId: current,
    activeNodeIds: current ? [current] : [],
    activeEdgeIds: activeEdges,
    visitedNodeIds: visited,
    queueNodeIds: queue,
    frontierNodeIds: frontier,
    caption,
  });
}

const codeHighlight = codeHighlightFor(BFS_CODE);

function buildBfsSteps(params: TemplatePreviewParams): AlgorithmCaseFrame<GraphSceneSnapshot> {
  const startNode = resolveBfsStartNode(params);
  const trace = bfsTrace(startNode);

  const steps: Array<AlgorithmStepDraft<GraphSceneSnapshot>> = [
    {
      step_id: "bfs-intro",
      title: "起点进入队列",
      voiceover_text: `从节点 ${startNode} 开始，把它加入先进先出的队列。`,
      snapshot: graphSnapshot(null, [startNode], [], [startNode], [], `队列初始化为 [${startNode}]。`),
      code_highlight: codeHighlight(
        0,
        { start: startNode, queue: `[${startNode}]`, visited: `{${startNode}}` },
        "initialize queue",
        [0, 1],
      ),
      questions: [
        ["为什么先把起点放进队列？", "队列保存已经发现、但还没有展开邻居的节点。"],
        ["为什么使用先进先出？", "先进先出保证先发现的浅层节点先被处理，因此形成逐层遍历。"],
        ["visited 集合有什么作用？", "它记录已经发现的节点，避免同一个节点被重复入队和访问。"],
      ],
    },
  ];

  trace.forEach((state) => {
    steps.push({
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
      code_highlight: codeHighlight(
        state.frontier.length > 0 ? 6 : 5,
        {
          current: state.current,
          queue: `[${state.queue.join(", ")}]`,
          visited: `{${state.visited.join(", ")}}`,
          frontier: `[${state.frontier.join(", ")}]`,
        },
        `visit ${state.current}`,
        state.frontier.length > 0 ? [3, 4, 6] : [3, 4, 5],
      ),
      questions: [
        ["当前队列里有什么？", state.queue.length ? `当前队列是 [${state.queue.join(", ")}]。` : "当前队列已经为空。"],
        ["哪些节点刚被发现？", state.frontier.length ? `刚发现 ${state.frontier.join("、")}，并按这个顺序入队。` : "这一轮没有发现新节点。"],
        ["visited 此时防止了什么？", "它阻止已经发现的节点再次进入队列，避免重复遍历。"],
      ],
    });
  });

  steps.push({
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
    code_highlight: codeHighlight(
      8,
      { queue: "[]", order: trace.map((item) => item.current).join(" → ") },
      "queue exhausted",
      [2, 8],
    ),
    questions: [
      ["最终访问顺序是什么？", trace.map((item) => item.current).join(" → ")],
      ["怎样判断 BFS 结束？", "队列为空，说明所有已发现节点都已经完成展开。"],
      ["为什么结果是层序的？", "队列先进先出，因此较浅层节点总会先于更深层节点出队。"],
    ],
  });

  return {
    steps,
    controls: [START_NODE_PARAM.playbookControl(startNode)],
    initialData: { start_node: [startNode], nodes: BFS_NODES.map((node) => node.id) },
  };
}

export const BFS_TREE_PREVIEW_CASE = defineAlgorithmCase({
  id: "bfs-tree",
  posterAlt: "二叉树 BFS 队列与访问顺序的 Playbook 画面",
  posterStepIndex: 4,
  defaultParams: { startNode: DEFAULT_START_NODE },
  controls: [START_NODE_PARAM.control],
  title: "二叉树 BFS：队列驱动的层序遍历",
  summary: "逐步展示出队、发现邻接节点、入队和访问集合的同步变化。",
  algorithmId: "bfs_graph",
  buildSteps: buildBfsSteps,
});

export const buildBfsScript = BFS_TREE_PREVIEW_CASE.buildScript;
export const buildBfsFollowups = BFS_TREE_PREVIEW_CASE.buildFollowups;
