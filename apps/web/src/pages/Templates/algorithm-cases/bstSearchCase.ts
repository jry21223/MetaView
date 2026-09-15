import type {
  GraphSceneEdge,
  GraphSceneNode,
  GraphSceneSnapshot,
} from "../../../features/playbook/engine/types";
import {
  graphCoord,
  graphSceneSnapshot,
  inorderTreeLayout,
} from "../../../features/playbook/engine/kits/algorithm/graphScene";
import { spokenPath } from "../../../shared/lib/spokenText";
import type { TemplatePreviewParams } from "../templatePreviewCases";
import {
  codeHighlightFor,
  defineAlgorithmCase,
  finiteNumber,
  type AlgorithmCaseFrame,
  type AlgorithmStepDraft,
} from "./helpers";

/**
 * 二叉搜索树 · 查找与插入。
 *
 * 固定插入序列建成一棵 9 节点的 BST；目标值可调。查找沿一条从根出发的路径
 * 向下比较，命中则停，落空则把目标作为新叶子挂到最后比较的节点下——
 * 同一条路径既解释查找，也解释插入。节点按中序序号定横坐标、按深度定纵坐标，
 * 让“左子树都小、右子树都大”在画面上直接可读。
 */
export const BST_INSERT_ORDER = [8, 3, 10, 1, 6, 14, 4, 7, 13] as const;

export const BST_TARGET_MIN = 0;
export const BST_TARGET_MAX = 15;
const DEFAULT_TARGET = 7;

export const BST_SEARCH_CODE = [
  "function search(root: Node | null, target: number): Node | null {",
  "  let node = root;",
  "  while (node !== null) {",
  "    if (target === node.value) return node;",
  "    node = target < node.value ? node.left : node.right;",
  "  }",
  "  return null;",
  "}",
] as const;

export interface BstNode {
  value: number;
  left: number | null;
  right: number | null;
  parent: number | null;
  depth: number;
}

export type BstTree = Map<number, BstNode>;

export function buildBst(values: readonly number[]): BstTree {
  const tree: BstTree = new Map();
  for (const value of values) {
    if (tree.size === 0) {
      tree.set(value, { value, left: null, right: null, parent: null, depth: 0 });
      continue;
    }
    let cursor = values[0]!;
    for (;;) {
      const node = tree.get(cursor)!;
      if (value === node.value) break;
      const side = value < node.value ? "left" : "right";
      const child = node[side];
      if (child == null) {
        node[side] = value;
        tree.set(value, { value, left: null, right: null, parent: cursor, depth: node.depth + 1 });
        break;
      }
      cursor = child;
    }
  }
  return tree;
}

export const BST_TREE: BstTree = buildBst(BST_INSERT_ORDER);

export interface BstComparison {
  node: number;
  /** `left` / `right` = direction taken; `found` = target equals node. */
  direction: "left" | "right" | "found";
}

export interface BstSearchTrace {
  target: number;
  path: BstComparison[];
  found: boolean;
  /** When not found: the node the target would hang under, and on which side. */
  insertUnder: { parent: number; side: "left" | "right" } | null;
}

export function bstSearchTrace(tree: BstTree, root: number, target: number): BstSearchTrace {
  const path: BstComparison[] = [];
  let cursor: number | null = root;
  while (cursor != null) {
    const node: BstNode = tree.get(cursor)!;
    if (target === node.value) {
      path.push({ node: cursor, direction: "found" });
      return { target, path, found: true, insertUnder: null };
    }
    const direction = target < node.value ? "left" : "right";
    path.push({ node: cursor, direction });
    const next: number | null = node[direction];
    if (next == null) {
      return { target, path, found: false, insertUnder: { parent: cursor, side: direction } };
    }
    cursor = next;
  }
  return { target, path, found: false, insertUnder: null };
}

export function resolveBstTarget(params: TemplatePreviewParams): number {
  const raw = Math.round(finiteNumber(params, "target", DEFAULT_TARGET));
  return Math.min(BST_TARGET_MAX, Math.max(BST_TARGET_MIN, raw));
}

function subtreeValues(tree: BstTree, root: number | null): number[] {
  if (root == null) return [];
  const node = tree.get(root)!;
  return [...subtreeValues(tree, node.left), node.value, ...subtreeValues(tree, node.right)];
}

