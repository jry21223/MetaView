import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InteractionSandboxPanel } from "./InteractionSandboxPanel";
import type { BfsInteractionReplay, InteractionManifest } from "./types";

const derivativeManifest: InteractionManifest = {
  version: "1",
  adapters: [{
    adapter_id: "math.derivative-tangent",
    experimental: true,
    bindings: [{
      id: "step:plot:marker-x",
      adapter_id: "math.derivative-tangent",
      step_id: "plot",
      target_role: "marker-x",
      action: "set-value",
      label: "切点 x",
      min: -5,
      max: 5,
      value: 1,
    }],
  }],
};

describe("InteractionSandboxPanel", () => {
  it("commits a range change only when the user finishes the gesture", () => {
    const onApply = vi.fn();
    const view = render(
      <InteractionSandboxPanel
        manifest={derivativeManifest}
        currentStepId="plot"
        events={[]}
        dirty={false}
        canUndo={false}
        lastError={null}
        latestReplay={null}
        onShowReplayFrame={vi.fn()}
        onApply={onApply}
        onUndo={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    const slider = view.getByRole("slider", { name: "切点 x" });

    fireEvent.change(slider, { target: { value: "3" } });
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider);
    expect(onApply).toHaveBeenCalledWith({
      adapter_id: "math.derivative-tangent",
      step_id: "plot",
      target_id: "step:plot:marker-x",
      action: "set-value",
      value: 3,
    });
  });

  it("uses stable node ids for BFS selection", () => {
    const onApply = vi.fn();
    const manifest: InteractionManifest = {
      version: "1",
      adapters: [{
        adapter_id: "algorithm.bfs",
        experimental: true,
        bindings: [{
          id: "step:graph:start-node",
          adapter_id: "algorithm.bfs",
          step_id: "graph",
          target_role: "start-node",
          action: "select",
          label: "BFS 起点",
          value: "A",
          options: [{ id: "A", label: "Alpha" }, { id: "B", label: "Beta" }],
        }],
      }],
    };
    const view = render(
      <InteractionSandboxPanel
        manifest={manifest}
        currentStepId="graph"
        events={[]}
        dirty={false}
        canUndo={false}
        lastError={null}
        latestReplay={null}
        onShowReplayFrame={vi.fn()}
        onApply={onApply}
        onUndo={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Beta" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ value: "B" }));
    expect(view.getByRole("button", { name: "Alpha" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("steps through a prepared BFS replay without creating commands", () => {
    const onApply = vi.fn();
    const onShowReplayFrame = vi.fn();
    const graph = {
      kind: "graph_scene" as const,
      nodes: [{ id: "A" }, { id: "B" }],
      edges: [{ source: "A", target: "B" }],
    };
    const replay: BfsInteractionReplay = {
      adapter_id: "algorithm.bfs",
      step_id: "graph",
      start_node_id: "A",
      visit_order: ["A", "B"],
      frames: [
        {
          index: 0,
          current_node_id: "A",
          visited_node_ids: ["A"],
          queue_node_ids: ["B"],
          snapshot: { ...graph, current_node_id: "A" },
        },
        {
          index: 1,
          current_node_id: "B",
          visited_node_ids: ["A", "B"],
          queue_node_ids: [],
          snapshot: { ...graph, current_node_id: "B" },
        },
      ],
    };
    const manifest: InteractionManifest = {
      version: "1",
      adapters: [{
        adapter_id: "algorithm.bfs",
        experimental: true,
        bindings: [{
          id: "step:graph:start-node",
          adapter_id: "algorithm.bfs",
          step_id: "graph",
          target_role: "start-node",
          action: "select",
          label: "BFS 起点",
          value: "A",
          options: [{ id: "A", label: "A" }, { id: "B", label: "B" }],
        }],
      }],
    };
    const view = render(
      <InteractionSandboxPanel
        manifest={manifest}
        currentStepId="graph"
        events={[]}
        dirty
        canUndo
        lastError={null}
        latestReplay={replay}
        onShowReplayFrame={onShowReplayFrame}
        onApply={onApply}
        onUndo={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "下一帧" }));
    expect(onShowReplayFrame).toHaveBeenCalledWith(replay, 1);
    expect(onApply).not.toHaveBeenCalled();
    expect(view.getByText("重放 2 / 2")).toBeTruthy();
  });

  it("renders nothing when the current step has no declared binding", () => {
    const { container } = render(
      <InteractionSandboxPanel
        manifest={derivativeManifest}
        currentStepId="other"
        events={[]}
        dirty={false}
        canUndo={false}
        lastError={null}
        latestReplay={null}
        onShowReplayFrame={vi.fn()}
        onApply={vi.fn()}
        onUndo={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
