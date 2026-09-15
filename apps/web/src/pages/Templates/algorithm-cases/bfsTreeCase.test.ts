import { describe, expect, it } from "vitest";

import {
  GRAPH_NODE_RADIUS_ACTIVE,
  GRAPH_STATE_PANEL_PROJECTION,
  isOnStage,
} from "../../../features/playbook/engine/kits/algorithm/graphScene";
import type { GraphSceneSnapshot } from "../../../features/playbook/engine/types";
import {
  BFS_NODES,
  BFS_TREE_PREVIEW_CASE,
  bfsTrace,
  buildBfsScript,
  resolveBfsStartNode,
} from "./bfsTreeCase";
import { expectDeterministicCase } from "./testing/expectDeterministicCase";

const PARAM_MATRIX = BFS_NODES.map((node) => ({ startNode: node.id }));

function asGraph(snapshot: unknown): GraphSceneSnapshot {
  expect(snapshot).toMatchObject({ kind: "graph_scene" });
  return snapshot as GraphSceneSnapshot;
}

describe("bfsTreeCase", () => {
  it("holds the shared preview-case invariants for every start node", () => {
    expectDeterministicCase(BFS_TREE_PREVIEW_CASE, PARAM_MATRIX);
  });

  it("visits every node exactly once, shallowest first", () => {
    for (const node of BFS_NODES) {
      const trace = bfsTrace(node.id);
      const order = trace.map((state) => state.current);
      expect(order, `start ${node.id}`).toHaveLength(BFS_NODES.length);
      expect(new Set(order).size, `start ${node.id}`).toBe(BFS_NODES.length);
      expect(order[0], `start ${node.id}`).toBe(node.id);
      // A node is only dequeued after it has been discovered and queued.
      expect(trace.at(-1)?.queue, `start ${node.id}`).toEqual([]);
    }
    expect(bfsTrace("1").map((state) => state.current)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(bfsTrace("3").map((state) => state.current)).toEqual(["3", "1", "6", "7", "2", "4", "5"]);
  });

  it("keeps the queue, the visited set and the active edges in step", () => {
    const script = buildBfsScript({ startNode: "1" });
    const visitTwo = asGraph(script.steps.find((step) => step.step_id === "bfs-visit-2")?.snapshot);

    expect(visitTwo.current_node_id).toBe("2");
    expect(visitTwo.visited_node_ids).toEqual(["1", "2"]);
    expect(visitTwo.queue_node_ids).toEqual(["3", "4", "5"]);
    expect(visitTwo.frontier_node_ids).toEqual(["4", "5"]);
    expect(visitTwo.active_edge_ids).toEqual(["2-4", "2-5"]);

    const result = asGraph(script.steps.at(-1)?.snapshot);
    expect(result.current_node_id).toBeNull();
    expect(result.queue_node_ids).toEqual([]);
    expect(result.visited_node_ids).toHaveLength(BFS_NODES.length);

    for (const step of script.steps) {
      const snapshot = asGraph(step.snapshot);
      // This pack id turns on the algorithm state panel, which takes the right
      // of the stage and squeezes the graph into the tighter projection.
      expect(snapshot.pack_id).toBe("algorithm-code-basic");
      for (const node of snapshot.nodes) {
        expect(
          isOnStage(node, GRAPH_NODE_RADIUS_ACTIVE, GRAPH_STATE_PANEL_PROJECTION),
          `node ${node.id}`,
        ).toBe(true);
      }
    }
  });

  it("clamps an unknown start node to node 1", () => {
    expect(resolveBfsStartNode({})).toBe("1");
    expect(resolveBfsStartNode({ startNode: "9" })).toBe("1");
    expect(resolveBfsStartNode({ startNode: 3 })).toBe("3");
    expect(buildBfsScript({ startNode: "9" }).parameter_controls[0]?.value).toBe("1");
  });

  it("exposes a preview case wired to the pure builders", () => {
    expect(BFS_TREE_PREVIEW_CASE.id).toBe("bfs-tree");
    expect(BFS_TREE_PREVIEW_CASE.controls[0]).toMatchObject({ id: "startNode", kind: "select" });
    expect(BFS_TREE_PREVIEW_CASE.buildScript(BFS_TREE_PREVIEW_CASE.defaultParams).algorithm_id)
      .toBe("bfs_graph");
  });
});
