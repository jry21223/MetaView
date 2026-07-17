import { describe, expect, it } from "vitest";

import type { PlaybookScript } from "../types";
import { resolveCodePanelOverlay } from "./resolveCodePanelOverlay";

function bfsScript(): PlaybookScript {
  return {
    schema_version: "1.0.0",
    fps: 30,
    total_frames: 90,
    domain: "algorithm",
    title: "BFS",
    summary: "Traverse by breadth.",
    algorithm_id: "breadth_first_search",
    initial_data: { scene_blueprint: ["bfs_graph"] },
    parameter_controls: [],
    steps: [
      {
        step_id: "visit-a",
        end_frame: 90,
        title: "Visit A",
        voiceover_text: "Visit A and inspect its neighbors.",
        snapshot: {
          kind: "graph_scene",
          asset_id: "bfs-graph-preset",
          nodes: [{ id: "A" }, { id: "B" }],
          edges: [{ source: "A", target: "B" }],
          current_node_id: "A",
          active_edge_ids: ["A-B"],
          queue_node_ids: ["B"],
          visited_node_ids: ["A"],
        },
        tokens: [],
      },
    ],
  };
}

describe("resolveCodePanelOverlay", () => {
  it("derives legacy BFS code sync for the learning console", () => {
    const overlay = resolveCodePanelOverlay(bfsScript(), 0);

    expect(overlay?.language).toBe("pseudocode");
    expect(overlay?.lines).toContain("for neighbor in graph[A]:");
    expect(overlay?.active_line).toBe(1);
    expect(overlay?.variables).toEqual({
      current: "A",
      queue: "[B]",
      visited: "{A}",
    });
  });

  it("does not synthesize BFS code for an ordinary graph", () => {
    const script = bfsScript();
    script.algorithm_id = "depth_first_search";
    script.initial_data = { scene_blueprint: ["dfs_graph"] };
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind === "graph_scene") snapshot.asset_id = null;

    expect(resolveCodePanelOverlay(script, 0)).toBeNull();
  });

  it("keeps an explicit code_highlight as the source of truth", () => {
    const script = bfsScript();
    script.steps[0].code_highlight = {
      language: "python",
      lines: ["node = queue.popleft()"],
      active_lines: [0],
      active_line: 0,
      variables: { node: "A" },
    };

    expect(resolveCodePanelOverlay(script, 0)).toBe(script.steps[0].code_highlight);
  });
});
