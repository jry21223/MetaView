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
 * Dijkstra 最短路径。
 *
 * 六节点带权无向图，起点可选。每一步选出尚未确定的、当前距离最小的节点把它
 * “封存”，再松弛它的邻边。节点标签直接写当前距离，已封存节点、当前节点与
 * 待处理的候选节点用三种状态区分，松弛成功的边高亮。
 */
export const DIJKSTRA_NODE_IDS = ["A", "B", "C", "D", "E", "F"] as const;
export type DijkstraNodeId = (typeof DIJKSTRA_NODE_IDS)[number];

const NODE_POSITIONS: Record<DijkstraNodeId, { x: number; y: number }> = {
  A: { x: -3, y: -1.2 },
  B: { x: -1, y: -2.1 },
  C: { x: -1, y: 0.3 },
  D: { x: 1, y: -1.4 },
  E: { x: 1, y: 1.3 },
  F: { x: 3, y: -0.1 },
};

export const DIJKSTRA_EDGES: ReadonlyArray<readonly [DijkstraNodeId, DijkstraNodeId, number]> = [
  ["A", "B", 4],
  ["A", "C", 2],
  ["B", "C", 1],
  ["B", "D", 5],
  ["C", "D", 8],
  ["C", "E", 10],
  ["D", "E", 2],
  ["D", "F", 6],
  ["E", "F", 3],
];

const DEFAULT_SOURCE: DijkstraNodeId = "A";

export const DIJKSTRA_CODE = [
  "function dijkstra(graph: Graph, source: string): Map<string, number> {",
  "  const dist = new Map(nodes.map((n) => [n, Infinity]));",
  "  dist.set(source, 0);",
  "  const settled = new Set<string>();",
  "  while (settled.size < nodes.length) {",
  "    const u = closestUnsettled(dist, settled);",
  "    settled.add(u);",
  "    for (const [v, w] of graph[u]) {",
  "      if (dist.get(u)! + w < dist.get(v)!) dist.set(v, dist.get(u)! + w);",
  "    }",
  "  }",
  "  return dist;",
  "}",
] as const;

export type DistanceTable = Record<DijkstraNodeId, number>;

export interface DijkstraRelaxation {
  edgeId: string;
  to: DijkstraNodeId;
  weight: number;
  before: number;
  after: number;
}

export interface DijkstraStep {
  current: DijkstraNodeId;
  /** Nodes settled before this step. */
  settledBefore: DijkstraNodeId[];
  /** Nodes settled after this step (including current). */
  settledAfter: DijkstraNodeId[];
  /** Distances after relaxing the current node's edges. */
  dist: DistanceTable;
  /** Parent pointers after this step. */
  parent: Partial<Record<DijkstraNodeId, DijkstraNodeId>>;
  /** Edges whose relaxation improved a distance in this step. */
  relaxed: DijkstraRelaxation[];
  /** Unsettled nodes with a finite tentative distance after this step. */
  frontier: DijkstraNodeId[];
}

export function edgeId(left: DijkstraNodeId, right: DijkstraNodeId): string {
  return DIJKSTRA_EDGES.some(([a, b]) => a === left && b === right) ? `${left}-${right}` : `${right}-${left}`;
}

function neighbors(node: DijkstraNodeId): Array<{ to: DijkstraNodeId; weight: number; edgeId: string }> {
  return DIJKSTRA_EDGES.flatMap(([a, b, weight]) =>
    a === node ? [{ to: b, weight, edgeId: `${a}-${b}` }] : b === node ? [{ to: a, weight, edgeId: `${a}-${b}` }] : [],
  );
}

export function resolveDijkstraSource(params: TemplatePreviewParams): DijkstraNodeId {
  return stringParam(params, "source", DIJKSTRA_NODE_IDS, DEFAULT_SOURCE) as DijkstraNodeId;
}

