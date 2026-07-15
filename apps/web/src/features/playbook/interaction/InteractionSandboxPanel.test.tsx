import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InteractionSandboxPanel } from "./InteractionSandboxPanel";
import type { InteractionManifest } from "./types";

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
  afterEach(cleanup);

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
        onApply={onApply}
        onUndo={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Beta" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ value: "B" }));
    expect(view.getByRole("button", { name: "Alpha" }).getAttribute("aria-pressed")).toBe("true");
    expect((view.getByRole("button", { name: "Alpha" }) as HTMLButtonElement).disabled).toBe(true);
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
        onApply={vi.fn()}
        onUndo={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("keeps recovery controls available after navigating to an unbound step", () => {
    const onReset = vi.fn();
    const view = render(
      <InteractionSandboxPanel
        manifest={derivativeManifest}
        currentStepId="other"
        events={[]}
        dirty
        canUndo
        lastError={null}
        onApply={vi.fn()}
        onUndo={vi.fn()}
        onReset={onReset}
      />,
    );

    expect(view.getByText(/当前步骤没有交互控件/)).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "重置" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("allows an error-only sandbox to be reset", () => {
    const onReset = vi.fn();
    const view = render(
      <InteractionSandboxPanel
        manifest={derivativeManifest}
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

    const reset = view.getByRole("button", { name: "重置" }) as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    fireEvent.click(reset);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("syncs an externally committed range value without replacing the focused control", () => {
    const props = {
      currentStepId: "plot",
      events: [],
      dirty: false,
      canUndo: false,
      lastError: null,
      onApply: vi.fn(),
      onUndo: vi.fn(),
      onReset: vi.fn(),
    };
    const view = render(
      <InteractionSandboxPanel manifest={derivativeManifest} {...props} />,
    );
    const slider = view.getByRole("slider", { name: "切点 x" }) as HTMLInputElement;
    slider.focus();
    fireEvent.change(slider, { target: { value: "3" } });
    expect(slider.value).toBe("3");

    const updated: InteractionManifest = {
      ...derivativeManifest,
      adapters: derivativeManifest.adapters.map((adapter) => ({
        ...adapter,
        bindings: adapter.bindings.map((binding) => ({ ...binding, value: -2 })),
      })),
    };
    view.rerender(<InteractionSandboxPanel manifest={updated} {...props} />);

    expect(view.getByRole("slider", { name: "切点 x" })).toBe(slider);
    expect(slider.value).toBe("-2");
    expect(document.activeElement).toBe(slider);
  });
});