// 0.7 keeps an inserted leaf beside node 1 or 14 (targets 0 / 15) inside the
// stage: |x| ≤ 2.8 + 0.45, still under `graphStageBounds().maxX` ≈ 3.48.
// `bstSearchCase.test.ts` checks that against the shared projection.
const X_PITCH = 0.7;
const Y_TOP = -2.05;
const Y_PITCH = 0.95;
/** Horizontal offset of an inserted leaf from the parent it hangs under. */
const INSERT_X_OFFSET = 0.45;

function layoutNodes(tree: BstTree): GraphSceneNode[] {
  return inorderTreeLayout(
    [...tree.keys()]
      .sort((left, right) => left - right)
      .map((value) => ({ id: String(value), label: String(value), depth: tree.get(value)!.depth })),
    { xPitch: X_PITCH, yTop: Y_TOP, yPitch: Y_PITCH },
  );
}

function edgeId(parent: number, child: number): string {
  return `${parent}-${child}`;
}

function layoutEdges(tree: BstTree): GraphSceneEdge[] {
  const edges: GraphSceneEdge[] = [];
  for (const node of tree.values()) {
    for (const child of [node.left, node.right]) {
      if (child == null) continue;
      edges.push({ id: edgeId(node.value, child), source: String(node.value), target: String(child) });
    }
  }
  return edges;
}

export const BST_NODES: GraphSceneNode[] = layoutNodes(BST_TREE);
export const BST_EDGES: GraphSceneEdge[] = layoutEdges(BST_TREE);

function pathEdgeIds(path: readonly BstComparison[]): string[] {
  const ids: string[] = [];
  for (let index = 1; index < path.length; index += 1) {
    ids.push(edgeId(path[index - 1]!.node, path[index]!.node));
  }
  return ids;
}

function bstSnapshot(args: {
  current: number | null;
  visited?: readonly number[];
  active?: readonly number[];
  frontier?: readonly number[];
  activeEdges?: readonly string[];
  insert?: { target: number; parent: number; side: "left" | "right" } | null;
  caption: string;
}): GraphSceneSnapshot {
  const nodes = [...BST_NODES];
  const edges = [...BST_EDGES];
  const frontier = [...(args.frontier ?? [])].map(String);
  const activeEdges = [...(args.activeEdges ?? [])];
  if (args.insert) {
    const parent = nodes.find((node) => node.id === String(args.insert!.parent))!;
    const newId = `new-${args.insert.target}`;
    nodes.push({
      id: newId,
      label: String(args.insert.target),
      x: graphCoord((parent.x ?? 0) + (args.insert.side === "left" ? -INSERT_X_OFFSET : INSERT_X_OFFSET)),
      y: graphCoord((parent.y ?? 0) + Y_PITCH),
      emphasis: "accent",
    });
    const newEdgeId = `${args.insert.parent}-${newId}`;
    edges.push({ id: newEdgeId, source: parent.id, target: newId, emphasis: "accent" });
    frontier.push(newId);
    activeEdges.push(newEdgeId);
  }
  return graphSceneSnapshot({
    nodes,
    edges,
    directed: true,
    currentNodeId: args.current == null ? null : String(args.current),
    activeNodeIds: [...(args.active ?? [])].map(String),
    activeEdgeIds: activeEdges,
    visitedNodeIds: [...(args.visited ?? [])].map(String),
    frontierNodeIds: frontier,
    caption: args.caption,
  });
}

const codeHighlight = codeHighlightFor(BST_SEARCH_CODE);

function pathText(path: readonly BstComparison[]): string {
  return path.map((item) => item.node).join(" → ");
}

/** The same path for narration, without arrow glyphs. */
function pathSpoken(path: readonly BstComparison[]): string {
  return spokenPath(path.map((item) => item.node));
}