/** Pure Dijkstra trace: one entry per settled node, ties broken by node order. */
export function dijkstraTrace(source: DijkstraNodeId): DijkstraStep[] {
  const dist = Object.fromEntries(DIJKSTRA_NODE_IDS.map((id) => [id, Infinity])) as DistanceTable;
  dist[source] = 0;
  const parent: Partial<Record<DijkstraNodeId, DijkstraNodeId>> = {};
  const settled: DijkstraNodeId[] = [];
  const steps: DijkstraStep[] = [];

  while (settled.length < DIJKSTRA_NODE_IDS.length) {
    const candidates = DIJKSTRA_NODE_IDS.filter((id) => !settled.includes(id) && Number.isFinite(dist[id]));
    if (candidates.length === 0) break;
    const current = candidates.reduce((best, id) => (dist[id] < dist[best] ? id : best), candidates[0]!);
    const settledBefore = [...settled];
    settled.push(current);
    const relaxed: DijkstraRelaxation[] = [];
    for (const edge of neighbors(current)) {
      if (settled.includes(edge.to)) continue;
      const candidate = dist[current] + edge.weight;
      if (candidate < dist[edge.to]) {
        relaxed.push({ edgeId: edge.edgeId, to: edge.to, weight: edge.weight, before: dist[edge.to], after: candidate });
        dist[edge.to] = candidate;
        parent[edge.to] = current;
      }
    }
    steps.push({
      current,
      settledBefore,
      settledAfter: [...settled],
      dist: { ...dist },
      parent: { ...parent },
      relaxed,
      frontier: DIJKSTRA_NODE_IDS.filter((id) => !settled.includes(id) && Number.isFinite(dist[id])),
    });
  }
  return steps;
}

function distLabel(value: number): string {
  return Number.isFinite(value) ? String(value) : "∞";
}

function distText(dist: DistanceTable): string {
  return DIJKSTRA_NODE_IDS.map((id) => `${id}=${distLabel(dist[id])}`).join(" ");
}

function graphNodes(dist: DistanceTable): GraphSceneNode[] {
  return DIJKSTRA_NODE_IDS.map((id) => ({
    id,
    label: `${id} ${distLabel(dist[id])}`,
    x: NODE_POSITIONS[id].x,
    y: NODE_POSITIONS[id].y,
  }));
}

const GRAPH_EDGES: GraphSceneEdge[] = DIJKSTRA_EDGES.map(([a, b, weight]) => ({
  id: `${a}-${b}`,
  source: a,
  target: b,
  weight,
}));

function dijkstraSnapshot(args: {
  dist: DistanceTable;
  current: DijkstraNodeId | null;
  settled: readonly DijkstraNodeId[];
  frontier: readonly DijkstraNodeId[];
  activeEdges: readonly string[];
  caption: string;
}): GraphSceneSnapshot {
  return {
    kind: "graph_scene",
    nodes: graphNodes(args.dist),
    edges: GRAPH_EDGES,
    directed: false,
    weighted: true,
    current_node_id: args.current,
    active_node_ids: [],
    active_edge_ids: [...args.activeEdges],
    visited_node_ids: [...args.settled],
    queue_node_ids: [...args.frontier],
    frontier_node_ids: [],
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
    lines: [...DIJKSTRA_CODE],
    active_lines: activeLines,
    active_line: activeLine,
    variables,
    operation_label: operationLabel,
  };
}

export function shortestPath(
  parent: Partial<Record<DijkstraNodeId, DijkstraNodeId>>,
  source: DijkstraNodeId,
  target: DijkstraNodeId,
): DijkstraNodeId[] {
  const path: DijkstraNodeId[] = [target];
  let cursor: DijkstraNodeId | undefined = target;
  while (cursor && cursor !== source) {
    cursor = parent[cursor];
    if (cursor) path.unshift(cursor);
  }
  return path;
}

