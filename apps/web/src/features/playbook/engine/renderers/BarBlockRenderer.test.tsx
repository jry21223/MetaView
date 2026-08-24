import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BarBlockRenderer } from "./BarBlockRenderer";
import { DomainArrayRenderer } from "./DomainArrayRenderer";
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
    expect(hs).toContain(342);
    expect(hs).toContain(114);
  });

  it("keeps unchanged bars visible at the exact start of a later step", () => {
    const snap = makeBars([9, 3]);
    const previous = barsStep(snap);
    const markup = renderToStaticMarkup(BarBlockRenderer(props(barsStep(snap), {
      prevStep: previous,
      frame: 90,
      stepStartFrame: 90,
    })));

    expect(markup).toMatch(/data-bar-index="0"[^>]*opacity:1/);
    expect(markup).toContain("height:342px");
  });

  it("uses a signed zero axis for negative values and still supports range overlays", () => {
    const snap = makeBars([-3, -1, 3], {
      element_states: {
        0: ["leaving"],
        1: ["entering", "pivot"],
        2: ["maximum"],
      },
      ranges: [{
        id: "search",
        start: 0,
        end: 2,
        role: "search_range",
        label: "search range",
      }],
    });
    const markup = renderToStaticMarkup(BarBlockRenderer(props(barsStep(snap))));

    expect(markup.match(/data-bar-direction="negative"/g)).toHaveLength(2);
    expect(markup.match(/data-bar-direction="positive"/g)).toHaveLength(1);
    expect(markup).toContain('data-zero-axis="180"');
    expect(markup).toContain("height:180px");
    expect(markup).toContain("height:60px");
    expect(markup).toContain('data-range-role="search_range"');
    expect(markup).toContain('data-element-states="leaving"');
    expect(markup).toContain('data-element-states="entering pivot"');
    expect(markup).toContain('data-element-states="maximum"');
    expect(markup).toContain(">PIVOT<");
    expect(markup).toContain(">MAX<");
    expect(markup).toContain('data-value-label-position="inside-negative"');
  });

  it("places a short negative value label above the zero axis instead of over its index", () => {
    const markup = renderToStaticMarkup(
      BarBlockRenderer(props(barsStep(makeBars([-1, 20])))),
    );

    expect(markup).toContain('data-value-label-position="above-short-negative"');
  });

  it("highlights active and sorted indices via the theme accent variable", () => {
    const snap = makeBars([5, 2, 8], { active_indices: [0], sorted_indices: [2] });
    const markup = renderToStaticMarkup(BarBlockRenderer(props(barsStep(snap))));
    // Colors flow through CSS vars so theme + accent changes take effect live
    expect(markup).toContain("var(--accent");
    expect(markup).toContain("✓");
  });

  it("renders the voiceover text when the array is empty", () => {
    const markup = renderToStaticMarkup(BarBlockRenderer(props(barsStep(makeBars([])))));
    expect(markup).toContain("比较相邻元素");
  });

  it("uses CSS variables so theme switches re-style without re-rendering", () => {
    const dark = renderToStaticMarkup(BarBlockRenderer(props(barsStep(makeBars([1, 2])))));
    const light = renderToStaticMarkup(
      BarBlockRenderer(props(barsStep(makeBars([1, 2])), { theme: "light" })),
    );
    // Both themes resolve background through the same --surface-2 var
    expect(dark).toContain("var(--surface-2");
    expect(light).toContain("var(--surface-2");
    // Theme-specific fallbacks are kept for SSR / no-CSS-var environments
    expect(dark).toContain("#0e1412");
    expect(light).toContain("#faf8f3");
  });

  it("renders flat 2D bars without fake 3D faces", () => {
    const markup = renderToStaticMarkup(BarBlockRenderer(props(barsStep(makeBars([5, 2, 8])))));
    // The old renderer used skewX/skewY to fake top + side faces.
    expect(markup).not.toMatch(/skew[XY]\(/);
  });

  it("anchors binary-search pointers to the center of their indexed bars", () => {
    const snap = makeBars([2, 4, 7, 11, 15, 19, 22, 28, 33, 40], {
      pointers: { low: 0, mid: 4, high: 9 },
    });
    const markup = renderToStaticMarkup(BarBlockRenderer(props(barsStep(snap))));

    expect(markup).toContain('data-pointer-index="0"');
    expect(markup).toContain('data-pointer-index="4"');
    expect(markup).toContain('data-pointer-index="9"');
    expect(markup).toContain('left:36px');
    expect(markup).toContain('left:372px');
    expect(markup).toContain('left:792px');
    expect(markup).toContain('transform:translateX(-50%)');
  });

  it("groups pointer labels that share the same bar", () => {
    const snap = makeBars([2, 4, 7], {
      pointers: { high: 1, low: 1, mid: 1 },
    });
    const markup = renderToStaticMarkup(BarBlockRenderer(props(barsStep(snap))));

    expect(markup.match(/data-pointer-index="1"/g)).toHaveLength(1);
    expect(markup).toContain("low · mid · high");
  });

  it("is registered for the algorithm_bars snapshot kind", () => {
    expect(rendererRegistry.get("algorithm_bars")).toBe(DomainArrayRenderer);
  });
});
