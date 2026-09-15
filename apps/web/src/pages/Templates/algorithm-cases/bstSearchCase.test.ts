import { describe, expect, it } from "vitest";

import { visualQualityGate } from "../../../features/playbook/engine/assets/visualQualityGate";
import type { GraphSceneSnapshot } from "../../../features/playbook/engine/types";
import {
  BST_INSERT_ORDER,
  BST_NODES,
  BST_SEARCH_PREVIEW_CASE,
  BST_TREE,
  bstSearchTrace,
  buildBst,
  buildBstSearchFollowups,
  buildBstSearchScript,
  resolveBstTarget,
} from "./bstSearchCase";

function asGraph(snapshot: unknown): GraphSceneSnapshot {
  expect(snapshot).toMatchObject({ kind: "graph_scene" });
  return snapshot as GraphSceneSnapshot;
}

describe("bstSearchCase", () => {
  it("builds the fixed tree from the insertion order and lays it out in-order", () => {
    const tree = buildBst(BST_INSERT_ORDER);
    expect(tree.get(8)).toMatchObject({ left: 3, right: 10, depth: 0, parent: null });
    expect(tree.get(6)).toMatchObject({ left: 4, right: 7, depth: 2, parent: 3 });
    expect(tree.get(13)).toMatchObject({ left: null, right: null, depth: 3, parent: 14 });

    const xs = BST_NODES.map((node) => [Number(node.id), node.x as number] as const);
    const sortedByX = [...xs].sort((left, right) => left[1] - right[1]).map(([value]) => value);
    expect(sortedByX).toEqual([1, 3, 4, 6, 7, 8, 10, 13, 14]);
    for (const node of BST_NODES) {
      expect(Math.abs(node.x as number)).toBeLessThanOrEqual(3.5);
      expect(Math.abs(node.y as number)).toBeLessThanOrEqual(2.2);
    }
  });

  it("traces found and missing targets along one root-to-leaf path", () => {
    const found = bstSearchTrace(BST_TREE, 8, 7);
    expect(found.found).toBe(true);
    expect(found.path.map((item) => `${item.node}:${item.direction}`)).toEqual(["8:left", "3:right", "6:right", "7:found"]);

    const missing = bstSearchTrace(BST_TREE, 8, 5);
    expect(missing.found).toBe(false);
    expect(missing.path.map((item) => item.node)).toEqual([8, 3, 6, 4]);
    expect(missing.insertUnder).toEqual({ parent: 4, side: "right" });

    const rootHit = bstSearchTrace(BST_TREE, 8, 8);
    expect(rootHit.path).toEqual([{ node: 8, direction: "found" }]);
  });

  it("builds a default script that follows the comparison path", () => {
    const script = buildBstSearchScript(BST_SEARCH_PREVIEW_CASE.defaultParams);

    expect(script.algorithm_id).toBe("bst_search_insert");
    expect(script.steps.map((step) => step.step_id)).toEqual([
      "bst-intro",
      "bst-property",
      "bst-compare-8",
      "bst-compare-3",
      "bst-compare-6",
      "bst-compare-7",
      "bst-result",
      "bst-complexity",
    ]);
    expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);
    expect(new Set(script.steps.map((step) => JSON.stringify(step.snapshot))).size).toBe(script.steps.length);

    for (const step of script.steps) {
      const snapshot = asGraph(step.snapshot);
      expect(snapshot.directed).toBe(true);
      expect(snapshot.nodes.length).toBeGreaterThanOrEqual(9);
      expect(snapshot.edges.length).toBeGreaterThanOrEqual(8);
    }

    const property = asGraph(script.steps[1]?.snapshot);
    expect(property.visited_node_ids).toEqual(["1", "3", "4", "6", "7"]);
    expect(property.frontier_node_ids).toEqual(["10", "13", "14"]);

    const third = asGraph(script.steps.find((step) => step.step_id === "bst-compare-6")?.snapshot);
    expect(third.current_node_id).toBe("6");
    expect(third.visited_node_ids).toEqual(["8", "3"]);
    expect(third.active_edge_ids).toEqual(["8-3", "3-6"]);
    expect(third.frontier_node_ids).toEqual(["7"]);

    const result = asGraph(script.steps.find((step) => step.step_id === "bst-result")?.snapshot);
    expect(result.active_node_ids).toEqual(["7"]);
    expect(result.active_edge_ids).toEqual(["8-3", "3-6", "6-7"]);
    expect(script.steps.find((step) => step.step_id === "bst-result")?.title).toContain("找到 7");
  });

  it("shows the insertion slot for a value that is not in the tree", () => {
    const script = buildBstSearchScript({ target: 5 });
    const result = asGraph(script.steps.find((step) => step.step_id === "bst-result")?.snapshot);
    const inserted = result.nodes.find((node) => node.id === "new-5");
    expect(inserted).toMatchObject({ label: "5", emphasis: "accent" });
    expect(result.edges.find((edge) => edge.target === "new-5")).toMatchObject({ source: "4", emphasis: "accent" });
    expect(result.frontier_node_ids).toEqual(["new-5"]);
    expect(script.steps.find((step) => step.step_id === "bst-result")?.title).toContain("右孩子插入");

    const deep = buildBstSearchScript({ target: 12 });
    const deepResult = asGraph(deep.steps.find((step) => step.step_id === "bst-result")?.snapshot);
    const deepNode = deepResult.nodes.find((node) => node.id === "new-12");
    expect(Math.abs(deepNode?.y as number)).toBeLessThanOrEqual(2.2);
  });

  it("keeps every step visually focused across the target range", () => {
    for (const target of [0, 1, 5, 7, 8, 12, 15]) {
      const script = buildBstSearchScript({ target });
      expect(script.steps.length).toBeGreaterThanOrEqual(5);
      expect(visualQualityGate(script)).toEqual([]);
      const followups = buildBstSearchFollowups({ target });
      for (const step of script.steps) {
        expect(followups[step.step_id]?.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("clamps the target to the supported interval", () => {
    expect(resolveBstTarget({})).toBe(7);
    expect(resolveBstTarget({ target: -3 })).toBe(0);
    expect(resolveBstTarget({ target: 99 })).toBe(15);
    expect(resolveBstTarget({ target: "13" })).toBe(13);
    expect(buildBstSearchScript({ target: 99 }).parameter_controls[0]?.value).toBe("15");
  });

  it("exposes a preview case wired to the pure builders", () => {
    expect(BST_SEARCH_PREVIEW_CASE.id).toBe("bst-search");
    expect(BST_SEARCH_PREVIEW_CASE.controls[0]).toMatchObject({ id: "target", kind: "number", min: 0, max: 15 });
    const script = BST_SEARCH_PREVIEW_CASE.buildScript(BST_SEARCH_PREVIEW_CASE.defaultParams);
    expect(BST_SEARCH_PREVIEW_CASE.posterFrame).toBeLessThan(script.total_frames);
  });
});