export function buildDijkstraScript(params: TemplatePreviewParams): PlaybookScript {
  const source = resolveDijkstraSource(params);
  const trace = dijkstraTrace(source);
  const initialDist = Object.fromEntries(DIJKSTRA_NODE_IDS.map((id) => [id, id === source ? 0 : Infinity])) as DistanceTable;

  const steps: MetaStep[] = [
    algorithmStep(0, {
      step_id: "dijkstra-intro",
      title: `从 ${source} 出发，其他距离都是 ∞`,
      voiceover_text: `图有 ${DIJKSTRA_NODE_IDS.length} 个节点、${DIJKSTRA_EDGES.length} 条带权边，要求 ${source} 到每个节点的最短距离。初始化：${source} 的距离是 0，其余都是无穷大。Dijkstra 的核心是贪心：每次把当前距离最小且尚未确定的节点确定下来，再用它去更新邻居。画面里橙色是当前节点，灰色是已经确定的节点，虚线描边的是有了距离、还在候选的节点。`,
      snapshot: dijkstraSnapshot({
        dist: initialDist,
        current: null,
        settled: [],
        frontier: [source],
        activeEdges: [],
        caption: `dist: ${distText(initialDist)} · 橙=当前 灰=已确定 虚线=候选`,
      }),
      code_highlight: codeHighlight(
        2,
        { source, dist: distText(initialDist), settled: "{}" },
        "initialize distances",
        [1, 2, 3],
      ),
    }),
  ];

  trace.forEach((item, index) => {
    const relaxedText = item.relaxed.length
      ? item.relaxed
        .map((relax) => Number.isFinite(relax.before)
          ? `${relax.to} 从 ${relax.before} 缩短到 ${relax.after}`
          : `${relax.to} 首次到达，距离 ${relax.after}`)
        .join("，")
      : "没有邻居的距离被缩短";
    steps.push(algorithmStep(steps.length, {
      step_id: `dijkstra-settle-${item.current}`,
      title: `确定 ${item.current}（距离 ${item.dist[item.current]}），松弛邻边`,
      voiceover_text: index === 0
        ? `未确定的节点里 ${item.current} 的距离最小，把它确定为 ${item.dist[item.current]}。然后检查它的每条邻边：经由 ${item.current} 到达邻居的距离若更短就更新。${relaxedText}。`
        : `尚未确定的节点中距离最小的是 ${item.current}，距离 ${item.dist[item.current]}。它不可能再被缩短——任何别的路径都要先经过一个距离不小于它的节点。确定它之后松弛邻边：${relaxedText}。`,
      snapshot: dijkstraSnapshot({
        dist: item.dist,
        current: item.current,
        settled: item.settledBefore,
        frontier: item.frontier,
        activeEdges: item.relaxed.map((relax) => relax.edgeId),
        caption: `dist: ${distText(item.dist)} · 已确定 {${item.settledAfter.join(", ")}}`,
      }),
      code_highlight: codeHighlight(
        item.relaxed.length ? 8 : 5,
        {
          u: item.current,
          "dist[u]": String(item.dist[item.current]),
          relaxed: item.relaxed.length ? item.relaxed.map((relax) => `${relax.to}=${relax.after}`).join(",") : "none",
          settled: `{${item.settledAfter.join(",")}}`,
        },
        `settle ${item.current}`,
        item.relaxed.length ? [5, 6, 7, 8] : [5, 6, 7],
      ),
    }));
  });

  const last = trace.at(-1)!;
  const treeEdges = DIJKSTRA_NODE_IDS.flatMap((id) => {
    const parentId = last.parent[id];
    return parentId ? [edgeId(parentId, id)] : [];
  });
  const farthest = DIJKSTRA_NODE_IDS.filter((id) => id !== source)
    .reduce((best, id) => (last.dist[id] > last.dist[best] ? id : best), DIJKSTRA_NODE_IDS.find((id) => id !== source)!);
  steps.push(algorithmStep(steps.length, {
    step_id: "dijkstra-result",
    title: "所有节点确定，最短路径树成形",
    voiceover_text: `六个节点全部确定，最终距离是 ${distText(last.dist)}。把每个节点的“最后一次更新来自谁”连起来，就得到从 ${source} 出发的最短路径树；例如到 ${farthest} 的路径依次经过 ${shortestPath(last.parent, source, farthest).join("、")}，长度 ${last.dist[farthest]}。贪心成立的前提是边权非负，有负权边时要改用 Bellman-Ford。`,
    snapshot: dijkstraSnapshot({
      dist: last.dist,
      current: null,
      settled: last.settledAfter,
      frontier: [],
      activeEdges: treeEdges,
      caption: `最短路径树：${DIJKSTRA_NODE_IDS.filter((id) => id !== source).map((id) => `${id}←${last.parent[id] ?? "?"}`).join("  ")}`,
    }),
    code_highlight: codeHighlight(
      11,
      {
        dist: distText(last.dist),
        [`path(${farthest})`]: shortestPath(last.parent, source, farthest).join("→"),
        complexity: "O((V+E) log V)",
      },
      "return dist",
    ),
  }));

  return buildAlgorithmPlaybook({
    title: "Dijkstra：贪心确定最短距离",
    summary: "在带权无向图上从可选起点出发，每步确定距离最小的未定节点并松弛邻边，节点标签实时显示距离，最后高亮最短路径树。",
    algorithmId: "dijkstra_shortest_path",
    steps,
    controls: [{
      id: "source",
      label: "起点",
      value: source,
      description: "更换起点后在同一张图上重新运行 Dijkstra。",
    }],
    initialData: {
      source: [source],
      nodes: [...DIJKSTRA_NODE_IDS],
      result: DIJKSTRA_NODE_IDS.map((id) => `${id}=${distLabel(last.dist[id])}`),
    },
  });
}

