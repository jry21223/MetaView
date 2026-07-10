import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AnySnapshot, MetaStep, SnapshotKind } from "../types";
import {
  ComplexPlaneSceneRenderer,
  GraphSceneRenderer,
  IterationTraceSceneRenderer,
  ManifoldSceneRenderer,
  MatrixSceneRenderer,
  ModelingSceneRenderer,
  OptimizationSceneRenderer,
  PhasePortraitSceneRenderer,
  StatsChartSceneRenderer,
  TableSceneRenderer,
} from "./AdvancedMathRenderers";
import { rendererRegistry } from "./registry";
import type { RendererComponent, RendererProps } from "./types";

const EXPECTED: Array<[SnapshotKind, RendererComponent]> = [
  ["matrix_scene", MatrixSceneRenderer],
  ["table_scene", TableSceneRenderer],
  ["graph_scene", GraphSceneRenderer],
  ["stats_chart_scene", StatsChartSceneRenderer],
  ["iteration_trace_scene", IterationTraceSceneRenderer],
  ["phase_portrait_scene", PhasePortraitSceneRenderer],
  ["complex_plane_scene", ComplexPlaneSceneRenderer],
  ["optimization_scene", OptimizationSceneRenderer],
  ["modeling_scene", ModelingSceneRenderer],
  ["manifold_scene", ManifoldSceneRenderer],
];

function step(snapshot: AnySnapshot): MetaStep {
  return {
    step_id: "s1",
    end_frame: 90,
    title: "Advanced math scene",
    voiceover_text: "Render the scene",
    snapshot,
    tokens: [],
  };
}

function props(snapshot: AnySnapshot): RendererProps {
  return {
    step: step(snapshot),
    prevStep: null,
    frame: 120,
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "dark",
  };
}

function render(snapshot: AnySnapshot): string {
  const Renderer = rendererRegistry.get(snapshot.kind);
  if (!Renderer) throw new Error(`missing renderer for ${snapshot.kind}`);
  return renderToStaticMarkup(<Renderer {...props(snapshot)} />);
}

describe("advanced math renderers", () => {
  it.each(EXPECTED)("registers %s", (kind, renderer) => {
    expect(rendererRegistry.get(kind)).toBe(renderer);
  });

  it("renders matrix_scene with highlighted cells", () => {
    const markup = render({
      kind: "matrix_scene",
      matrix: [[1, 2], [3, 4]],
      col_labels: ["x", "y"],
      active_cells: [[0, 1]],
      operation_label: "RREF",
      caption: "Matrix state",
    });

    expect(markup).toContain("RREF");
    expect(markup).toContain("Matrix state");
    expect(markup).toContain("4");
  });

  it("renders every new snapshot kind without unknown fallback", () => {
    const snapshots: AnySnapshot[] = [
      { kind: "table_scene", columns: ["a"], rows: [["b"]], caption: "table" },
      { kind: "graph_scene", nodes: [{ id: "a" }, { id: "b" }], edges: [{ source: "a", target: "b" }], directed: true },
      { kind: "stats_chart_scene", chart_type: "line", series: [{ label: "s", values: [1, 2, 3] }] },
      { kind: "iteration_trace_scene", iterations: [{ index: 0, value: "x", error: 1 }], metric_name: "error" },
      { kind: "phase_portrait_scene", trajectories: [{ points: [[0, 0], [1, 1]] }], equilibria: [{ x: 0, y: 0, stable: true }] },
      { kind: "complex_plane_scene", points: [{ re: 1, im: 2, label: "z" }] },
      { kind: "optimization_scene", feasible_region: [[0, 0], [2, 0], [1, 2]], iterates: [[0, 0], [1, 1]], optimum: [1, 2] },
      {
        kind: "modeling_scene",
        variables: [{ id: "x", label: "Demand", value: 10 }],
        relations: [{ source: "x", target: "y", label: "drives" }],
        assumptions: ["Linear response"],
      },
      { kind: "manifold_scene", chart_name: "U", tangent_vectors: [{ at: [0, 0, 0], direction: [1, 0, 0], label: "v" }] },
    ];

    for (const snapshot of snapshots) {
      const markup = render(snapshot);
      expect(markup).toContain("advanced-math-renderer");
      expect(markup).not.toContain("Unknown snapshot kind");
    }
  });

  it("projects compact graph coordinates into the viewport", () => {
    const markup = render({
      kind: "graph_scene",
      nodes: [
        { id: "a", label: "A", x: 0, y: -2.4 },
        { id: "b", label: "B", x: 2.4, y: 0 },
      ],
      edges: [{ source: "a", target: "b" }],
      directed: false,
    });

    expect(markup).not.toContain('cx="0"');
    expect(markup).not.toContain('cy="-2.4"');
    expect(markup).toContain('cx="450"');
  });

  it("marks BFS graph node and edge states with algorithm assets", () => {
    const markup = render({
      kind: "graph_scene",
      pack_id: "algorithm-code-basic",
      asset_id: "bfs-graph-preset",
      nodes: [
        { id: "S", label: "S", x: -3, y: 0 },
        { id: "A", label: "A", x: -1, y: 0 },
        { id: "B", label: "B", x: 1.1, y: -1.4 },
        { id: "C", label: "C", x: 1.1, y: 1.4 },
      ],
      edges: [
        { id: "S-A", source: "S", target: "A" },
        { id: "A-B", source: "A", target: "B" },
        { id: "A-C", source: "A", target: "C" },
      ],
      directed: true,
      active_node_ids: ["A"],
      visited_node_ids: ["S"],
      queue_node_ids: ["B", "C"],
      active_edge_ids: ["A-B"],
      caption: "BFS expands the current node and appends neighbors to the queue.",
    });

    expect(markup).toContain("graph-scene-renderer");
    expect(markup).toContain('data-pack-id="algorithm-code-basic"');
    expect(markup).toContain('data-graph-asset-id="bfs-graph-preset"');
    expect(markup).toContain('data-asset-id="graph-node"');
    expect(markup).toContain('data-asset-id="queue-frame"');
    expect(markup).toContain('data-node-state="current"');
    expect(markup).toContain('data-node-state="visited"');
    expect(markup).toContain('data-node-state="queue"');
    expect(markup).toContain('data-edge-state="active"');
    expect(markup).toContain('data-semantic-role="queue_panel"');
    expect(markup).toContain('data-queue-node-id="B"');
    expect(markup).toContain('data-queue-node-id="C"');
    expect(markup).toContain('data-semantic-role="visited_set"');
    expect(markup).toContain('data-visited-node-id="S"');
    expect(markup).not.toContain("Code sync");
    expect(markup).not.toContain('data-semantic-role="code_trace"');
    expect(markup).not.toContain("data-code-line-state");
    expect(markup).not.toContain('data-asset-id="active-line"');
  });
});
