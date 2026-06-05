import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MetaStep, PlaybookScript, SolidGeometrySceneSnapshot } from "../types";
import { PlaybookComposition } from "../composition/PlaybookComposition";
import type { RendererProps } from "./types";
import { SolidGeometrySceneRenderer } from "./SolidGeometrySceneRenderer";
import { rendererRegistry } from "./registry";

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ fps: 30 }),
  };
});

function makeSnapshot(extra: Partial<SolidGeometrySceneSnapshot> = {}): SolidGeometrySceneSnapshot {
  return {
    kind: "solid_geometry_scene",
    points: [
      { label: "A", position: [0, 0, 0] },
      { label: "B", position: [2, 0, 0] },
      { label: "C", position: [2, 2, 0] },
      { label: "S", position: [1, 1, 3] },
    ],
    edges: [
      { start: "A", end: "B", label: "AB" },
      { start: "S", end: "A", label: "SA" },
    ],
    planes: [{ id: "ABC", vertices: ["A", "B", "C"], label: "平面 ABC" }],
    vectors: [{ id: "vector:SA", start: "S", end: "A", label: "\\vec{SA}" }],
    visible_elements: [],
    formula_latex: "\\theta=\\arcsin\\frac{3}{\\sqrt{11}}",
    caption: "向量法计算线面角",
    ...extra,
  };
}

function sceneStep(snapshot: SolidGeometrySceneSnapshot): MetaStep {
  return {
    step_id: "s1",
    end_frame: 90,
    title: "计算线面角",
    voiceover_text: "使用向量法",
    snapshot,
    tokens: [],
  };
}

function props(step: MetaStep, overrides: Partial<RendererProps> = {}): RendererProps {
  return {
    step,
    prevStep: null,
    frame: 90,
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "dark",
    ...overrides,
  };
}

function render(snapshot: SolidGeometrySceneSnapshot): string {
  return renderToStaticMarkup(<SolidGeometrySceneRenderer {...props(sceneStep(snapshot))} />);
}

function solidScript(snapshot = makeSnapshot()): PlaybookScript {
  return {
    fps: 30,
    total_frames: 90,
    domain: "math",
    title: "立体几何",
    summary: "向量法",
    parameter_controls: [],
    steps: [sceneStep(snapshot)],
  };
}

describe("SolidGeometrySceneRenderer", () => {
  it("is registered for the solid_geometry_scene snapshot kind", () => {
    expect(rendererRegistry.get("solid_geometry_scene")).toBe(SolidGeometrySceneRenderer);
  });

  it("renders points and edges", () => {
    const markup = render(makeSnapshot());
    expect(markup).toContain("solid-geometry-scene");
    expect(markup).toContain('data-solid-id="point:A"');
    expect(markup).toContain('data-solid-id="line:SA"');
    expect(markup).toContain("向量法计算线面角");
  });

  it("uses visible_elements to highlight matching geometry", () => {
    const markup = render(makeSnapshot({ visible_elements: ["line:SA", "plane:ABC"] }));
    expect(markup).toContain('data-solid-id="line:SA"');
    expect(markup).toContain('data-highlight="true"');
    expect(markup).toContain('data-solid-id="plane:ABC"');
  });

  it("does not crash on unknown point references", () => {
    const markup = render(makeSnapshot({
      edges: [{ start: "A", end: "Z", label: "AZ" }],
      vectors: [{ id: "vector:SZ", start: "S", end: "Z" }],
    }));
    expect(markup).toContain("solid-geometry-scene__svg");
    expect(markup).not.toContain('data-solid-id="line:AZ"');
  });

  it("renders through PlaybookComposition without unknown snapshot fallback", () => {
    const markup = renderToStaticMarkup(
      <PlaybookComposition script={solidScript()} showSubtitles={false} />,
    );
    expect(markup).toContain("solid-geometry-scene");
    expect(markup).not.toContain("Unknown snapshot kind");
  });
});
