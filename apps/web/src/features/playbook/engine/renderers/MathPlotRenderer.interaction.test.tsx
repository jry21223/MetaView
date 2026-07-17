import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MathPlotSnapshot, MetaStep } from "../types";
import { MathPlotRenderer } from "./MathPlotRenderer";
import { pointerDomainX } from "./mathPlotInteraction";
import type { RendererInteractionEvent, RendererProps } from "./types";

const snapshot: MathPlotSnapshot = {
  kind: "math_plot",
  curves: [
    { expression: "x^2", semantic_role: "curve" },
    { expression: "2*x - 1", semantic_role: "tangent", emphasis: "accent" },
  ],
  x_min: -3,
  x_max: 3,
  y_min: -1,
  y_max: 10,
  marker_x: 1,
  x_label: "x",
  y_label: "y",
};

const step: MetaStep = {
  step_id: "plot",
  end_frame: 90,
  title: "Derivative",
  voiceover_text: "",
  snapshot,
  tokens: [],
};

function rendererProps(
  onInteraction: (event: RendererInteractionEvent) => void,
): RendererProps {
  return {
    step,
    prevStep: null,
    frame: 90,
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "light",
    onInteraction,
  };
}

describe("MathPlotRenderer interaction", () => {
  afterEach(cleanup);

  it("exposes the tangent marker as a semantic keyboard slider", () => {
    const onInteraction = vi.fn();
    const view = render(<MathPlotRenderer {...rendererProps(onInteraction)} />);
    const marker = view.getByRole("slider", { name: "切点 x" });

    expect(marker.getAttribute("data-interaction-target")).toBe("marker-x");
    expect(marker.getAttribute("aria-valuenow")).toBe("1");
    expect(marker.style.pointerEvents).toBe("all");
    expect(marker.querySelector('[data-interaction-hit-target="marker-x"]')).toBeTruthy();

    const globalKeyDown = vi.fn();
    document.addEventListener("keydown", globalKeyDown);
    fireEvent.keyDown(marker, { key: "ArrowRight", bubbles: true });
    document.removeEventListener("keydown", globalKeyDown);
    expect(onInteraction).toHaveBeenCalledWith({
      type: "set-number",
      phase: "commit",
      step_id: "plot",
      target_role: "marker-x",
      value: 1.06,
    });
    expect(globalKeyDown).not.toHaveBeenCalled();
  });

  it("emits previews during a pointer gesture and one commit on release", () => {
    const events: RendererInteractionEvent[] = [];
    const view = render(
      <MathPlotRenderer {...rendererProps((event) => events.push(event))} />,
    );
    const marker = view.getByRole("slider", { name: "切点 x" });

    fireEvent.pointerDown(marker, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(marker, { pointerId: 1, clientX: 140, clientY: 100 });
    fireEvent.pointerUp(marker, { pointerId: 1, clientX: 160, clientY: 100 });

    expect(events.map((event) => event.phase)).toEqual(["preview", "preview", "commit"]);
    expect(events.filter((event) => event.phase === "commit")).toHaveLength(1);
  });

  it("cancels a pointer gesture without committing it", () => {
    const events: RendererInteractionEvent[] = [];
    const view = render(
      <MathPlotRenderer {...rendererProps((event) => events.push(event))} />,
    );
    const marker = view.getByRole("slider", { name: "切点 x" });

    fireEvent.pointerDown(marker, {
      pointerId: 2,
      button: 0,
      isPrimary: true,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerCancel(marker, { pointerId: 2 });

    expect(events.at(-1)).toEqual({
      type: "set-number",
      phase: "cancel",
      step_id: "plot",
      target_role: "marker-x",
    });
    expect(events.some((event) => event.phase === "commit")).toBe(false);
  });

  it("ignores secondary and mismatched pointers and cancels lost capture", () => {
    const events: RendererInteractionEvent[] = [];
    const view = render(
      <MathPlotRenderer {...rendererProps((event) => events.push(event))} />,
    );
    const marker = view.getByRole("slider", { name: "切点 x" });

    fireEvent.pointerDown(marker, { pointerId: 8, button: 2, clientX: 100 });
    fireEvent.pointerDown(marker, {
      pointerId: 9,
      button: 0,
      isPrimary: false,
      clientX: 100,
    });
    expect(events).toEqual([]);

    fireEvent.pointerDown(marker, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      clientX: 100,
    });
    fireEvent.pointerMove(marker, { pointerId: 2, clientX: 200 });
    fireEvent.pointerUp(marker, { pointerId: 2, clientX: 200 });
    expect(events.map((event) => event.phase)).toEqual(["preview"]);

    fireEvent.lostPointerCapture(marker, { pointerId: 1 });
    expect(events.at(-1)?.phase).toBe("cancel");
    expect(events.some((event) => event.phase === "commit")).toBe(false);
  });

  it("cancels a transient gesture when the renderer unmounts", () => {
    const events: RendererInteractionEvent[] = [];
    const view = render(
      <MathPlotRenderer {...rendererProps((event) => events.push(event))} />,
    );
    const marker = view.getByRole("slider", { name: "切点 x" });

    fireEvent.pointerDown(marker, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      clientX: 100,
    });
    view.unmount();

    expect(events.map((event) => event.phase)).toEqual(["preview", "cancel"]);
  });

  it("cancels a transient gesture when direct interaction is disabled", () => {
    const events: RendererInteractionEvent[] = [];
    const props = rendererProps((event) => events.push(event));
    const view = render(<MathPlotRenderer {...props} />);
    const marker = view.getByRole("slider", { name: "切点 x" });

    fireEvent.pointerDown(marker, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      clientX: 100,
    });
    view.rerender(<MathPlotRenderer {...props} onInteraction={undefined} />);

    expect(events.map((event) => event.phase)).toEqual(["preview", "cancel"]);
    expect(view.queryByRole("slider", { name: "切点 x" })).toBeNull();
  });

  it("maps letterboxed SVG coordinates and clamps them when matrix inversion fails", () => {
    const svg = {
      getScreenCTM: () => ({ inverse: () => { throw new Error("singular"); } }),
      createSVGPoint: () => ({
        x: 0,
        y: 0,
        matrixTransform: () => ({ x: Number.NaN }),
      }),
      getBoundingClientRect: () => ({
        left: 20,
        top: 10,
        width: 1200,
        height: 560,
        right: 1220,
        bottom: 570,
        x: 20,
        y: 10,
        toJSON: () => ({}),
      }),
    } as unknown as SVGSVGElement;

    // xMidYMid meet renders the 1000-wide viewBox centered with 100px side bars.
    expect(pointerDomainX(svg, 20 + 100 + 56, 0, -3, 3)).toBeCloseTo(-3);
    expect(pointerDomainX(svg, 20 + 100 + 56 + 916, 0, -3, 3)).toBeCloseTo(3);
    expect(pointerDomainX(svg, -500, 0, -3, 3)).toBe(-3);
    expect(pointerDomainX(svg, 5000, 0, -3, 3)).toBe(3);
  });
});
