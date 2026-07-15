import { describe, expect, it } from "vitest";
import { compileExpr } from "../../../shared/lib/mathExpr";
import type {
  GraphSceneSnapshot,
  MathPlotSnapshot,
  MetaStep,
  PlaybookScript,
} from "../engine/types";
import { applyInteraction, deriveInteractionManifest } from "./engine";
import { InteractionEngineError, type InteractionCommand } from "./types";

function step(
  stepId: string,
  snapshot: MathPlotSnapshot | GraphSceneSnapshot,
  endFrame = 30,
): MetaStep {
  return {
    step_id: stepId,
    end_frame: endFrame,
    title: stepId,
    voiceover_text: "",
    snapshot,
    tokens: [],
  };
}

function script(
  steps: MetaStep[],
  extra: Partial<PlaybookScript> = {},
): PlaybookScript {
  return {
    fps: 30,
    total_frames: Math.max(...steps.map((item) => item.end_frame)),
    domain: "math",
    title: "Interaction fixture",
    summary: "",
    steps,
    parameter_controls: [],
    ...extra,
  };
}

const plot: MathPlotSnapshot = {
  kind: "math_plot",
  curves: [
    { expression: "x^2", label: "f(x)", semantic_role: "curve" },
    { expression: "2*x - 1", label: "tangent", semantic_role: "tangent", emphasis: "accent" },
  ],
  x_min: -5,
  x_max: 5,
  y_min: -1,
  y_max: 25,
  marker_x: 1,
  x_label: "x",
  y_label: "y",
};

const graph: GraphSceneSnapshot = {
  kind: "graph_scene",
  nodes: [
    { id: "A", label: "A" },
    { id: "B", label: "B" },
    { id: "C", label: "C" },
    { id: "D", label: "D" },
  ],
  edges: [
    { id: "AB", source: "A", target: "B" },
    { id: "AC", source: "A", target: "C" },
    { id: "BD", source: "B", target: "D" },
  ],
  directed: false,
};

describe("interaction manifest", () => {
  it("declares only validated, allowlisted bindings supported by the script", () => {
    const math = deriveInteractionManifest(script([step("plot", plot)]));
    expect(math.adapters).toEqual([
      expect.objectContaining({
        adapter_id: "math.derivative-tangent",
        experimental: true,
      }),
    ]);
    expect(math.adapters[0].bindings[0]).toMatchObject({
      id: "step:plot:marker-x",
      min: -5,
      max: 5,
      value: 1,
    });

    const bfs = deriveInteractionManifest(script(
      [step("graph", graph)],
      { domain: "algorithm", algorithm_id: "bfs" },
    ));
    const bfsBinding = bfs.adapters[0].bindings.find(
      (binding) => binding.target_role === "start-node",
    );
    expect(bfsBinding?.options.map((item) => item.id))
      .toEqual(["A", "B", "C", "D"]);
  });

  it("fails closed for non-BFS lessons, malformed graphs, and undeclared tangents", () => {
    const dfs = deriveInteractionManifest(script(
      [step("graph", graph)],
      { domain: "algorithm", algorithm_id: "dfs" },
    ));
    expect(dfs.adapters).toEqual([]);

    const malformed: GraphSceneSnapshot = {
      ...graph,
      edges: [...graph.edges, { source: "A", target: "missing" }],
    };
    const invalidBfs = deriveInteractionManifest(script(
      [step("graph", malformed)],
      { domain: "algorithm", algorithm_id: "bfs" },
    ));
    expect(invalidBfs.adapters).toEqual([]);

    const noTangent: MathPlotSnapshot = { ...plot, curves: [plot.curves[0]] };
    expect(deriveInteractionManifest(script([step("plot", noTangent)])).adapters).toEqual([]);
  });

  it("does not expose known non-differentiable or boundary points", () => {
    const cusp: MathPlotSnapshot = {
      ...plot,
      curves: [
        { expression: "abs(x)", semantic_role: "curve" },
        { expression: "0", semantic_role: "tangent" },
      ],
      marker_x: 0,
    };
    const boundary: MathPlotSnapshot = {
      ...plot,
      curves: [
        { expression: "sqrt(x)", semantic_role: "curve" },
        { expression: "0", semantic_role: "tangent" },
      ],
      x_min: 0,
      marker_x: 0,
    };
    expect(deriveInteractionManifest(script([step("cusp", cusp)])).adapters).toEqual([]);
    expect(deriveInteractionManifest(script([step("boundary", boundary)])).adapters).toEqual([]);
  });

  it("fails closed when a step declares more than one math plot layer", () => {
    const layered = step("plot", plot);
    layered.layers = [
      {
        timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 0 },
        body: plot,
      },
      {
        timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 1 },
        body: { ...plot, marker_x: 2 },
      },
    ];

    expect(deriveInteractionManifest(script([layered])).adapters).toEqual([]);
  });
});

