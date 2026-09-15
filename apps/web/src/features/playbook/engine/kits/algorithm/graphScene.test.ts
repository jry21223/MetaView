import { describe, expect, it } from "vitest";

import {
  GRAPH_NODE_RADIUS_ACTIVE,
  GRAPH_ROW_HALF_WIDTH,
  GRAPH_SCENE_PROJECTION,
  GRAPH_SCENE_VIEWBOX,
  graphSceneSnapshot,
  graphStageBounds,
  inorderTreeLayout,
  isOnStage,
  pointerMarkers,
  projectGraphPoint,
  rowLayout,
  shouldProjectCompactGraphCoords,
} from "./graphScene";

describe("graphScene projection", () => {
  it("projects compact coordinates onto the renderer viewBox", () => {
    expect(GRAPH_SCENE_PROJECTION.centerX).toBe(GRAPH_SCENE_VIEWBOX.width / 2);
    expect(GRAPH_SCENE_PROJECTION.centerY).toBe(GRAPH_SCENE_VIEWBOX.height / 2);
    expect(projectGraphPoint(0, 0, true)).toEqual({ x: 450, y: 220 });
    expect(projectGraphPoint(1, -1, true)).toEqual({ x: 570, y: 138 });
    // Raw pixel coordinates pass straight through.
    expect(projectGraphPoint(600, 300, false)).toEqual({ x: 600, y: 300 });
  });

  it("treats small coordinates as compact scene units and large ones as pixels", () => {
    expect(shouldProjectCompactGraphCoords([{ id: "a", x: 2, y: -1 }])).toBe(true);
    expect(shouldProjectCompactGraphCoords([{ id: "a", x: 450, y: 220 }])).toBe(false);
    expect(shouldProjectCompactGraphCoords([{ id: "a" }])).toBe(false);
  });

  it("derives the stage bounds a node circle must stay inside", () => {
    const bounds = graphStageBounds();
    expect(bounds.maxX).toBeCloseTo((450 - GRAPH_NODE_RADIUS_ACTIVE) / 120, 10);
    expect(bounds.maxY).toBeCloseTo((220 - GRAPH_NODE_RADIUS_ACTIVE) / 82, 10);
    expect(isOnStage({ x: bounds.maxX, y: 0 })).toBe(true);
    expect(isOnStage({ x: bounds.maxX + 0.01, y: 0 })).toBe(false);
    expect(isOnStage({ x: 0, y: -bounds.maxY - 0.01 })).toBe(false);
    // A node with no coordinates gets the renderer's fallback ring, not a clip.
    expect(isOnStage({})).toBe(true);
  });

  it("keeps the row half-width inside the stage", () => {
    expect(GRAPH_ROW_HALF_WIDTH).toBeLessThan(graphStageBounds().maxX);
  });
});

describe("graphScene layouts", () => {
  it("spreads a row evenly between the two half-width edges", () => {
    const nodes = rowLayout(
      [
        { id: "a", label: "a" },
        { id: "b", label: "b" },
        { id: "c", label: "c" },
      ],
      { y: -0.2 },
    );
    expect(nodes.map((node) => node.x)).toEqual([-GRAPH_ROW_HALF_WIDTH, 0, GRAPH_ROW_HALF_WIDTH]);
    expect(nodes.every((node) => node.y === -0.2)).toBe(true);
    expect(nodes.every((node) => isOnStage(node))).toBe(true);
    // A single item sits in the middle rather than dividing by zero.
    expect(rowLayout([{ id: "only", label: "1" }], { y: 0 })[0]?.x).toBe(-GRAPH_ROW_HALF_WIDTH);
  });

  it("puts in-order rank on x and depth on y", () => {
    const nodes = inorderTreeLayout(
      [
        { id: "1", label: "1", depth: 2 },
        { id: "3", label: "3", depth: 1 },
        { id: "8", label: "8", depth: 0 },
        { id: "10", label: "10", depth: 1 },
        { id: "14", label: "14", depth: 2 },
      ],
      { xPitch: 0.7, yTop: -2.05, yPitch: 0.95 },
    );
    expect(nodes.map((node) => node.x)).toEqual([-1.4, -0.7, 0, 0.7, 1.4]);
    expect(nodes.map((node) => node.y)).toEqual([-0.15, -1.1, -2.05, -1.1, -0.15]);
    // The root sits above its children, and the in-order rank orders x.
    expect([...nodes].sort((a, b) => (a.x as number) - (b.x as number)).map((n) => n.id))
      .toEqual(["1", "3", "8", "10", "14"]);
  });
});

describe("graphSceneSnapshot", () => {
  it("fills in the fields an intro step leaves empty", () => {
    const snapshot = graphSceneSnapshot({
      nodes: [{ id: "a", label: "a", x: 0, y: 0 }],
      edges: [],
      caption: "start",
    });
    expect(snapshot).toEqual({
      kind: "graph_scene",
      nodes: [{ id: "a", label: "a", x: 0, y: 0 }],
      edges: [],
      directed: false,
      weighted: false,
      current_node_id: null,
      active_node_ids: [],
      active_edge_ids: [],
      visited_node_ids: [],
      queue_node_ids: [],
      frontier_node_ids: [],
      caption: "start",
    });
    // Asset keys stay absent unless the case registers a pack.
    expect("pack_id" in snapshot).toBe(false);
    expect("asset_id" in snapshot).toBe(false);
  });

  it("carries the pack and asset ids through when given", () => {
    const snapshot = graphSceneSnapshot({
      nodes: [],
      edges: [],
      caption: "bfs",
      packId: "algorithm-code-basic",
      assetId: "bfs-graph-preset",
      directed: true,
      weighted: true,
      currentNodeId: "a",
      queueNodeIds: ["b"],
    });
    expect(snapshot.pack_id).toBe("algorithm-code-basic");
    expect(snapshot.asset_id).toBe("bfs-graph-preset");
    expect(snapshot.directed).toBe(true);
    expect(snapshot.weighted).toBe(true);
    expect(snapshot.current_node_id).toBe("a");
    expect(snapshot.queue_node_ids).toEqual(["b"]);
  });
});

describe("pointerMarkers", () => {
  const nodes = [
    { id: "n1", label: "1", x: -1, y: 0 },
    { id: "n2", label: "2", x: 1, y: 0 },
  ];

  it("hangs each marker above the node it references", () => {
    const { nodes: markerNodes, edges } = pointerMarkers(
      nodes,
      [
        { name: "prev", target: "n1" },
        { name: "curr", target: "n2", accent: true },
      ],
      -1.75,
    );
    expect(markerNodes).toEqual([
      { id: "ptr-prev", label: "prev", x: -1, y: -1.75 },
      { id: "ptr-curr", label: "curr", x: 1, y: -1.75 },
    ]);
    expect(edges).toEqual([
      { id: "ptr-prev-edge", source: "ptr-prev", target: "n1", emphasis: undefined },
      { id: "ptr-curr-edge", source: "ptr-curr", target: "n2", emphasis: "accent" },
    ]);
  });

  it("skips a pointer with no target and one pointing outside the scene", () => {
    const { nodes: markerNodes, edges } = pointerMarkers(
      nodes,
      [
        { name: "prev", target: null },
        { name: "next", target: "missing" },
        { name: "head", target: "n1" },
      ],
      -1.5,
    );
    expect(markerNodes.map((node) => node.id)).toEqual(["ptr-head"]);
    expect(edges.map((edge) => edge.target)).toEqual(["n1"]);
  });
});
