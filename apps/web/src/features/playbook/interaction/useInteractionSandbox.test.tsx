import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GraphSceneSnapshot, MathPlotSnapshot, PlaybookScript } from "../engine/types";
import { useInteractionSandbox } from "./useInteractionSandbox";

function plot(markerX = 1): MathPlotSnapshot {
  return {
    kind: "math_plot",
    curves: [
      { expression: "x^2", semantic_role: "curve" },
      { expression: "2*x - 1", semantic_role: "tangent", emphasis: "accent" },
    ],
    x_min: -5,
    x_max: 5,
    y_min: -1,
    y_max: 25,
    marker_x: markerX,
    x_label: "x",
    y_label: "y",
  };
}

function script(markerX = 1): PlaybookScript {
  return {
    fps: 30,
    total_frames: 30,
    domain: "math",
    title: "Derivative sandbox",
    summary: "",
    parameter_controls: [],
    steps: [{
      step_id: "plot",
      end_frame: 30,
      title: "Tangent",
      voiceover_text: "",
      snapshot: plot(markerX),
      tokens: [],
    }],
  };
}

function bfsScript(): PlaybookScript {
  const graph: GraphSceneSnapshot = {
    kind: "graph_scene",
    nodes: [{ id: "A" }, { id: "B" }, { id: "C" }],
    edges: [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ],
    directed: false,
  };
  return {
    fps: 30,
    total_frames: 30,
    domain: "algorithm",
    algorithm_id: "bfs",
    title: "BFS sandbox",
    summary: "",
    parameter_controls: [],
    steps: [{
      step_id: "graph",
      end_frame: 30,
      title: "BFS",
      voiceover_text: "",
      snapshot: graph,
      tokens: [],
    }],
  };
}

describe("useInteractionSandbox", () => {
  it("applies, undoes, and resets interactions without mutating the base script", () => {
    const base = script();
    const { result } = renderHook(() => useInteractionSandbox(base));

    act(() => result.current.apply({
      adapter_id: "math.derivative-tangent",
      step_id: "plot",
      target_id: "step:plot:marker-x",
      action: "set-value",
      value: 3,
    }));

    expect(result.current.dirty).toBe(true);
    expect(result.current.events).toHaveLength(1);
    expect((result.current.previewScript.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(3);
    expect((base.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(1);

    act(() => result.current.undo());
    expect(result.current.dirty).toBe(false);
    expect((result.current.previewScript.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(1);

    act(() => result.current.apply({
      adapter_id: "math.derivative-tangent",
      step_id: "plot",
      target_id: "step:plot:marker-x",
      action: "set-value",
      value: 2,
    }));
    act(() => result.current.reset());
    expect(result.current.events).toEqual([]);
    expect((result.current.previewScript.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(1);
  });

  it("renders transient previews without recording pointer movement", () => {
    const { result } = renderHook(() => useInteractionSandbox(script()));

    act(() => result.current.preview({
      adapter_id: "math.derivative-tangent",
      step_id: "plot",
      target_id: "step:plot:marker-x",
      action: "set-value",
      value: 2,
    }));

    expect((result.current.previewScript.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(2);
    expect(result.current.events).toEqual([]);
    expect(result.current.dirty).toBe(false);

    act(() => result.current.cancelPreview());
    expect((result.current.previewScript.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(1);
    expect(result.current.events).toEqual([]);
  });

  it("previews BFS replay frames without adding history events", () => {
    const base = bfsScript();
    const { result } = renderHook(() => useInteractionSandbox(base));

    act(() => result.current.apply({
      adapter_id: "algorithm.bfs",
      step_id: "graph",
      target_id: "step:graph:start-node",
      action: "select",
      value: "C",
    }));

    const replay = result.current.latestReplay;
    expect(replay?.visit_order).toEqual(["C", "B", "A"]);
    expect(result.current.events).toHaveLength(1);

    act(() => result.current.showReplayFrame(replay!, 2));
    expect(
      (result.current.previewScript.steps[0].snapshot as GraphSceneSnapshot).current_node_id,
    ).toBe("A");
    expect(result.current.events).toHaveLength(1);
  });

  it("keeps a rejected command out of the event history", () => {
    const base = script();
    const { result } = renderHook(() => useInteractionSandbox(base));

    act(() => result.current.apply({
      adapter_id: "math.derivative-tangent",
      step_id: "plot",
      target_id: "raw-dom-selector",
      action: "set-value",
      value: 3,
    }));

    expect(result.current.dirty).toBe(false);
    expect(result.current.events).toEqual([]);
    expect(result.current.lastError).toContain("not declared by the manifest");
  });

  it("drops sandbox history when the base script changes", () => {
    const first = script(1);
    const second = script(-2);
    const { result, rerender } = renderHook(
      ({ base }) => useInteractionSandbox(base),
      { initialProps: { base: first } },
    );

    act(() => result.current.apply({
      adapter_id: "math.derivative-tangent",
      step_id: "plot",
      target_id: "step:plot:marker-x",
      action: "set-value",
      value: 3,
    }));
    rerender({ base: second });

    expect(result.current.dirty).toBe(false);
    expect((result.current.previewScript.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(-2);
  });
});
