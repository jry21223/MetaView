import { describe, expect, it } from "vitest";
import { compileExpr } from "../../../shared/lib/mathExpr";
import type {
  GraphSceneSnapshot,
  MathPlotSnapshot,
  MetaStep,
  PlaybookScript,
} from "../engine/types";
import { applyInteraction, deriveInteractionManifest } from "./engine";
import { InteractionEngineError } from "./types";

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
  curves: [{ expression: "x^2", label: "f(x)", semantic_role: "curve" }],
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
    { source: "A", target: "B" },
    { source: "A", target: "C" },
    { source: "B", target: "D" },
  ],
  directed: false,
};

describe("interaction manifest", () => {
  it("declares only allowlisted bindings supported by the script", () => {
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
    expect(bfs.adapters[0].bindings[0].options?.map((item) => item.id))
      .toEqual(["A", "B", "C", "D"]);
  });

  it("fails closed for a graph lesson that is not identified as BFS", () => {
    const manifest = deriveInteractionManifest(script(
      [step("graph", graph)],
      { domain: "algorithm", algorithm_id: "dfs" },
    ));
    expect(manifest.adapters).toEqual([]);
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
    expect(result.event.sequence).toBe(7);
  });

  it("rejects values outside the manifest bounds", () => {
    expect(() => applyInteraction(script([step("plot", plot)]), {
      adapter_id: "math.derivative-tangent",
      step_id: "plot",
      target_id: "step:plot:marker-x",
      action: "set-value",
      value: 8,
    })).toThrow(InteractionEngineError);
  });
});

describe("BFS interaction", () => {
  it("replays graph snapshots from the selected stable node id", () => {
    const base = script(
      [step("g1", graph, 30), step("g2", graph, 60), step("g3", graph, 90)],
      { domain: "algorithm", algorithm_id: "bfs" },
    );
    const result = applyInteraction(base, {
      adapter_id: "algorithm.bfs",
      step_id: "g1",
      target_id: "step:g1:start-node",
      action: "select",
      value: "C",
    });

    const snapshots = result.script.steps.map((item) => item.snapshot as GraphSceneSnapshot);
    expect(snapshots.map((item) => item.current_node_id)).toEqual(["C", "A", "B"]);
    expect(snapshots[0].visited_node_ids).toEqual(["C"]);
    expect(snapshots[0].queue_node_ids).toEqual(["A"]);
    expect(snapshots[1].queue_node_ids).toEqual(["B"]);
    expect(result.summary).toContain("C → A → B → D");
    expect((base.steps[0].snapshot as GraphSceneSnapshot).current_node_id).toBeUndefined();
  });

  it("rejects commands that bypass the manifest", () => {
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
  });
});
