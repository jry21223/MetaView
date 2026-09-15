import { describe, expect, it } from "vitest";

import { visualQualityGate } from "../../../features/playbook/engine/assets/visualQualityGate";
import type { GraphSceneSnapshot } from "../../../features/playbook/engine/types";
import {
  DIJKSTRA_NODE_IDS,
  DIJKSTRA_PREVIEW_CASE,
  buildDijkstraFollowups,
  buildDijkstraScript,
  dijkstraTrace,
  resolveDijkstraSource,
  shortestPath,
} from "./dijkstraCase";

function asGraph(snapshot: unknown): GraphSceneSnapshot {
  expect(snapshot).toMatchObject({ kind: "graph_scene" });
  return snapshot as GraphSceneSnapshot;
}

describe("dijkstraCase", () => {
  it("settles nodes in nondecreasing distance order from A", () => {
    const trace = dijkstraTrace("A");
    expect(trace.map((step) => step.current)).toEqual(["A", "C", "B", "D", "E", "F"]);
    expect(trace.at(-1)?.dist).toEqual({ A: 0, B: 3, C: 2, D: 8, E: 10, F: 13 });
    expect(trace.map((step) => step.dist[step.current])).toEqual([0, 2, 3, 8, 10, 13]);
    expect(trace[0]?.relaxed.map((relax) => `${relax.to}=${relax.after}`)).toEqual(["B=4", "C=2"]);
    expect(trace[1]?.relaxed.map((relax) => `${relax.to}=${relax.after}`)).toEqual(["B=3", "D=10", "E=12"]);
    expect(shortestPath(trace.at(-1)!.parent, "A", "F")).toEqual(["A", "C", "B", "D", "E", "F"]);
  });

  it("produces symmetric distances when the source moves", () => {
    for (const source of DIJKSTRA_NODE_IDS) {
      const trace = dijkstraTrace(source);
      expect(trace).toHaveLength(6);
      expect(trace.at(-1)?.dist[source]).toBe(0);
    }
    expect(dijkstraTrace("F").at(-1)?.dist.A).toBe(dijkstraTrace("A").at(-1)?.dist.F);
    expect(dijkstraTrace("D").at(-1)?.dist).toEqual({ A: 8, B: 5, C: 6, D: 0, E: 2, F: 5 });
  });

  it("builds a default script whose node labels carry the live distance", () => {
    const script = buildDijkstraScript(DIJKSTRA_PREVIEW_CASE.defaultParams);

    expect(script.algorithm_id).toBe("dijkstra_shortest_path");
    expect(script.steps.map((step) => step.step_id)).toEqual([
      "dijkstra-intro",
      "dijkstra-settle-A",
      "dijkstra-settle-C",
      "dijkstra-settle-B",
      "dijkstra-settle-D",
      "dijkstra-settle-E",
      "dijkstra-settle-F",
      "dijkstra-result",
    ]);
    expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);
    expect(new Set(script.steps.map((step) => JSON.stringify(step.snapshot))).size).toBe(script.steps.length);

    const intro = asGraph(script.steps[0]?.snapshot);
    expect(intro.weighted).toBe(true);
    expect(intro.nodes.map((node) => node.label)).toEqual(["A 0", "B ∞", "C ∞", "D ∞", "E ∞", "F ∞"]);
    expect(intro.queue_node_ids).toEqual(["A"]);
    expect(intro.edges.every((edge) => typeof edge.weight === "number")).toBe(true);

    const settleC = asGraph(script.steps[2]?.snapshot);
    expect(settleC.current_node_id).toBe("C");
    expect(settleC.visited_node_ids).toEqual(["A"]);
    expect(settleC.active_edge_ids).toEqual(["B-C", "C-D", "C-E"]);
    expect(settleC.queue_node_ids).toEqual(["B", "D", "E"]);
    expect(settleC.nodes.find((node) => node.id === "B")?.label).toBe("B 3");

    const result = asGraph(script.steps.at(-1)?.snapshot);
    expect(result.visited_node_ids).toEqual(["A", "C", "B", "D", "E", "F"]);
    expect([...result.active_edge_ids ?? []].sort()).toEqual(["A-C", "B-C", "B-D", "D-E", "E-F"]);
    expect(script.steps.at(-1)?.voiceover_text).toContain("A、C、B、D、E、F");
  });

  it("keeps every step visually focused for every source", () => {
    for (const source of DIJKSTRA_NODE_IDS) {
      const script = buildDijkstraScript({ source });
      expect(script.steps).toHaveLength(8);
      expect(visualQualityGate(script)).toEqual([]);
      const followups = buildDijkstraFollowups({ source });
      for (const step of script.steps) {
        expect(followups[step.step_id]?.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("clamps unknown sources to A", () => {
    expect(resolveDijkstraSource({})).toBe("A");
    expect(resolveDijkstraSource({ source: "Z" })).toBe("A");
    expect(resolveDijkstraSource({ source: "E" })).toBe("E");
    expect(buildDijkstraScript({ source: "Z" }).parameter_controls[0]?.value).toBe("A");
  });

  it("exposes a preview case wired to the pure builders", () => {
    expect(DIJKSTRA_PREVIEW_CASE.id).toBe("dijkstra");
    expect(DIJKSTRA_PREVIEW_CASE.controls[0]).toMatchObject({ id: "source", kind: "select" });
    const script = DIJKSTRA_PREVIEW_CASE.buildScript(DIJKSTRA_PREVIEW_CASE.defaultParams);
    expect(DIJKSTRA_PREVIEW_CASE.posterFrame).toBeLessThan(script.total_frames);
  });
});