function buildBstSearchSteps(params: TemplatePreviewParams): AlgorithmCaseFrame<GraphSceneSnapshot> {
  const target = resolveBstTarget(params);
  const root = BST_INSERT_ORDER[0];
  const trace = bstSearchTrace(BST_TREE, root, target);
  const rootNode = BST_TREE.get(root)!;
  const leftValues = subtreeValues(BST_TREE, rootNode.left);
  const rightValues = subtreeValues(BST_TREE, rootNode.right);
  const visitedBefore = (index: number) => trace.path.slice(0, index).map((item) => item.node);

  const steps: Array<AlgorithmStepDraft<GraphSceneSnapshot>> = [
    {
      step_id: "bst-intro",
      title: "一棵按插入顺序建成的二叉搜索树",
      voiceover_text: `这棵树按 ${BST_INSERT_ORDER.join("、")} 的顺序依次插入建成，根是 ${root}。任务是查找 ${target}：从根出发，每到一个节点只做一次比较，就能决定往左还是往右，不必看另一半子树。`,
      snapshot: bstSnapshot({
        current: root,
        caption: `插入顺序：${BST_INSERT_ORDER.join(", ")}；目标 target = ${target}`,
      }),
      code_highlight: codeHighlight(
        1,
        { root: String(root), target: String(target), size: String(BST_TREE.size) },
        "start at root",
        [0, 1],
      ),
      questions: [
        ["为什么根是 8？", `插入顺序的第一个值成为根；之后的每个值都从根出发按大小找到自己的空位。`],
        ["同样这些数换个插入顺序，树会一样吗？", "不一样。BST 的形状由插入顺序决定，先插 1、3、4、6 会长出一条向右的链。"],
        ["查找和有序数组的二分有什么关系？", "思想相同：每次比较排除一半；BST 把“中点”固化成了节点，插入删除也不必移动元素。"],
      ],
    },
    {
      step_id: "bst-property",
      title: "左子树都更小，右子树都更大",
      voiceover_text: `二叉搜索树的性质：任意节点的左子树所有值都小于它，右子树所有值都大于它。以根 ${root} 为例，左子树是 ${leftValues.join("、")}，右子树是 ${rightValues.join("、")}。画面里节点的横坐标就是中序位置，所以性质在左右方向上直接可见。`,
      snapshot: bstSnapshot({
        current: root,
        visited: leftValues,
        frontier: rightValues,
        caption: `左子树 {${leftValues.join(", ")}} < ${root} < 右子树 {${rightValues.join(", ")}}`,
      }),
      code_highlight: codeHighlight(
        4,
        { "node.value": String(root), left: `{${leftValues.join(",")}}`, right: `{${rightValues.join(",")}}` },
        "BST ordering invariant",
        [4],
      ),
      questions: [
        ["性质只对根成立吗？", "对每个节点都成立：任意节点的左子树整体更小、右子树整体更大，递归定义。"],
        ["画面的横坐标代表什么？", "节点按中序遍历的次序从左到右排列，所以对 BST 来说横坐标就是大小次序。"],
        ["中序遍历会得到什么？", `恰好是升序序列：${subtreeValues(BST_TREE, root).join(", ")}。`],
      ],
    },
  ];

  trace.path.forEach((comparison, index) => {
    const node = BST_TREE.get(comparison.node)!;
    const relation = comparison.direction === "found" ? "=" : comparison.direction === "left" ? "<" : ">";
    const nextValue = comparison.direction === "found" ? null : node[comparison.direction];
    const title = comparison.direction === "found"
      ? `在 ${comparison.node} 处比较：${target} = ${comparison.node}，命中`
      : `在 ${comparison.node} 处比较：${target} ${relation} ${comparison.node}，向${comparison.direction === "left" ? "左" : "右"}走`;
    const narration = comparison.direction === "found"
      ? `来到节点 ${comparison.node}，目标 ${target} 正好等于它，查找结束。这是第 ${index + 1} 次比较，走过的路径依次是 ${pathSpoken(trace.path)}。`
      : nextValue == null
        ? `来到节点 ${comparison.node}，目标 ${target} ${relation} ${comparison.node}，应该往${comparison.direction === "left" ? "左" : "右"}走，但那一侧是空的。第 ${index + 1} 次比较后可以确定：${target} 不在树中。`
        : `来到节点 ${comparison.node}，目标 ${target} ${relation} ${comparison.node}，所以整棵${comparison.direction === "left" ? "右" : "左"}子树都不用看，沿${comparison.direction === "left" ? "左" : "右"}孩子进入 ${nextValue}。这是第 ${index + 1} 次比较。`;
    const skipped = comparison.direction === "found"
      ? []
      : subtreeValues(BST_TREE, comparison.direction === "left" ? node.right : node.left);
    steps.push({
      step_id: `bst-compare-${comparison.node}`,
      title,
      voiceover_text: narration,
      snapshot: bstSnapshot({
        current: comparison.node,
        visited: visitedBefore(index),
        activeEdges: pathEdgeIds(trace.path.slice(0, index + 1)),
        frontier: nextValue == null ? [] : [nextValue],
        caption: `路径：${pathText(trace.path.slice(0, index + 1))}；比较 ${index + 1} 次`,
      }),
      code_highlight: codeHighlight(
        comparison.direction === "found" ? 3 : 4,
        {
          target: String(target),
          "node.value": String(comparison.node),
          compare: `${target} ${relation} ${comparison.node}`,
          next: comparison.direction === "found" ? "return node" : nextValue == null ? "null" : String(nextValue),
        },
        comparison.direction === "found" ? "target found" : `go ${comparison.direction}`,
        comparison.direction === "found" ? [2, 3] : [3, 4],
      ),
      questions: [
        ["这一步做了什么比较？", comparison.direction === "found"
          ? `${target} 等于当前节点 ${comparison.node}，查找结束。`
          : `${target} ${comparison.direction === "left" ? "<" : ">"} ${comparison.node}，于是往${comparison.direction === "left" ? "左" : "右"}走。`],
        ["哪些节点因此不用再看？", comparison.direction === "found"
          ? "已经命中，后面的节点都不需要再访问。"
          : skipped.length
            ? `${comparison.node} 的${comparison.direction === "left" ? "右" : "左"}子树 {${skipped.join(", ")}} 整体被排除。`
            : `${comparison.node} 的另一侧没有节点，这一步没有额外排除。`],
        ["到目前为止比较了几次？", `${index + 1} 次，路径是 ${pathText(trace.path.slice(0, index + 1))}。`],
      ],
    });
  });

  const pathNodes = trace.path.map((item) => item.node);
  const lastNode = pathNodes.at(-1)!;
  if (trace.found) {
    steps.push({
      step_id: "bst-result",
      title: `找到 ${target}，共比较 ${trace.path.length} 次`,
      voiceover_text: `目标 ${target} 就在路径末端。整条路径依次经过 ${pathSpoken(trace.path)}，只有 ${trace.path.length} 个节点，其余 ${BST_TREE.size - trace.path.length} 个节点一次都没有访问。`,
      snapshot: bstSnapshot({
        current: lastNode,
        active: [lastNode],
        visited: pathNodes.slice(0, -1),
        activeEdges: pathEdgeIds(trace.path),
        caption: `找到 ${target}：路径 ${pathText(trace.path)}，跳过 ${BST_TREE.size - trace.path.length} 个节点`,
      }),
      code_highlight: codeHighlight(
        3,
        { result: `node(${target})`, comparisons: String(trace.path.length), skipped: String(BST_TREE.size - trace.path.length) },
        "return node",
      ),
      questions: [
        ["最终结果是什么？", `找到 ${target}，路径 ${pathText(trace.path)}，共比较 ${trace.path.length} 次。`],
        ["为什么其他节点没有被访问？", "每次比较都把另一侧子树整体排除，路径之外的节点根本没有机会进入循环。"],
        ["如果要删除这个节点呢？", "先用同样的路径找到它；若有两个孩子，用右子树最小值（中序后继）替换后再删。"],
      ],
    });
  } else {
    const insert = trace.insertUnder!;
    steps.push({
      step_id: "bst-result",
      title: `${target} 不在树中，可作为 ${insert.parent} 的${insert.side === "left" ? "左" : "右"}孩子插入`,
      voiceover_text: `查找落空的位置恰好就是插入位置：把 ${target} 挂到 ${insert.parent} 的${insert.side === "left" ? "左" : "右"}侧空位上，树仍然满足左小右大。插入和查找走的是同一条路径，依次经过 ${pathSpoken(trace.path)}，代价相同。`,
      snapshot: bstSnapshot({
        current: insert.parent,
        visited: pathNodes.slice(0, -1),
        activeEdges: pathEdgeIds(trace.path),
        insert: { target, parent: insert.parent, side: insert.side },
        caption: `未找到 ${target}；插入位置：${insert.parent} 的${insert.side === "left" ? "左" : "右"}孩子`,
      }),
      code_highlight: codeHighlight(
        6,
        { result: "null", insertUnder: String(insert.parent), side: insert.side, comparisons: String(trace.path.length) },
        "return null / insert here",
      ),
      questions: [
        ["插入位置为什么就是查找落空的位置？", "查找沿大小关系一路向下，落空处正是唯一能保持左小右大的空位。"],
        ["插入后树高会变吗？", BST_TREE.get(insert.parent)!.depth + 2 > Math.max(...[...BST_TREE.values()].map((n) => n.depth)) + 1
          ? "会。新叶子挂在最深的位置之下，树高加一。"
          : "不会。新叶子的深度没有超过当前树高。"],
        ["插入的代价是多少？", `与查找相同：${trace.path.length} 次比较加一次指针赋值，O(h)。`],
      ],
    });
  }

  const height = Math.max(...[...BST_TREE.values()].map((node) => node.depth)) + 1;
  steps.push({
    step_id: "bst-complexity",
    title: "比较次数等于路径长度，最坏是树高",
    voiceover_text: `这次查找比较了 ${trace.path.length} 次，正好是路径上的节点数。任何一次查找都不会超过树高 ${height}，所以复杂度是 O(h)。树越平衡，h 越接近 log₂n；如果按有序序列插入，树会退化成链，h 变成 n——这正是平衡树要解决的问题。`,
    snapshot: bstSnapshot({
      current: null,
      visited: pathNodes,
      activeEdges: pathEdgeIds(trace.path),
      caption: `比较 ${trace.path.length} 次 ≤ 树高 h = ${height}；n = ${BST_TREE.size}，log₂n ≈ ${Math.log2(BST_TREE.size).toFixed(1)}`,
    }),
    code_highlight: codeHighlight(
      2,
      { comparisons: String(trace.path.length), height: String(height), n: String(BST_TREE.size), complexity: "O(h)" },
      "loop runs at most h times",
      [2, 4],
    ),
    questions: [
      ["为什么是 O(h) 而不是 O(log n)？", "只有树足够平衡时 h 才约等于 log₂n；退化成链时 h = n，查找也退化为线性。"],
      ["怎样保证 h 接近 log n？", "使用自平衡树（AVL、红黑树）在插入删除时旋转调整，或者随机化插入顺序。"],
      ["这棵树的 9 个节点最多比较几次？", `树高为 ${Math.max(...[...BST_TREE.values()].map((n) => n.depth)) + 1}，任何查找最多比较这么多次。`],
    ],
  });

  return {
    steps,
    controls: [{
      id: "target",
      label: "目标值",
      value: String(target),
      description: "修改后在同一棵树上重新查找；不存在的值会显示插入位置。",
    }],
    initialData: {
      insert_order: BST_INSERT_ORDER.map(String),
      target: [String(target)],
      path: pathNodes.map(String),
      result: [trace.found ? "found" : "insert"],
    },
  };
}

export const BST_SEARCH_PREVIEW_CASE = defineAlgorithmCase({
  id: "bst-search",
  posterAlt: "二叉搜索树查找：从根出发的比较路径、被排除的子树与命中节点",
  posterStepIndex: 4,
  defaultParams: { target: DEFAULT_TARGET },
  controls: [
    {
      id: "target",
      kind: "number",
      label: "目标值",
      description: "在同一棵树上重新查找；不存在的值会显示插入位置。",
      min: BST_TARGET_MIN,
      max: BST_TARGET_MAX,
      step: 1,
      resetPlayback: true,
    },
  ],
  title: "二叉搜索树：一次比较砍掉一半",
  summary: "在固定插入序列建成的 BST 上查找目标值：每个节点只比较一次决定方向，落空处就是插入位置，比较次数不超过树高。",
  algorithmId: "bst_search_insert",
  buildSteps: buildBstSearchSteps,
});

export const buildBstSearchScript = BST_SEARCH_PREVIEW_CASE.buildScript;
export const buildBstSearchFollowups = BST_SEARCH_PREVIEW_CASE.buildFollowups;
