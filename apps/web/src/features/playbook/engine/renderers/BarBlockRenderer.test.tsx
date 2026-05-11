import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BarBlockRenderer } from "./BarBlockRenderer";
import { rendererRegistry } from "./registry";
import type { AlgorithmBarsSnapshot, MetaStep } from "../types";
import type { RendererProps } from "./types";

function barsStep(snapshot: AlgorithmBarsSnapshot): MetaStep {
  return {
    step_id: "s1",
    end_frame: 90,
    title: "排序步骤",
    voiceover_text: "比较相邻元素",
    snapshot,
    tokens: [],
  };
}

function props(step: MetaStep, overrides: Partial<RendererProps> = {}): RendererProps {
  return {
    step,
    prevStep: null,
    frame: 240, // past all entry animations
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "dark",
    ...overrides,
  };
}

function makeBars(values: number[], extra: Partial<AlgorithmBarsSnapshot> = {}): AlgorithmBarsSnapshot {
  return {
    kind: "algorithm_bars",
    array_values: values.map(String),
    numeric_values: values,
    active_indices: [],
    swap_indices: [],
    sorted_indices: [],
    pointers: {},
    ...extra,
  };
}

function heightsOf(markup: string): number[] {
  return [...markup.matchAll(/height:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
}

describe("BarBlockRenderer", () => {
  it("renders one bar per element with value and index labels", () => {
    const markup = renderToStaticMarkup(BarBlockRenderer(props(barsStep(makeBars([3, 9, 1])))));
    expect(markup).toContain(">3<");
    expect(markup).toContain(">9<");
    expect(markup).toContain(">1<");
    // index labels 0,1,2
    expect(markup).toContain(">0<");
    expect(markup).toContain(">2<");
  });

  it("bar height is proportional to element value", () => {
    const markup = renderToStaticMarkup(BarBlockRenderer(props(barsStep(makeBars([9, 3])))));
    const hs = heightsOf(markup);
    // tallest bar reaches the max bar height; the value-3 bar is one third of it
    expect(hs).toContain(360);
    expect(hs).toContain(120);
  });

  it("highlights active and sorted indices distinctly", () => {
    const snap = makeBars([5, 2, 8], { active_indices: [0], sorted_indices: [2] });
    const markup = renderToStaticMarkup(BarBlockRenderer(props(barsStep(snap))));
    // active highlight color (dark theme accent) and sorted checkmark present
    expect(markup).toContain("#ffd84d");
    expect(markup).toContain("✓");
  });

  it("renders the voiceover text when the array is empty", () => {
    const markup = renderToStaticMarkup(BarBlockRenderer(props(barsStep(makeBars([])))));
    expect(markup).toContain("比较相邻元素");
  });

  it("uses the light-theme background when theme is light", () => {
    const markup = renderToStaticMarkup(
      BarBlockRenderer(props(barsStep(makeBars([1, 2])), { theme: "light" })),
    );
    expect(markup).toContain("#f5f7fa");
  });

  it("is registered for the algorithm_bars snapshot kind", () => {
    expect(rendererRegistry.get("algorithm_bars")).toBe(BarBlockRenderer);
  });
});
