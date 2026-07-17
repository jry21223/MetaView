import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InteractionSandboxPanel } from "./InteractionSandboxPanel";
import type { InteractionEvent, InteractionManifest } from "./types";

function derivativeManifest(value = 1): InteractionManifest {
  return {
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
        value,
      }],
    }],
  };
}

const firstEvent: InteractionEvent = {
  adapter_id: "math.derivative-tangent",
  step_id: "plot",
  target_id: "step:plot:marker-x",
  action: "set-value",
  value: 3,
  sequence: 1,
};

describe("InteractionSandboxPanel", () => {
  afterEach(cleanup);

  it("commits a range change only when the user finishes the gesture", () => {
    const onApply = vi.fn();
    const view = render(
      <InteractionSandboxPanel
        manifest={derivativeManifest()}
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

  it("syncs an external range value without remounting or losing focus", () => {
    const onApply = vi.fn();
    const props = {
      currentStepId: "plot",
      events: [] as InteractionEvent[],
      dirty: false,
      canUndo: false,
      lastError: null,
      onApply,
      onUndo: vi.fn(),
      onReset: vi.fn(),
    };
    const view = render(
      <InteractionSandboxPanel manifest={derivativeManifest()} {...props} />,
    );
    const slider = view.getByRole("slider", { name: "切点 x" });
    slider.focus();
    fireEvent.change(slider, { target: { value: "3" } });

    view.rerender(
      <InteractionSandboxPanel manifest={derivativeManifest(-2)} {...props} />,
    );

    const syncedSlider = view.getByRole("slider", { name: "切点 x" });
    expect(syncedSlider).toBe(slider);
    expect((syncedSlider as HTMLInputElement).value).toBe("-2");
    expect(document.activeElement).toBe(slider);
    fireEvent.pointerUp(syncedSlider);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("uses stable node ids and disables the selected BFS choice", () => {
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

    const selected = view.getByRole("button", { name: "Alpha" });
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(selected.hasAttribute("disabled")).toBe(true);
    fireEvent.click(selected);
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole("button", { name: "Beta" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ value: "B" }));
  });

  it("renders nothing when the current step has no declared binding or recovery state", () => {
    const { container } = render(
      <InteractionSandboxPanel
        manifest={derivativeManifest()}
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

  it("keeps undo and reset available after leaving the bound step", () => {
    const onUndo = vi.fn();
    const onReset = vi.fn();
    const view = render(
      <InteractionSandboxPanel
        manifest={derivativeManifest(3)}
        currentStepId="other"
        events={[firstEvent]}
        dirty
        canUndo
        lastError={null}
        onApply={vi.fn()}
        onUndo={onUndo}
        onReset={onReset}
      />,
    );

    expect(view.getByText(/当前步骤没有交互控件/)).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "撤销" }));
    fireEvent.click(view.getByRole("button", { name: "重置" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("allows reset when only an error remains", () => {
    const onReset = vi.fn();
    const view = render(
      <InteractionSandboxPanel
        manifest={derivativeManifest()}
        currentStepId="other"
        events={[]}
        dirty={false}
        canUndo={false}
        lastError="Interaction failed"
        onApply={vi.fn()}
        onUndo={vi.fn()}
        onReset={onReset}
      />,
    );

    const reset = view.getByRole("button", { name: "重置" });
    expect(reset.hasAttribute("disabled")).toBe(false);
    fireEvent.click(reset);
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
