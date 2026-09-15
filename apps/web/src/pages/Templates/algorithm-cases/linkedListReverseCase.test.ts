import { describe, expect, it } from "vitest";

import { visualQualityGate } from "../../../features/playbook/engine/assets/visualQualityGate";
import type { GraphSceneSnapshot } from "../../../features/playbook/engine/types";
import {
  HEAD_NULL_ID,
  LINKED_LIST_LENGTHS,
  LINKED_LIST_REVERSE_PREVIEW_CASE,
  TAIL_NULL_ID,
  buildLinkedListReverseFollowups,
  buildLinkedListReverseScript,
  linkedListReverseTrace,
  listEdges,
  resolveLinkedListLength,
} from "./linkedListReverseCase";

function asGraph(snapshot: unknown): GraphSceneSnapshot {
  expect(snapshot).toMatchObject({ kind: "graph_scene" });
  return snapshot as GraphSceneSnapshot;
}

describe("linkedListReverseCase", () => {
  it("traces prev / curr / next for every iteration", () => {
    const frames = linkedListReverseTrace(4);
    expect(frames.map((frame) => [frame.curr, frame.prevBefore, frame.next])).toEqual([
      [1, 0, 2],
      [2, 1, 3],
      [3, 2, 4],
      [4, 3, 0],
    ]);
    // Only the reversed prefix is reachable from the new head.
    expect(frames.map((frame) => frame.order)).toEqual([
      [1],
      [2, 1],
      [3, 2, 1],
      [4, 3, 2, 1],
    ]);
  });

  it("flips exactly one pointer per step and keeps one edge per node", () => {
    const before = listEdges(4, 0);
    expect(before.map((edge) => `${edge.source}>${edge.target}`)).toEqual(["n1>n2", "n2>n3", "n3>n4", `n4>${TAIL_NULL_ID}`]);
    const partial = listEdges(4, 2);
    expect(partial.map((edge) => `${edge.source}>${edge.target}`)).toEqual([`n1>${HEAD_NULL_ID}`, "n2>n1", "n3>n4", `n4>${TAIL_NULL_ID}`]);
    const done = listEdges(4, 4);
    expect(done.map((edge) => `${edge.source}>${edge.target}`)).toEqual([`n1>${HEAD_NULL_ID}`, "n2>n1", "n3>n2", "n4>n3"]);
  });

  it("builds a default script of one flip per node", () => {
    const script = buildLinkedListReverseScript(LINKED_LIST_REVERSE_PREVIEW_CASE.defaultParams);

    expect(script.algorithm_id).toBe("linked_list_reverse");
    expect(script.steps.map((step) => step.step_id)).toEqual([
      "list-intro",
      "list-flip-1",
      "list-flip-2",
      "list-flip-3",
      "list-flip-4",
      "list-result",
    ]);
    expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);
    expect(new Set(script.steps.map((step) => JSON.stringify(step.snapshot))).size).toBe(script.steps.length);

    const listNodes = (snapshot: GraphSceneSnapshot) => snapshot.nodes.filter((node) => !node.id.startsWith("ptr-"));
    const markerTargets = (snapshot: GraphSceneSnapshot) =>
      Object.fromEntries(snapshot.edges.filter((edge) => edge.source.startsWith("ptr-")).map((edge) => [edge.source, edge.target]));
    for (const step of script.steps) {
      const snapshot = asGraph(step.snapshot);
      expect(snapshot.directed).toBe(true);
      expect(listNodes(snapshot)).toHaveLength(6);
      expect(snapshot.edges.filter((edge) => !edge.source.startsWith("ptr-"))).toHaveLength(4);
      // Every pointer marker sits directly above the node it references.
      for (const edge of snapshot.edges.filter((item) => item.source.startsWith("ptr-"))) {
        const marker = snapshot.nodes.find((node) => node.id === edge.source)!;
        const target = snapshot.nodes.find((node) => node.id === edge.target)!;
        expect(marker.x).toBe(target.x);
        expect(marker.y).toBeLessThan(target.y as number);
      }
    }

    const intro = asGraph(script.steps[0]?.snapshot);
    expect(intro.current_node_id).toBe("n1");
    expect(intro.frontier_node_ids).toEqual(["n2"]);
    expect(markerTargets(intro)).toEqual({ "ptr-prev": HEAD_NULL_ID, "ptr-curr": "n1" });

    const flipTwo = asGraph(script.steps[2]?.snapshot);
    expect(flipTwo.current_node_id).toBe("n2");
    expect(flipTwo.visited_node_ids).toEqual(["n1"]);
    expect(flipTwo.frontier_node_ids).toEqual(["n3"]);
    expect(flipTwo.active_edge_ids).toEqual(["n2-back"]);
    expect(flipTwo.edges.find((edge) => edge.id === "n2-back")).toMatchObject({ source: "n2", target: "n1" });
    expect(markerTargets(flipTwo)).toEqual({ "ptr-prev": "n1", "ptr-curr": "n2", "ptr-next": "n3" });

    const flipLast = asGraph(script.steps[4]?.snapshot);
    expect(markerTargets(flipLast)).toEqual({ "ptr-prev": "n3", "ptr-curr": "n4", "ptr-next": TAIL_NULL_ID });

    const result = asGraph(script.steps.at(-1)?.snapshot);
    expect(result.current_node_id).toBeNull();
    expect(result.active_node_ids).toEqual(["n4"]);
    expect(markerTargets(result)).toEqual({ "ptr-prev": "n4", "ptr-curr": TAIL_NULL_ID });
    expect(result.visited_node_ids).toEqual(["n1", "n2", "n3", "n4"]);
    expect(result.active_edge_ids).toEqual(["n1-back", "n2-back", "n3-back", "n4-back"]);
    expect(script.steps.at(-1)?.voiceover_text).toContain("4、3、2、1，末尾指向空");
    expect(script.steps.at(-1)?.snapshot.caption).toContain("4 → 3 → 2 → 1 → ∅");
  });

  it("keeps every step visually focused for every supported length", () => {
    for (const length of LINKED_LIST_LENGTHS) {
      const script = buildLinkedListReverseScript({ length });
      expect(script.steps).toHaveLength(Number(length) + 2);
      expect(visualQualityGate(script)).toEqual([]);
      const followups = buildLinkedListReverseFollowups({ length });
      for (const step of script.steps) {
        expect(followups[step.step_id]?.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("clamps unsupported lengths to four nodes", () => {
    expect(resolveLinkedListLength({})).toBe(4);
    expect(resolveLinkedListLength({ length: "9" })).toBe(4);
    expect(resolveLinkedListLength({ length: "5" })).toBe(5);
    expect(buildLinkedListReverseScript({ length: 42 }).parameter_controls[0]?.value).toBe("4");
  });

  it("exposes a preview case wired to the pure builders", () => {
    expect(LINKED_LIST_REVERSE_PREVIEW_CASE.id).toBe("linked-list-reverse");
    expect(LINKED_LIST_REVERSE_PREVIEW_CASE.controls[0]).toMatchObject({ id: "length", kind: "select" });
    const script = LINKED_LIST_REVERSE_PREVIEW_CASE.buildScript(LINKED_LIST_REVERSE_PREVIEW_CASE.defaultParams);
    expect(LINKED_LIST_REVERSE_PREVIEW_CASE.posterFrame).toBeLessThan(script.total_frames);
  });
});
