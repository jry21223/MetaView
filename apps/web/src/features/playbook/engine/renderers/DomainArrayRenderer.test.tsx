import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DomainArrayRenderer } from "./DomainArrayRenderer";
import { rendererRegistry } from "./registry";
import type { AlgorithmArraySnapshot, AlgorithmBarsSnapshot, MetaStep } from "../types";
import type { RendererProps } from "./types";

function arraySnap(extra: Partial<AlgorithmArraySnapshot> = {}): AlgorithmArraySnapshot {
  return {
    kind: "algorithm_array",
    array_values: ["F=10N", "m=2kg", "a=5m/s²"],
    active_indices: [2],
    swap_indices: [],
    sorted_indices: [],
    pointers: { target: 2 },
    ...extra,
  };
}

function barsSnap(extra: Partial<AlgorithmBarsSnapshot> = {}): AlgorithmBarsSnapshot {
  return {
    kind: "algorithm_bars",
    array_values: ["5", "3", "8"],
    numeric_values: [5, 3, 8],
    active_indices: [0],
    swap_indices: [],
    sorted_indices: [],
    pointers: {},
    ...extra,
  };
}

function step(snapshot: AlgorithmArraySnapshot | AlgorithmBarsSnapshot): MetaStep {
  return {
    step_id: "s1",
    end_frame: 90,
    title: "列出关键量",
    voiceover_text: "先把已知量和要求的量分开，避免把单位丢掉。",
    snapshot,
    tokens: [
      { id: "t0", label: "F=10N", emphasis: "secondary" },
      { id: "t1", label: "m=2kg", emphasis: "secondary" },
      { id: "t2", label: "a=5m/s²", emphasis: "primary" },
    ],
  };
}

function props(
  snapshot: AlgorithmArraySnapshot | AlgorithmBarsSnapshot,
  overrides: Partial<RendererProps> = {},
): RendererProps {
  return {
    step: step(snapshot),
    prevStep: null,
    frame: 120,
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "dark",
    domain: "physics",
    ...overrides,
  };
}

describe("DomainArrayRenderer", () => {
  it("is registered for array and bar snapshots", () => {
    expect(rendererRegistry.get("algorithm_array")).toBe(DomainArrayRenderer);
    expect(rendererRegistry.get("algorithm_bars")).toBe(DomainArrayRenderer);
  });

  it("renders physics arrays as quantity cards instead of algorithm cells", () => {
    const markup = renderToStaticMarkup(<DomainArrayRenderer {...props(arraySnap())} />);

    expect(markup).toContain("domain-array-renderer");
    expect(markup).toContain('data-domain="physics"');
    expect(markup).toContain("列出关键量");
    expect(markup).toContain("F=10N");
    expect(markup).toContain("a=5m/s²");
    expect(markup).toContain("避免把单位丢掉");
    expect(markup).toContain('data-emphasis="primary"');
    expect(markup).not.toContain(">target<");
  });

  it("delegates algorithm arrays to the existing algorithm renderer", () => {
    const markup = renderToStaticMarkup(
      <DomainArrayRenderer {...props(arraySnap(), { domain: "algorithm" })} />,
    );

    expect(markup).not.toContain("domain-array-renderer");
    expect(markup).toContain(">target<");
  });

  it("delegates code bars to the existing bar renderer", () => {
    const markup = renderToStaticMarkup(
      <DomainArrayRenderer {...props(barsSnap(), { domain: "code" })} />,
    );

    expect(markup).not.toContain("domain-array-renderer");
    expect(markup).toContain("var(--surface-2");
    expect(markup).toContain(">5<");
  });
});
