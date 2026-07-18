import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// BinaryTreeRenderer pulls useVideoConfig from remotion to size its SVG; outside
// a real <Composition/> that throws. Stub the runtime hooks so we can render
// statically. Mirrors the pattern PlaybookComposition.test.tsx already uses.
vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({
      fps: 30,
      width: 960,
      height: 540,
      durationInFrames: 600,
    }),
    spring: () => 1,
  };
});

import { BinaryTreeRenderer } from "./BinaryTreeRenderer";
import { rendererRegistry } from "./registry";
import type { AlgorithmTreeSnapshot, MetaStep } from "../types";
import type { RendererProps } from "./types";

function treeStep(snap: AlgorithmTreeSnapshot): MetaStep {
  return {
    step_id: "s1",
    end_frame: 60,
    title: "中序遍历",
    voiceover_text: "访问左子树后访问根",
    snapshot: snap,
    tokens: [],
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

function render(snap: AlgorithmTreeSnapshot, overrides: Partial<RendererProps> = {}): string {
  return renderToStaticMarkup(<BinaryTreeRenderer {...props(treeStep(snap), overrides)} />);
}

function defaultSnap(extra: Partial<AlgorithmTreeSnapshot> = {}): AlgorithmTreeSnapshot {
  return {
    kind: "algorithm_tree",
    nodes: [
      { id: "n1", label: "10" },
      { id: "n2", label: "5" },
      { id: "n3", label: "15" },
    ],
    edges: [
      { from_id: "n1", to_id: "n2" },
      { from_id: "n1", to_id: "n3" },
    ],
    active_node_ids: ["n1"],
    visited_node_ids: [],
    path_edge_ids: [],
    ...extra,
  };
}

describe("BinaryTreeRenderer", () => {
  it("is registered for the algorithm_tree snapshot kind", () => {
    expect(rendererRegistry.get("algorithm_tree")).toBe(BinaryTreeRenderer);
  });

  it("renders every node label", () => {
    const markup = render(defaultSnap());
    for (const label of ["10", "5", "15"]) {
      expect(markup).toContain(`>${label}<`);
    }
  });

  it("draws an SVG canvas for nodes and edges", () => {
    const markup = render(defaultSnap());
    expect(markup).toContain("<svg");
  });

  it("falls back gracefully when the tree has no nodes", () => {
    const markup = render(
      defaultSnap({ nodes: [], edges: [], active_node_ids: [] }),
    );
    // Renderer must not throw on the degenerate case; assert it produced output.
    expect(markup.length).toBeGreaterThan(0);
  });

  it("supports both light and dark themes", () => {
    const light = render(defaultSnap(), { theme: "light" });
    expect(light).toContain("var(--surface-2, #faf8f3)");
    expect(light).toContain("var(--canvas-focus, #b87824)");
    expect(light).not.toContain("#6030c0");
    expect(() => render(defaultSnap(), { theme: "dark" })).not.toThrow();
  });
});