describe("derivative interaction", () => {
  it("moves the marker and deterministically recomputes the tangent", () => {
    const base = script([step("plot", plot)]);
    const result = applyInteraction(base, {
      adapter_id: "math.derivative-tangent",
      step_id: "plot",
      target_id: "step:plot:marker-x",
      action: "set-value",
      value: 3,
    }, 7);

    const snapshot = result.script.steps[0].snapshot as MathPlotSnapshot;
    expect(snapshot.marker_x).toBe(3);
    expect(base.steps[0].snapshot).toBe(plot);
    const tangent = snapshot.curves.find((curve) => curve.semantic_role === "tangent");
    expect(tangent).toBeDefined();
    const tangentFn = compileExpr(tangent!.expression);
    expect(tangentFn({ x: 3 })).toBeCloseTo(9, 8);
    expect(tangentFn({ x: 4 }) - tangentFn({ x: 3 })).toBeCloseTo(6, 4);
    expect(result.event).toMatchObject({ value: 3, sequence: 7 });
  });

  it("rejects values outside bounds and invalid event sequences", () => {
    expect(() => applyInteraction(script([step("plot", plot)]), {
      adapter_id: "math.derivative-tangent",
      step_id: "plot",
      target_id: "step:plot:marker-x",
      action: "set-value",
      value: 8,
    })).toThrow(InteractionEngineError);

    expect(() => applyInteraction(script([step("plot", plot)]), {
      adapter_id: "math.derivative-tangent",
      step_id: "plot",
      target_id: "step:plot:marker-x",
      action: "set-value",
      value: 2,
    }, 0)).toThrow("positive integer");
  });
});

describe("BFS interaction", () => {
  it("builds a complete replay without contaminating unrelated graph scenes", () => {
    const unrelated: GraphSceneSnapshot = {
      kind: "graph_scene",
      nodes: [{ id: "X" }, { id: "Y" }],
      edges: [{ source: "X", target: "Y" }],
    };
    const staleGraph: GraphSceneSnapshot = {
      ...graph,
      nodes: graph.nodes.map((node) => ({ ...node, emphasis: "accent", asset_id: "stale" })),
      edges: graph.edges.map((edge) => ({ ...edge, emphasis: "accent", asset_id: "stale" })),
    };
    const base = script(
      [
        step("other-before", unrelated, 30),
        step("graph", staleGraph, 60),
        step("other-after", unrelated, 90),
      ],
      { domain: "algorithm", algorithm_id: "bfs" },
    );
    const result = applyInteraction(base, {
      adapter_id: "algorithm.bfs",
      step_id: "graph",
      target_id: "step:graph:start-node",
      action: "select",
      value: "C",
    });

    expect(result.replay?.visit_order).toEqual(["C", "A", "B", "D"]);
    expect(result.replay?.frames.map((frame) => frame.current_node_id))
      .toEqual(["C", "A", "B", "D"]);
    expect(result.replay?.frames.at(-1)?.visited_node_ids).toEqual(["C", "A", "B", "D"]);
    expect((result.script.steps[0].snapshot as GraphSceneSnapshot).current_node_id).toBeUndefined();
    expect((result.script.steps[1].snapshot as GraphSceneSnapshot).current_node_id).toBe("C");
    expect((result.script.steps[2].snapshot as GraphSceneSnapshot).current_node_id).toBeUndefined();
    expect(result.replay?.frames[0].snapshot.nodes[0].asset_id).toBeUndefined();
    expect(result.summary).toContain("Prepared BFS replay");
    expect((base.steps[1].snapshot as GraphSceneSnapshot).current_node_id).toBeUndefined();
  });

  it("handles directed, disconnected, self-loop, and duplicate edges deterministically", () => {
    const edgeCases: GraphSceneSnapshot = {
      kind: "graph_scene",
      nodes: [{ id: "A" }, { id: "B" }, { id: "C" }],
      edges: [
        { source: "A", target: "A" },
        { source: "A", target: "B" },
        { source: "A", target: "B" },
      ],
      directed: true,
    };
    const result = applyInteraction(
      script([step("graph", edgeCases)], { domain: "algorithm", algorithm_id: "bfs" }),
      {
        adapter_id: "algorithm.bfs",
        step_id: "graph",
        target_id: "step:graph:start-node",
        action: "select",
        value: "A",
      },
    );
    expect(result.replay?.visit_order).toEqual(["A", "B"]);
  });

  it("rejects commands that bypass or contradict the manifest", () => {
    expect(() => applyInteraction(
      script([step("graph", graph)], { domain: "algorithm", algorithm_id: "bfs" }),
      {
        adapter_id: "algorithm.bfs",
        step_id: "graph",
        target_id: "raw-dom-selector",
        action: "select",
        value: "A",
      },
    )).toThrow("not declared by the manifest");

    const contradictory = {
      adapter_id: "algorithm.bfs",
      step_id: "graph",
      target_id: "step:graph:start-node",
      action: "set-value",
      value: "A",
    } as unknown as InteractionCommand;
    expect(() => applyInteraction(
      script([step("graph", graph)], { domain: "algorithm", algorithm_id: "bfs" }),
      contradictory,
    )).toThrow("not declared by the manifest");
  });
});
