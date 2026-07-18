import type {
  GraphSceneEdge,
  GraphSceneNode,
  GraphSceneSnapshot,
  MathSceneSnapshot,
  MathPlotSnapshot,
  MetaStep,
  PhysicsForceSceneSnapshot,
  PlaybookScript,
} from "../../features/playbook/engine/types";

export type TemplatePreviewCaseId =
  | "binary-search"
  | "bfs-tree"
  | "derivative-tangent"
  | "pole-polar"
  | "projectile";

export type TemplatePreviewParamValue = number | string;
export type TemplatePreviewParams = Record<string, TemplatePreviewParamValue>;

export interface TemplatePreviewQuestion {
  id: string;
  question: string;
  answer: string;
}

export type TemplatePreviewFollowups = Record<string, TemplatePreviewQuestion[]>;

interface BaseTemplatePreviewControl {
  id: string;
  label: string;
  description: string;
  resetPlayback: boolean;
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

function fixed(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? "0" : String(rounded);
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
  return {
    kind: "algorithm_bars",
    array_values: BINARY_VALUES.map(String),
    numeric_values: BINARY_VALUES,
    active_indices: mid == null ? [] : [mid],
    swap_indices: [],
    sorted_indices: discarded,
    pointers,
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

  return {
    schema_version: "2.0.0",
    fps: FPS,
    total_frames: steps.length * STEP_FRAMES,
    domain: "algorithm",
    title: "二分查找：区间如何收敛",
    summary: "用 low、mid、high 的连续变化解释二分查找为何每轮排除一半候选。",
    steps,
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

  return {
    schema_version: "2.0.0",
    fps: FPS,
    total_frames: steps.length * STEP_FRAMES,
    domain: "algorithm",
    title: "二叉树 BFS：队列驱动的层序遍历",
    summary: "逐步展示出队、发现邻接节点、入队和访问集合的同步变化。",
    steps,
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

// ── Derivative and tangent ────────────────────────────────────────────────

function lineExpression(slope: number, intercept: number): string {
  const m = fixed(slope, 3);
  const b = Number(fixed(intercept, 3));
  if (b === 0) return `${m}*x`;
  return `${m}*x${b > 0 ? "+" : "-"}${fixed(Math.abs(b), 3)}`;
}

function derivativeSnapshot(
  markerX: number,
  h: number | null | undefined,
  caption: string,
  formulaLatex: string,
): MathPlotSnapshot {
  const curves: MathPlotSnapshot["curves"] = [
    { expression: "x^2", label: "f(x)=x²", emphasis: "primary", semantic_role: "curve" },
  ];
  if (typeof h === "number") {
    const slope = 2 * markerX + h;
    const intercept = -markerX * (markerX + h);
    curves.push({
      expression: lineExpression(slope, intercept),
      label: `割线斜率 ${fixed(slope)}`,
      emphasis: "secondary",
      semantic_role: "slope",
    });
  } else if (h === null) {
    const slope = 2 * markerX;
    const intercept = -(markerX ** 2);
    curves.push({
      expression: lineExpression(slope, intercept),
      label: `切线斜率 ${fixed(slope)}`,
      emphasis: "accent",
      semantic_role: "tangent",
    });
  }
  return {
    kind: "math_plot",
    pack_id: "math-basic",
    asset_id: "derivative-tangent-preset",
    curves,
    params: { a: markerX },
    x_min: -3,
    x_max: 3,
    y_min: -2,
    y_max: 9,
    marker_x: markerX,
    shade_from: h === undefined ? null : h === null ? markerX - 0.08 : markerX,
    shade_to: h === undefined ? null : h === null ? markerX + 0.08 : markerX + h,
    x_label: "x",
    y_label: "f(x)",
    formula_latex: formulaLatex,
    caption,
  };
}

function buildDerivativeScript(params: TemplatePreviewParams): PlaybookScript {
  const markerX = Math.max(-2, Math.min(2, finiteNumber(params, "markerX", 1)));
  const slope = 2 * markerX;
  const secants = [1, 0.5, 0.1];
  const steps: MetaStep[] = [
    step(0, {
      step_id: "derivative-curve",
      title: "观察函数曲线",
      voiceover_text: `先观察 f(x)=x²，并把切点放在 a=${fixed(markerX)}。`,
      snapshot: derivativeSnapshot(markerX, undefined, "先确认函数形状和切点位置，再引入割线。", "f(x)=x^2"),
    }),
  ];
  secants.forEach((h, index) => {
    const secantSlope = 2 * markerX + h;
    steps.push(step(steps.length, {
      step_id: `derivative-secant-${index + 1}`,
      title: `缩小间隔 h=${h}`,
      voiceover_text: `当 h=${h} 时，割线斜率是 ${fixed(secantSlope)}。h 越小，割线越接近切线。`,
      snapshot: derivativeSnapshot(
        markerX,
        h,
        `割线斜率 ${fixed(secantSlope)} 正在逼近 ${fixed(slope)}。`,
        `\\frac{f(a+h)-f(a)}{h}=${fixed(secantSlope)}`,
      ),
    }));
  });
  steps.push(step(steps.length, {
    step_id: "derivative-tangent",
    title: "割线收敛为切线",
    voiceover_text: `当 h 趋近于零，割线斜率趋近 ${fixed(slope)}，这就是切点处的导数。`,
    snapshot: derivativeSnapshot(
      markerX,
      null,
      `切线斜率等于 f'(${fixed(markerX)})=${fixed(slope)}。`,
      `f'(${fixed(markerX)})=${fixed(slope)}`,
    ),
  }));
  steps.push(step(steps.length, {
    step_id: "derivative-result",
    title: "得到导数公式",
    voiceover_text: `对任意切点 a，f(x)=x² 的导数都是 f'(a)=2a。当前切点的斜率是 ${fixed(slope)}。`,
    snapshot: derivativeSnapshot(
      markerX,
      null,
      `切点移动时，切线仍满足 y=${fixed(slope)}x${-(markerX ** 2) >= 0 ? "+" : "-"}${fixed(Math.abs(markerX ** 2))}。`,
      "f'(a)=2a",
    ),
  }));

  return {
    schema_version: "2.0.0",
    fps: FPS,
    total_frames: steps.length * STEP_FRAMES,
    domain: "math",
    title: "导数与切线：从割线到瞬时斜率",
    summary: "让割线间隔逐步趋近零，直观看见导数如何成为切线斜率。",
    steps,
    parameter_controls: [{
      id: "markerX",
      label: "切点 a",
      value: fixed(markerX),
      description: "拖动后同步更新割线、切线和导数值。",
    }],
    algorithm_id: "derivative_tangent",
    initial_data: { function: ["x^2"], marker_x: [fixed(markerX)] },
  };
}

function buildDerivativeFollowups(params: TemplatePreviewParams, script: PlaybookScript): TemplatePreviewFollowups {
  const markerX = Math.max(-2, Math.min(2, finiteNumber(params, "markerX", 1)));
  const slope = 2 * markerX;
  return Object.fromEntries(script.steps.map((item) => [
    item.step_id,
    questions(
      item.step_id,
      ["这一幕的核心变化是什么？", item.voiceover_text],
      ["当前切点和斜率是多少？", `切点 a=${fixed(markerX)}，对应导数与切线斜率都是 ${fixed(slope)}。`],
      item.step_id.includes("secant")
        ? ["为什么还不是切线？", "当前仍连接两个不同的函数点；只有当 h 趋近零时，割线才收敛为切线。"]
        : ["导数在图像上表示什么？", "导数表示当前切点处切线的斜率，也就是函数在这一点的瞬时变化率。"],
    ),
  ]));
}

// ── Pole and polar line ──────────────────────────────────────────────────

const POLE_POLAR_RADIUS = 5;

interface PolePolarValues {
  radius: number;
  k: number;
  sum: number;
  pointA: [number, number];
  pointB: [number, number];
}

function polePolarValues(params: TemplatePreviewParams): PolePolarValues {
  const radius = POLE_POLAR_RADIUS;
  const k = Math.max(4, Math.min(8, finiteNumber(params, "k", 5)));
  const sum = radius ** 2 / k;
  const delta = Math.sqrt(2 * radius ** 2 - sum ** 2);
  return {
    radius,
    k,
    sum,
    pointA: [(sum + delta) / 2, (sum - delta) / 2],
    pointB: [(sum - delta) / 2, (sum + delta) / 2],
  };
}

function polePolarSnapshot(
  values: PolePolarValues,
  stage: 1 | 2 | 3 | 4 | 5 | 6,
  caption: string,
  formulaLatex: string,
): MathSceneSnapshot {
  const [ax, ay] = values.pointA;
  const [bx, by] = values.pointB;
  const showTangency = stage >= 2;
  const showChord = stage >= 3;
  const showPolar = stage === 6;
  const halfSpan = 5.8;
  const midpoint = values.sum / 2;

  const points: MathSceneSnapshot["points"] = [
    { x: 0, y: 0, label: "O", emphasis: "secondary" },
    { x: values.k, y: values.k, label: "P", emphasis: stage === 1 || stage === 5 ? "accent" : "primary" },
  ];
  if (showTangency) {
    points.push(
      { x: ax, y: ay, label: "A", emphasis: stage === 4 ? "accent" : "primary" },
      { x: bx, y: by, label: "B", emphasis: "primary" },
    );
  }

  const segments: MathSceneSnapshot["segments"] = [];
  if (showTangency) {
    segments.push(
      { x0: values.k, y0: values.k, x1: ax, y1: ay, label: "PA", emphasis: stage === 2 ? "accent" : "secondary" },
      { x0: values.k, y0: values.k, x1: bx, y1: by, label: "PB", emphasis: stage === 2 ? "accent" : "secondary" },
    );
  }
  if (showChord && !showPolar) {
    segments.push({ x0: ax, y0: ay, x1: bx, y1: by, label: "AB", emphasis: stage === 3 ? "accent" : "primary" });
  }
  if (showPolar) {
    segments.push({
      x0: midpoint - halfSpan,
      y0: midpoint + halfSpan,
      x1: midpoint + halfSpan,
      y1: midpoint - halfSpan,
      label: "polar-line",
      emphasis: "accent",
    });
  }

  const annotations: MathSceneSnapshot["annotations"] = [];
  if (stage === 3) annotations.push({ x: midpoint + 0.5, y: midpoint + 0.5, text: "接触弦 AB", align: "ne" });
  if (stage === 4) annotations.push({ x: ax + 0.45, y: ay + 0.65, text: "切点 A", align: "ne" });
  if (showPolar) annotations.push({ x: midpoint + 2.9, y: midpoint - 2.5, text: "极线 l", align: "se" });

  return {
    kind: "math_scene",
    x_min: -7,
    x_max: 10,
    y_min: -7,
    y_max: 10,
    x_label: "x",
    y_label: "y",
    curves: [{
      expression_x: `${values.radius}*cos(t)`,
      expression_y: `${values.radius}*sin(t)`,
      t_min: 0,
      t_max: 2 * Math.PI,
      label: "C",
      emphasis: stage === 1 ? "primary" : "secondary",
    }],
    points,
    segments,
    annotations,
    formula_latex: formulaLatex,
    caption,
    params: { R: values.radius, k: values.k },
  };
}

function buildPolePolarScript(params: TemplatePreviewParams): PlaybookScript {
  const values = polePolarValues(params);
  const k = fixed(values.k);
  const sum = fixed(values.sum);
  const steps: MetaStep[] = [
    step(0, {
      step_id: "pole-polar-setup",
      title: "确定圆与圆外点",
      voiceover_text: `圆 C 的半径是 ${values.radius}，外点 P=(${k},${k})。先确认 P 在圆外，才能作出两条实切线。`,
      snapshot: polePolarSnapshot(values, 1, "先建立圆与圆外点 P。", `C:x^2+y^2=${values.radius ** 2}`),
    }),
    step(1, {
      step_id: "pole-polar-tangents",
      title: "作出两条切线",
      voiceover_text: "从 P 向圆作 PA、PB 两条切线，半径 OA、OB 分别垂直于对应切线。",
      snapshot: polePolarSnapshot(values, 2, "A、B 是从 P 引出的两条切线的切点。", "PA\\perp OA,\\quad PB\\perp OB"),
    }),
    step(2, {
      step_id: "pole-polar-chord",
      title: "连接两个切点",
      voiceover_text: "连接 A、B 得到接触弦。关于这个圆，AB 就是外点 P 的极线。",
      snapshot: polePolarSnapshot(values, 3, "接触弦 AB 把两个切点连成一条直线。", "A,B\\in C"),
    }),
    step(3, {
      step_id: "pole-polar-tangent-equation",
      title: "写出切点处切线",
      voiceover_text: "若 A=(a,b)，圆在 A 点的切线方程是 ax+by=R²。",
      snapshot: polePolarSnapshot(values, 4, "把切点坐标写进圆的切线公式。", "A(a,b):\\quad ax+by=R^2"),
    }),
    step(4, {
      step_id: "pole-polar-substitute-pole",
      title: "代入共同的外点 P",
      voiceover_text: `P=(${k},${k}) 同时在 A、B 两点的切线上，所以 A、B 都满足 kx+ky=R²。`,
      snapshot: polePolarSnapshot(values, 5, `A、B 共同满足 x+y=${sum}。`, `ak+bk=R^2\\Rightarrow a+b=\\frac{R^2}{k}`),
    }),
    step(5, {
      step_id: "pole-polar-result",
      title: "得到极线方程",
      voiceover_text: `因此 P=(${k},${k}) 关于圆的极线是 kx+ky=R²，也就是 x+y=${sum}。`,
      snapshot: polePolarSnapshot(values, 6, `拖动 k 时，极线 x+y=${sum} 会与外点 P 同步移动。`, `\\boxed{kx+ky=R^2}\\iff\\boxed{x+y=${sum}}`),
    }),
  ];

  return {
    schema_version: "2.0.0",
    fps: FPS,
    total_frames: steps.length * STEP_FRAMES,
    domain: "math",
    title: "极点与极线：从两条切线到接触弦",
    summary: "用圆外点的两条切线推导接触弦方程，并观察极点移动时极线如何联动。",
    steps,
    parameter_controls: [{
      id: "k",
      label: "外点坐标 k",
      value: k,
      description: "外点固定为 P=(k,k)，圆半径 R=5。",
    }],
    algorithm_id: "circle_pole_polar",
    initial_data: { radius: [String(values.radius)], pole: [k, k], polar_sum: [sum] },
  };
}

function buildPolePolarFollowups(params: TemplatePreviewParams, script: PlaybookScript): TemplatePreviewFollowups {
  const values = polePolarValues(params);
  const k = fixed(values.k);
  const sum = fixed(values.sum);
  const [ax, ay] = values.pointA;
  const [bx, by] = values.pointB;
  return Object.fromEntries(script.steps.map((item) => {
    const specific: Record<string, [string, string]> = {
      "pole-polar-setup": ["为什么必须让 P 在圆外？", "圆外点才能向圆引出两条不同的实切线，从而得到两个切点 A、B。"],
      "pole-polar-tangents": ["怎样确认 PA、PB 是切线？", "切点处半径垂直于切线，所以 OA⊥PA、OB⊥PB。"],
      "pole-polar-chord": ["AB 在这里叫什么？", "AB 是两个切点的接触弦，也是 P 关于圆 C 的极线。"],
      "pole-polar-tangent-equation": ["切点 A 的坐标怎样进入切线方程？", "若 A=(a,b)，则切线为 ax+by=R²。"],
      "pole-polar-substitute-pole": ["为什么 A、B 满足同一个一次方程？", `P=(${k},${k}) 同时位于两条切线上，代入两条切线公式都会得到 kx+ky=R²。`],
      "pole-polar-result": ["当前极线的最终方程是什么？", `kx+ky=25，化简为 x+y=${sum}。`],
    };
    const third: Record<string, [string, string]> = {
      "pole-polar-setup": ["怎样验证 P 确实在圆外？", `OP²=2k²=${fixed(2 * values.k ** 2)}，大于 R²=25。`],
      "pole-polar-tangents": ["当前两个切点坐标是多少？", `A=(${fixed(ax)},${fixed(ay)})，B=(${fixed(bx)},${fixed(by)})。`],
      "pole-polar-chord": ["接触弦由什么决定？", "圆固定后，接触弦的位置只由圆外点 P 决定。"],
      "pole-polar-tangent-equation": ["为什么切线公式右侧是 R²？", "因为 A 在圆上，所以 a²+b²=R²；把 A 代入 ax+by 正好得到 R²。"],
      "pole-polar-substitute-pole": ["这里如何同时利用两个切点？", "对 A、B 分别重复同一次代入，就能证明它们落在同一条直线上。"],
      "pole-polar-result": ["k 变大时极线怎样移动？", "R 固定时 R²/k 变小，所以直线 x+y=R²/k 向原点方向平移。"],
    };
    return [item.step_id, questions(
      item.step_id,
      specific[item.step_id] ?? ["这一幕说明什么？", item.voiceover_text],
      ["本题最关键的不变量是什么？", "两个切点始终同时位于圆上，并且同时满足由外点 P 决定的一次方程。"],
      third[item.step_id] ?? ["下一步要寻找什么？", "继续寻找能同时描述两个切点的一次方程。"],
    )];
  }));
}

// ── Projectile motion ─────────────────────────────────────────────────────

const GRAVITY = 9.8;

interface ProjectileValues {
  speed: number;
  angle: number;
  vx: number;
  vy0: number;
  flightTime: number;
  range: number;
  maxHeight: number;
}

function projectileValues(params: TemplatePreviewParams): ProjectileValues {
  const speed = Math.max(10, Math.min(30, finiteNumber(params, "speed", 20)));
  const angle = Math.max(15, Math.min(75, finiteNumber(params, "angle", 45)));
  const radians = angle * Math.PI / 180;
  const vx = speed * Math.cos(radians);
  const vy0 = speed * Math.sin(radians);
  const flightTime = 2 * vy0 / GRAVITY;
  return {
    speed,
    angle,
    vx,
    vy0,
    flightTime,
    range: vx * flightTime,
    maxHeight: vy0 ** 2 / (2 * GRAVITY),
  };
}

function projectileTrajectory(values: ProjectileValues): Array<[number, number]> {
  return Array.from({ length: 25 }, (_, index) => {
    const fraction = index / 24;
    const time = values.flightTime * fraction;
    const height = values.vy0 * time - 0.5 * GRAVITY * time ** 2;
    const x = 14 + fraction * 72;
    const y = 78 - (height / values.maxHeight) * 48;
    return [Number(x.toFixed(2)), Number(y.toFixed(2))];
  });
}

function projectileSnapshot(
  values: ProjectileValues,
  fraction: number,
  caption: string,
  formulaLatex: string,
): PhysicsForceSceneSnapshot {
  const trajectory = projectileTrajectory(values);
  const pointIndex = Math.round(fraction * (trajectory.length - 1));
  const [x, y] = trajectory[pointIndex];
  const time = values.flightTime * fraction;
  const vy = values.vy0 - GRAVITY * time;
  const vectors: PhysicsForceSceneSnapshot["vectors"] = [
    {
      id: "vx",
      target: "body",
      semantic_role: "velocity",
      dx: 16 * values.vx / values.speed,
      dy: 0,
      label: "vₓ",
      magnitude: `${fixed(values.vx)} m/s`,
    },
  ];
  if (Math.abs(vy) > 0.2) {
    vectors.push({
      id: "vy",
      target: "body",
      semantic_role: "velocity",
      dx: 0,
      dy: -16 * vy / values.speed,
      label: "vᵧ",
      magnitude: `${fixed(Math.abs(vy))} m/s`,
    });
  }
  if (fraction > 0 && fraction < 1) {
    vectors.push({
      id: "g",
      target: "body",
      semantic_role: "acceleration",
      dx: 0,
      dy: 12,
      label: "g",
      magnitude: "9.8 m/s²",
    });
  }
  return {
    kind: "physics_force_scene",
    objects: [{ id: "body", label: "", x, y }],
    vectors,
    trajectory,
    formula_latex: formulaLatex,
    caption,
  };
}

function buildProjectileScript(params: TemplatePreviewParams): PlaybookScript {
  const values = projectileValues(params);
  const moments = [
    { id: "launch", title: "分解初速度", fraction: 0, text: `初速度 ${fixed(values.speed)} m/s 按 ${fixed(values.angle)}° 分解为水平和竖直分量。` },
    { id: "ascent", title: "上升阶段", fraction: 0.25, text: "水平速度保持不变，竖直速度在重力作用下逐渐减小。" },
    { id: "apex", title: "到达最高点", fraction: 0.5, text: `最高点处竖直速度为零，高度约 ${fixed(values.maxHeight)} m。` },
    { id: "descent", title: "下降阶段", fraction: 0.75, text: "竖直速度转为向下并继续增大，轨迹仍由同一条抛物线描述。" },
    { id: "landing", title: "回到地面", fraction: 1, text: `飞行约 ${fixed(values.flightTime)} s 后落地，水平射程约 ${fixed(values.range)} m。` },
  ];
  const steps: MetaStep[] = moments.map((moment, index) => step(index, {
    step_id: `projectile-${moment.id}`,
    title: moment.title,
    voiceover_text: moment.text,
    snapshot: projectileSnapshot(
      values,
      moment.fraction,
      moment.text,
      moment.id === "apex"
        ? `vᵧ = 0   Hmax = ${fixed(values.maxHeight)} m`
        : moment.id === "landing"
          ? `R = ${fixed(values.range)} m`
          : moment.id === "launch"
            ? "vₓ = v₀ cosθ   vᵧ = v₀ sinθ"
            : `vₓ = ${fixed(values.vx)} m/s   vᵧ = v₀ sinθ − gt`,
    ),
  }));
  steps.push(step(steps.length, {
    step_id: "projectile-result",
    title: "合成两条独立运动",
    voiceover_text: `抛体运动由水平方向的匀速运动和竖直方向的匀加速运动合成，形成抛物线轨迹。`,
    snapshot: projectileSnapshot(
      values,
      0.5,
      `vₓ=${fixed(values.vx)} m/s 保持不变；最大高度 ${fixed(values.maxHeight)} m；射程 ${fixed(values.range)} m。`,
      `T = ${fixed(values.flightTime)} s   H = ${fixed(values.maxHeight)} m   R = ${fixed(values.range)} m`,
    ),
  }));
  return {
    schema_version: "2.0.0",
    fps: FPS,
    total_frames: steps.length * STEP_FRAMES,
    domain: "physics",
    title: "抛体运动：速度分解与轨迹",
    summary: "把水平匀速与竖直重力加速合成，解释最高点、飞行时间和射程。",
    steps,
    parameter_controls: [
      { id: "speed", label: "初速度", value: fixed(values.speed), description: "单位 m/s。" },
      { id: "angle", label: "抛射角", value: fixed(values.angle), description: "单位 °。" },
    ],
    algorithm_id: "projectile_motion",
    initial_data: { speed: [fixed(values.speed)], angle: [fixed(values.angle)], gravity: [String(GRAVITY)] },
  };
}

function buildProjectileFollowups(params: TemplatePreviewParams, script: PlaybookScript): TemplatePreviewFollowups {
  const values = projectileValues(params);
  return Object.fromEntries(script.steps.map((item) => [
    item.step_id,
    questions(
      item.step_id,
      ["水平方向发生了什么？", `忽略空气阻力时，水平速度始终是 ${fixed(values.vx)} m/s。`],
      ["重力改变了什么？", "重力只改变竖直速度，使物体先减速上升、再加速下降。"],
      item.step_id === "projectile-result"
        ? ["这组参数的最终结果？", `飞行时间 ${fixed(values.flightTime)} s，最大高度 ${fixed(values.maxHeight)} m，射程 ${fixed(values.range)} m。`]
        : ["竖直速度此刻怎样变化？", "竖直速度每秒减少 g；到最高点时为零，之后方向转为向下。"],
    ),
  ]));
}

const TEMPLATE_PREVIEW_CASES: Record<TemplatePreviewCaseId, TemplatePreviewCase> = {
  "binary-search": {
    id: "binary-search",
    templateId: "binary-search",
    posterUrl: "/template-previews/binary-search/poster.webp",
    posterAlt: "二分查找区间逐步收敛的 Playbook 画面",
    posterFrame: 410,
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
    posterFrame: 430,
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
  "derivative-tangent": {
    id: "derivative-tangent",
    templateId: "derivative-tangent",
    posterUrl: "/template-previews/derivative-tangent/poster.webp",
    posterAlt: "抛物线切点与切线斜率的 Playbook 画面",
    posterFrame: 420,
    defaultParams: { markerX: 1 },
    controls: [{
      id: "markerX",
      kind: "range",
      label: "切点 a",
      description: "切线与导数同步变化",
      min: -2,
      max: 2,
      step: 0.1,
      resetPlayback: false,
    }],
    buildScript: buildDerivativeScript,
    buildFollowups: buildDerivativeFollowups,
  },
  "pole-polar": {
    id: "pole-polar",
    templateId: "pole-polar",
    posterUrl: "/template-previews/pole-polar/poster.webp",
    posterAlt: "圆外点、两条切线与接触弦极线的 Playbook 画面",
    posterFrame: 500,
    defaultParams: { k: 5 },
    controls: [{
      id: "k",
      kind: "range",
      label: "外点坐标 k",
      description: "P=(k,k)，R=5",
      min: 4,
      max: 8,
      step: 0.25,
      resetPlayback: false,
    }],
    buildScript: buildPolePolarScript,
    buildFollowups: buildPolePolarFollowups,
  },
  projectile: {
    id: "projectile",
    templateId: "projectile",
    posterUrl: "/template-previews/projectile/poster.webp",
    posterAlt: "抛体运动轨迹与速度分解的 Playbook 画面",
    posterFrame: 250,
    defaultParams: { speed: 20, angle: 45 },
    controls: [
      {
        id: "speed",
        kind: "range",
        label: "初速度",
        description: "m/s",
        min: 10,
        max: 30,
        step: 1,
        resetPlayback: false,
      },
      {
        id: "angle",
        kind: "range",
        label: "抛射角",
        description: "度",
        min: 15,
        max: 75,
        step: 1,
        resetPlayback: false,
      },
    ],
    buildScript: buildProjectileScript,
    buildFollowups: buildProjectileFollowups,
  },
};

export const TEMPLATE_PREVIEW_CASE_IDS = Object.freeze(
  Object.keys(TEMPLATE_PREVIEW_CASES) as TemplatePreviewCaseId[],
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
  })) as Record<TemplatePreviewCaseId, PlaybookScript>;
}
