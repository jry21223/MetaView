import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MathPlotSnapshot, MetaStep } from "../types";
import { MathPlotRenderer } from "./MathPlotRenderer";
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

    fireEvent.keyDown(marker, { key: "ArrowRight" });
    expect(onInteraction).toHaveBeenCalledWith({
      type: "set-number",
      phase: "commit",
      step_id: "plot",
      target_role: "marker-x",
      value: 1.06,
    });
  });

  it("emits previews during a pointer gesture and one commit on release", () => {
    const events: RendererInteractionEvent[] = [];
    const view = render(
      <MathPlotRenderer {...rendererProps((event) => events.push(event))} />,
    );
    const marker = view.getByRole("slider", { name: "切点 x" });

    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 100, clientY: 100 });
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

    fireEvent.pointerDown(marker, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerCancel(marker, { pointerId: 2 });

    expect(events.at(-1)).toEqual({
      type: "set-number",
      phase: "cancel",
      step_id: "plot",
      target_role: "marker-x",
    });
    expect(events.some((event) => event.phase === "commit")).toBe(false);
  });
});