export function buildDijkstraFollowups(params: TemplatePreviewParams): TemplatePreviewFollowups {
  const source = resolveDijkstraSource(params);
  const trace = dijkstraTrace(source);
  const last = trace.at(-1)!;

  const followups: TemplatePreviewFollowups = {
    "dijkstra-intro": algorithmQuestions(
      "dijkstra-intro",
      ["为什么除起点外都初始化为 ∞？", "还没有找到任何路径时距离未知，用 ∞ 表示“暂时不可达”，任何真实路径都会比它短。"],
      ["Dijkstra 和 BFS 有什么关系？", "BFS 按边数扩展，是所有边权为 1 的 Dijkstra；边权不同时必须按累计距离而不是层数扩展。"],
      ["什么情况下不能用 Dijkstra？", "存在负权边时贪心会失效——已经确定的节点可能被负边再次缩短。"],
    ),
  };

  trace.forEach((item, index) => {
    const stepId = `dijkstra-settle-${item.current}`;
    const rival = item.frontier.length
      ? item.frontier.reduce((best, id) => (item.dist[id] < item.dist[best] ? id : best), item.frontier[0]!)
      : null;
    followups[stepId] = algorithmQuestions(
      stepId,
      ["为什么这一步选 " + item.current + "？", index === 0
        ? `起点的距离是 0，是唯一确定的候选。`
        : `未确定节点中它的距离 ${item.dist[item.current]} 最小；其他候选都不小于它。`],
      ["为什么它的距离不会再被缩短？", "边权非负：任何别的路径都要先经过某个未确定节点，而那些节点的距离都已经不小于它。"],
      ["下一个会确定谁？", rival ? `候选里距离最小的是 ${rival}（${item.dist[rival]}）。` : "所有节点都已确定。"],
    );
  });

  followups["dijkstra-result"] = algorithmQuestions(
    "dijkstra-result",
    ["最终距离表是什么？", distText(last.dist)],
    ["最短路径树是怎么来的？", "每个节点记住最后一次把它缩短的前驱，沿前驱回溯就是最短路径，所有回溯边合起来是一棵树。"],
    ["复杂度是多少？", "用二叉堆维护候选时是 O((V+E) log V)；本例只有 6 个节点，线性扫描也足够。"],
  );

  return followups;
}

export const DIJKSTRA_PREVIEW_CASE = defineAlgorithmPreviewCase({
  id: "dijkstra",
  posterAlt: "Dijkstra 最短路径：带权图上的当前节点、已确定集合与松弛成功的边",
  posterStepIndex: 3,
  defaultParams: { source: DEFAULT_SOURCE },
  controls: [
    {
      id: "source",
      kind: "select",
      label: "起点",
      description: "更换起点后重新运行 Dijkstra。",
      resetPlayback: true,
      options: DIJKSTRA_NODE_IDS.map((id) => ({ label: `节点 ${id}`, value: id })),
    },
  ],
  buildScript: buildDijkstraScript,
  buildFollowups: buildDijkstraFollowups,
});
