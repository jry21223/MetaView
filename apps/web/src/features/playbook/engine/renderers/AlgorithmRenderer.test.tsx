import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AlgorithmRenderer } from "./AlgorithmRenderer";
import { DomainArrayRenderer } from "./DomainArrayRenderer";
import { rendererRegistry } from "./registry";
import type { AlgorithmArraySnapshot, MetaStep } from "../types";
import type { RendererProps } from "./types";

function arrayStep(
  snap: AlgorithmArraySnapshot,
  overrides: Partial<MetaStep> = {},
): MetaStep {
  return {
    step_id: "s1",
    end_frame: 60,
    title: "比较 arr[0] 和 arr[1]",
    voiceover_text: "现在比较前两个元素",
    snapshot: snap,
    tokens: [],
    ...overrides,
  };
}

function props(step: MetaStep, overrides: Partial<RendererProps> = {}): RendererProps {
  return {
    step,
    prevStep: null,
    frame: 90,
    stepStartFrame: 0,
    stepEndFrame: 60,
    progress: 1,
    theme: "dark",
    ...overrides,
  };
}

function render(snap: AlgorithmArraySnapshot, overrides: Partial<RendererProps> = {}): string {
  return renderToStaticMarkup(<AlgorithmRenderer {...props(arrayStep(snap), overrides)} />);
}

function defaultSnap(extra: Partial<AlgorithmArraySnapshot> = {}): AlgorithmArraySnapshot {
  return {
    kind: "algorithm_array",
    array_values: ["5", "3", "8", "1"],
    active_indices: [0, 1],
    swap_indices: [],
    sorted_indices: [],
    pointers: { i: 0, j: 1 },
    ...extra,
  };
}

describe("AlgorithmRenderer", () => {
  it("is registered for the algorithm_array snapshot kind", () => {
    expect(rendererRegistry.get("algorithm_array")).toBe(DomainArrayRenderer);
  });

  it("renders every array value as a labeled cell", () => {
    const markup = render(defaultSnap());
    for (const value of ["5", "3", "8", "1"]) {
      expect(markup, `expected value ${value} on screen`).toContain(`>${value}<`);
    }
  });

  it("renders the step title without duplicating shared subtitles", () => {
    const markup = render(defaultSnap());
    expect(markup).toContain("比较 arr[0] 和 arr[1]");
    expect(markup).not.toContain("现在比较前两个元素");
  });

  it("renders all configured pointers", () => {
    const markup = render(defaultSnap({ pointers: { i: 0, j: 2, pivot: 3 } }));
    expect(markup).toContain(">i<");
    expect(markup).toContain(">j<");
    expect(markup).toContain(">pivot<");
  });

  it("falls back to the narration string when the array is empty", () => {
    const markup = render(
      defaultSnap({
        array_values: [],
        active_indices: [],
        swap_indices: [],
        sorted_indices: [],
        pointers: {},
      }),
    );
    expect(markup).toContain("现在比较前两个元素"); // voiceover fallback
  });

  it("honours the light theme", () => {
    const dark = render(defaultSnap());
    const light = render(defaultSnap(), { theme: "light" });
    expect(dark).not.toBe(light); // visual diff between themes
    expect(light).toContain("var(--surface-2, #faf8f3)");
    expect(light).toContain("var(--canvas-focus, #b87824)");
    expect(light).not.toContain("#00896e");
    expect(light).not.toContain("#6030c0");
  });
});
