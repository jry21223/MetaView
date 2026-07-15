import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  GraphSceneSnapshot,
  MathPlotSnapshot,
  PlaybookScript,
} from "../engine/types";
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

const graph: GraphSceneSnapshot = {
  kind: "graph_scene",
  nodes: [{ id: "A", label: "A" }, { id: "B", label: "B" }],
  edges: [{ id: "AB", source: "A", target: "B" }],
  directed: false,
};

function mixedScript(): PlaybookScript {
  const math = script();
  return {
    ...math,
    algorithm_id: "bfs",
    total_frames: 60,
    steps: [
      math.steps[0],
      {
        step_id: "graph",
        end_frame: 60,
        title: "Graph",
        voiceover_text: "",
        snapshot: graph,
        tokens: [],
      },
    ],
  };
}

const moveMarker = (value: number) => ({
  adapter_id: "math.derivative-tangent" as const,
  step_id: "plot",
  target_id: "step:plot:marker-x",
  action: "set-value" as const,
  value,
});

describe("useInteractionSandbox", () => {
  it("applies, undoes, and resets interactions without mutating the base script", () => {
    const base = script();
    const { result } = renderHook(() => useInteractionSandbox(base));

    act(() => result.current.apply(moveMarker(3)));

    expect(result.current.dirty).toBe(true);
    expect(result.current.events).toHaveLength(1);
    expect((result.current.previewScript.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(3);
    expect((base.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(1);

    act(() => result.current.undo());
    expect(result.current.dirty).toBe(false);
    expect((result.current.previewScript.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(1);

    act(() => result.current.apply(moveMarker(2)));
    act(() => result.current.reset());
    expect(result.current.events).toEqual([]);
    expect((result.current.previewScript.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(1);
  });

  it("renders transient previews without recording pointer movement", () => {
    const base = script();
    const { result } = renderHook(() => useInteractionSandbox(base));

    act(() => result.current.preview(moveMarker(2)));

    expect((result.current.previewScript.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(2);
    expect(result.current.events).toEqual([]);
    expect(result.current.dirty).toBe(false);

    act(() => result.current.cancelPreview());
    expect((result.current.previewScript.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(1);
    expect(result.current.events).toEqual([]);
  });

  it("keeps a rejected command out of the event history", () => {
    const base = script();
    const { result } = renderHook(() => useInteractionSandbox(base));

    act(() => result.current.apply({
      ...moveMarker(3),
      target_id: "raw-dom-selector",
    }));

    expect(result.current.dirty).toBe(false);
    expect(result.current.events).toEqual([]);
    expect(result.current.lastError).toContain("not declared by the manifest");
  });

  it("keeps the valid preview and history when a later command fails", () => {
    const base = script();
    const { result } = renderHook(() => useInteractionSandbox(base));

    act(() => result.current.apply(moveMarker(3)));
    act(() => result.current.apply({
      ...moveMarker(4),
      target_id: "raw-dom-selector",
    }));

    expect(result.current.events).toHaveLength(1);
    expect(result.current.dirty).toBe(true);
    expect((result.current.previewScript.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(3);
    expect(result.current.lastError).toContain("not declared by the manifest");
  });

  it("preserves history when an equivalent base script gets a new object identity", () => {
    const first = script(1);
    const equivalent = JSON.parse(JSON.stringify(first)) as PlaybookScript;
    const { result, rerender } = renderHook(
      ({ base }) => useInteractionSandbox(base),
      { initialProps: { base: first } },
    );

    act(() => result.current.apply(moveMarker(3)));
    rerender({ base: equivalent });

    expect(result.current.dirty).toBe(true);
    expect(result.current.events).toHaveLength(1);
    expect((result.current.previewScript.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(3);
  });

  it("drops sandbox history when the base script content changes", () => {
    const first = script(1);
    const second = script(-2);
    const { result, rerender } = renderHook(
      ({ base }) => useInteractionSandbox(base),
      { initialProps: { base: first } },
    );

    act(() => result.current.apply(moveMarker(3)));
    rerender({ base: second });

    expect(result.current.dirty).toBe(false);
    expect((result.current.previewScript.steps[0].snapshot as MathPlotSnapshot).marker_x).toBe(-2);
  });

  it("clears the latest BFS replay after a successful non-BFS event", () => {
    const base = mixedScript();
    const { result } = renderHook(() => useInteractionSandbox(base));

    act(() => result.current.apply({
      adapter_id: "algorithm.bfs",
      step_id: "graph",
      target_id: "step:graph:start-node",
      action: "select",
      value: "B",
    }));
    expect(result.current.latestReplay?.start_node_id).toBe("B");

    act(() => result.current.apply(moveMarker(3)));
    expect(result.current.latestReplay).toBeNull();
    expect(result.current.events).toHaveLength(2);
  });
});
